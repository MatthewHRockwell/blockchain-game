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
  const challenge = createChallenge(authRequest, address).secret
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
  const challenge = createChallenge(authRequest, address).secret
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
  const challenge = createChallenge(authRequest, address).secret
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
  const challenge = createChallenge(authRequest, address).secret
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
    assert.deepEqual(createChallenge(authRequest, bad), { ok: false, reason: "invalid-address" }, JSON.stringify(bad))
  }
  assert.equal(authRequest.size, 0, "nothing should have been stored")

  const wallet = ethers.Wallet.createRandom()
  const address = await wallet.getAddress()
  assert.equal(typeof createChallenge(authRequest, address).secret, "string")
  assert.equal(authRequest.size, 1)
})

test("an expired challenge is refused", async () => {
  const authRequest = new Map()
  const wallet = ethers.Wallet.createRandom()
  const address = await wallet.getAddress()

  const challenge = createChallenge(authRequest, address, { now: 0, ttlMs: 1000 }).secret
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

  const challenge = createChallenge(authRequest, address, { now: 0, ttlMs: 1000 }).secret
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

  const results = addresses.map((address) => createChallenge(authRequest, address, { maxPending: 5 }))

  assert.equal(authRequest.size, 5, `map grew to ${authRequest.size}`)
  assert.equal(results.filter((r) => r.ok).length, 5)
  assert.deepEqual(results[11], { ok: false, reason: "at-capacity" })
})

test("a flood cannot evict a challenge somebody is still signing", async () => {
  // Issuing costs an anonymous caller nothing, so evicting the oldest entry at
  // capacity would be a cheap, repeatable login denial-of-service: flood generated
  // addresses while a real user signs, and their authorization then fails.
  const authRequest = new Map()
  const victim = ethers.Wallet.createRandom()
  const victimAddress = await victim.getAddress()

  const issued = createChallenge(authRequest, victimAddress, { maxPending: 50 })
  assert.equal(issued.ok, true)

  for (let i = 0; i < 200; i++) {
    createChallenge(authRequest, ethers.Wallet.createRandom().address, { maxPending: 50 })
  }

  assert.equal(authRequest.has(victimAddress), true, "the victim's challenge was evicted")

  const { domain, types, value } = generateTypedAuth(issued.secret)
  const sig = await victim._signTypedData(domain, types, value)
  const result = verifyAuthorization(`${victimAddress} ${sig}`, { authRequest, logger: silentLogger })
  assert.deepEqual(result, { address: victimAddress }, "the victim could not log in")
})

test("an address already pending can always refresh its own challenge", async () => {
  // Otherwise a full map would lock out a legitimate retry.
  const authRequest = new Map()
  const address = await ethers.Wallet.createRandom().getAddress()

  assert.equal(createChallenge(authRequest, address, { maxPending: 3 }).ok, true)
  for (let i = 0; i < 5; i++) {
    createChallenge(authRequest, ethers.Wallet.createRandom().address, { maxPending: 3 })
  }

  const refreshed = createChallenge(authRequest, address, { maxPending: 3 })
  assert.equal(refreshed.ok, true, "a pending address must be able to re-issue")
  assert.ok(authRequest.size <= 3)
})

test("capacity frees up as challenges expire", async () => {
  const authRequest = new Map()
  const filler = []
  for (let i = 0; i < 3; i++) filler.push(await ethers.Wallet.createRandom().getAddress())
  for (const address of filler) createChallenge(authRequest, address, { now: 0, ttlMs: 1000, maxPending: 3 })

  const latecomer = await ethers.Wallet.createRandom().getAddress()
  assert.deepEqual(
    createChallenge(authRequest, latecomer, { now: 500, ttlMs: 1000, maxPending: 3 }),
    { ok: false, reason: "at-capacity" }
  )

  // Once the earlier ones lapse, the slot is available again.
  assert.equal(createChallenge(authRequest, latecomer, { now: 2000, ttlMs: 1000, maxPending: 3 }).ok, true)
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
