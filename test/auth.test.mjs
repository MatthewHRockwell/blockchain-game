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
