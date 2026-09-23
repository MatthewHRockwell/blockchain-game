import test from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import generateTypedAuth from "../commons/auth.mjs"
import { createChallenge, verifyAuthorization } from "../server/auth.js"

const require = createRequire(import.meta.url)
const { ethers } = require("../server/node_modules/ethers")


test("valid local development signature is accepted", async () => {
  const authRequest = new Map()
  const wallet = ethers.Wallet.createRandom()
  const address = await wallet.getAddress()
  const challenge = createChallenge(authRequest, address)
  const { domain, types, value } = generateTypedAuth(challenge)
  const sig = await wallet._signTypedData(domain, types, value)

  const result = verifyAuthorization(`${address} ${sig}`, { authRequest, logger: silentLogger })
  assert.deepEqual(result, { address })
  assert.equal(authRequest.has(address), false)
})

test("invalid local development signature is rejected", async () => {
  const authRequest = new Map()
  const wallet = ethers.Wallet.createRandom()
  const attacker = ethers.Wallet.createRandom()
  const address = await wallet.getAddress()
  const challenge = createChallenge(authRequest, address)
  const { domain, types, value } = generateTypedAuth(challenge)
  const badSig = await attacker._signTypedData(domain, types, value)

  const result = verifyAuthorization(`${address} ${badSig}`, { authRequest, logger: silentLogger })
  assert.equal(result, false)
  assert.equal(authRequest.has(address), false)
})

test("a valid signature is accepted even while a session is still registered", async () => {
  // Authorization is ownership, not exclusivity. A player who refreshes supersedes
  // their own stale session instead of being refused for the ~13s WebRTC takes to
  // report the old peer gone. server/sessions.js does the superseding.
  const authRequest = new Map()
  const wallet = ethers.Wallet.createRandom()
  const address = await wallet.getAddress()
  const challenge = createChallenge(authRequest, address)
  const { domain, types, value } = generateTypedAuth(challenge)
  const sig = await wallet._signTypedData(domain, types, value)

  const result = verifyAuthorization(`${address} ${sig}`, { authRequest, logger: silentLogger })
  assert.deepEqual(result, { address })
})

test("a reconnect still needs a fresh challenge", async () => {
  // The challenge is single-use, so a replayed token cannot take a session over.
  const authRequest = new Map()
  const wallet = ethers.Wallet.createRandom()
  const address = await wallet.getAddress()
  const challenge = createChallenge(authRequest, address)
  const { domain, types, value } = generateTypedAuth(challenge)
  const sig = await wallet._signTypedData(domain, types, value)

  assert.deepEqual(verifyAuthorization(`${address} ${sig}`, { authRequest, logger: silentLogger }), { address })
  assert.equal(verifyAuthorization(`${address} ${sig}`, { authRequest, logger: silentLogger }), false)
})

const silentLogger = { log() {} }

test("a challenge is only issued for a real address", async () => {
  // POST /challenge is the one unauthenticated public input; it used to key the map
  // on whatever the request body contained.
  const authRequest = new Map()
  for (const bad of ["", "   ", "not-an-address", "0x123", "0x" + "z".repeat(40), null, undefined, 42, {}]) {
    assert.equal(createChallenge(authRequest, bad), null, JSON.stringify(bad))
  }
  assert.equal(authRequest.size, 0, "nothing should have been stored")

  const wallet = ethers.Wallet.createRandom()
  const address = await wallet.getAddress()
  assert.equal(typeof createChallenge(authRequest, address), "string")
  assert.equal(authRequest.size, 1)
})

test("an expired challenge is refused", async () => {
  const authRequest = new Map()
  const wallet = ethers.Wallet.createRandom()
  const address = await wallet.getAddress()

  const challenge = createChallenge(authRequest, address, { now: 0, ttlMs: 1000 })
  const { domain, types, value } = generateTypedAuth(challenge)
  const sig = await wallet._signTypedData(domain, types, value)

  const expired = verifyAuthorization(`${address} ${sig}`, { authRequest, now: 5000, logger: silentLogger })
  assert.equal(expired, false)
  assert.equal(authRequest.has(address), false, "an expired challenge is still consumed")
})

test("a challenge inside its window is accepted", async () => {
  const authRequest = new Map()
  const wallet = ethers.Wallet.createRandom()
  const address = await wallet.getAddress()

  const challenge = createChallenge(authRequest, address, { now: 0, ttlMs: 1000 })
  const { domain, types, value } = generateTypedAuth(challenge)
  const sig = await wallet._signTypedData(domain, types, value)

  const result = verifyAuthorization(`${address} ${sig}`, { authRequest, now: 999, logger: silentLogger })
  assert.deepEqual(result, { address })
})

test("pending challenges cannot grow without bound", async () => {
  const authRequest = new Map()
  const addresses = []
  for (let i = 0; i < 12; i++) {
    addresses.push(await ethers.Wallet.createRandom().getAddress())
  }

  for (const address of addresses) {
    createChallenge(authRequest, address, { maxPending: 5 })
  }

  assert.ok(authRequest.size <= 5, `map grew to ${authRequest.size}`)
  // The newest request always survives; the oldest are dropped first.
  assert.equal(authRequest.has(addresses[addresses.length - 1]), true)
  assert.equal(authRequest.has(addresses[0]), false)
})

test("expired entries are pruned when a new challenge is issued", async () => {
  const authRequest = new Map()
  const stale = await ethers.Wallet.createRandom().getAddress()
  const fresh = await ethers.Wallet.createRandom().getAddress()

  createChallenge(authRequest, stale, { now: 0, ttlMs: 1000 })
  assert.equal(authRequest.size, 1)

  createChallenge(authRequest, fresh, { now: 5000, ttlMs: 1000 })
  assert.equal(authRequest.has(stale), false, "the expired entry should be gone")
  assert.equal(authRequest.has(fresh), true)
})
