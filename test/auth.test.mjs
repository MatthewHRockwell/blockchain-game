import test from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import generateTypedAuth from "../commons/auth.mjs"
import { createChallenge, verifyAuthorization } from "../server/auth.js"

const require = createRequire(import.meta.url)
const { ethers } = require("../server/node_modules/ethers")


test("valid local development signature is accepted", async () => {
  const authRequest = new Map()
  const sessions = new Map()
  const wallet = ethers.Wallet.createRandom()
  const address = await wallet.getAddress()
  const challenge = createChallenge(authRequest, address)
  const { domain, types, value } = generateTypedAuth(challenge)
  const sig = await wallet._signTypedData(domain, types, value)

  const result = verifyAuthorization(`${address} ${sig}`, { authRequest, sessions, logger: silentLogger })
  assert.deepEqual(result, { address })
  assert.equal(authRequest.has(address), false)
})

test("invalid local development signature is rejected", async () => {
  const authRequest = new Map()
  const sessions = new Map()
  const wallet = ethers.Wallet.createRandom()
  const attacker = ethers.Wallet.createRandom()
  const address = await wallet.getAddress()
  const challenge = createChallenge(authRequest, address)
  const { domain, types, value } = generateTypedAuth(challenge)
  const badSig = await attacker._signTypedData(domain, types, value)

  const result = verifyAuthorization(`${address} ${badSig}`, { authRequest, sessions, logger: silentLogger })
  assert.equal(result, false)
  assert.equal(authRequest.has(address), false)
})

test("active duplicate session is rejected", async () => {
  const authRequest = new Map()
  const wallet = ethers.Wallet.createRandom()
  const address = await wallet.getAddress()
  const sessions = new Map([[address, {}]])
  const challenge = createChallenge(authRequest, address)
  const { domain, types, value } = generateTypedAuth(challenge)
  const sig = await wallet._signTypedData(domain, types, value)

  const result = verifyAuthorization(`${address} ${sig}`, { authRequest, sessions, logger: silentLogger })
  assert.equal(result, false)
})

const silentLogger = { log() {} }
