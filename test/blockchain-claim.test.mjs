import test from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"

const require = createRequire(import.meta.url)
const { ethers } = require("../server/node_modules/ethers")
const verifierArtifact = require("../contracts/artifacts/src/ClaimVerifier.sol/ClaimVerifier.json")
const managerArtifact = require("../contracts/artifacts/src/ClaimManagerERC721.sol/ClaimManagerERC721.json")

const shouldRun = process.env.BLOCKCHAIN_TESTS === "1"
const maybeTest = shouldRun ? test : test.skip

maybeTest("trusted completed packet can claim and untrusted packet cannot", async () => {
  const { contracts, addresses } = await import(pathToFileURL(`${process.cwd()}/commons/contracts.mjs`).href)
  const { signPacket } = await import(pathToFileURL(`${process.cwd()}/server/game/utils.js`).href)
  const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || "http://127.0.0.1:8545")
  const trusted = provider.getSigner(0)
  const player = provider.getSigner(3)
  const untrusted = provider.getSigner(4)
  const playerAddress = await player.getAddress()
  const untrustedAddress = await untrusted.getAddress()
  const verifierAddress = addresses[contracts.CLAIM_VERIFIER]
  const managerAddress = addresses[contracts.ARTIFACT_REWARD]
  const verifier = new ethers.Contract(verifierAddress, verifierArtifact.abi, provider)
  const manager = new ethers.Contract(managerAddress, managerArtifact.abi, provider)
  const deadline = ethers.constants.MaxUint256

  const trustedSig = await signPacket(trusted, managerAddress, deadline, playerAddress)
  const trustedSplit = ethers.utils.splitSignature(trustedSig)
  const balanceBefore = await manager.balanceOf(playerAddress)
  if (balanceBefore.eq(0)) {
    const tx = await verifier.connect(player).claim(managerAddress, {
      v: trustedSplit.v,
      r: trustedSplit.r,
      s: trustedSplit.s,
      request: managerAddress,
      deadline,
      receiver: playerAddress
    })
    await tx.wait()
  }
  assert.equal((await manager.balanceOf(playerAddress)).toString(), "1")

  const badSig = await signPacket(untrusted, managerAddress, deadline, untrustedAddress)
  const badSplit = ethers.utils.splitSignature(badSig)
  await assert.rejects(
    verifier.connect(untrusted).callStatic.claim(managerAddress, {
      v: badSplit.v,
      r: badSplit.r,
      s: badSplit.s,
      request: managerAddress,
      deadline,
      receiver: untrustedAddress
    }),
    /Trustus__InvalidPacket|revert|CALL_EXCEPTION/
  )
})
