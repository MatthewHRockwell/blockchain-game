// Contract tests for the reward claim trust boundary.
//
// Run with `npm test --prefix contracts` (hardhat test). Uses node:assert rather
// than chai so the suite needs no dependency beyond the hardhat toolchain already
// in contracts/package.json, and matches the assertion style of test/.
//
// These cover the paths where a bug mints free NFTs or hands over the trust root:
// the claim-verifier-only gate, receiver binding, the claim-manager registry,
// replay protection, packet expiry/mismatch, and owner-only setters.

const assert = require("node:assert/strict")
const path = require("node:path")
const { pathToFileURL } = require("node:url")
const { ethers } = require("hardhat")

const REQUEST_MISMATCH_SENTINEL = "0x000000000000000000000000000000000000dEaD"

// Loaded from commons/ so the packets these tests sign use the *server's* EIP-712
// definition. A drift between that and Trustus.sol fails here instead of silently
// reverting every real claim.
let PACKET_TYPES
let buildPacketDomain

before(async () => {
  const commons = path.resolve(__dirname, "..", "..", "commons", "trustus.mjs")
  const mod = await import(pathToFileURL(commons).href)
  PACKET_TYPES = mod.PACKET_TYPES
  buildPacketDomain = mod.buildPacketDomain
})

async function deployFixture() {
  const [owner, trusted, player, other, untrusted] = await ethers.getSigners()

  const Verifier = await ethers.getContractFactory("ClaimVerifier", owner)
  const verifier = await Verifier.deploy()
  await verifier.deployed()

  const Manager = await ethers.getContractFactory("ClaimManagerERC721", owner)
  const manager = await Manager.deploy(
    "Lost Temple Artifact",
    "RELIC",
    "ipfs://lost-temple/",
    verifier.address
  )
  await manager.deployed()

  await (await verifier.setIsTrusted(trusted.address, true)).wait()
  await (await verifier.setIsClaimManager(manager.address, true)).wait()

  return { verifier, manager, owner, trusted, player, other, untrusted }
}

/** Sign a reward packet the way the game server does, then split it for Solidity. */
async function makePacket({
  verifier,
  signer,
  request,
  receiver,
  deadline = ethers.constants.MaxUint256
}) {
  const { chainId } = await ethers.provider.getNetwork()
  const domain = buildPacketDomain({ chainId, verifyingContract: verifier.address })
  const sig = await signer._signTypedData(domain, PACKET_TYPES, {
    request,
    deadline,
    receiver
  })
  const { v, r, s } = ethers.utils.splitSignature(sig)
  return { v, r, s, request, deadline, receiver }
}

describe("reward claim trust boundary", () => {
  describe("happy path", () => {
    it("mints exactly one NFT to the packet receiver", async () => {
      const { verifier, manager, trusted, player } = await deployFixture()
      const packet = await makePacket({
        verifier,
        signer: trusted,
        request: manager.address,
        receiver: player.address
      })

      await (await verifier.connect(player).claim(manager.address, packet)).wait()

      assert.equal((await manager.balanceOf(player.address)).toString(), "1")
      assert.equal(await manager.ownerOf(0), player.address)
      assert.equal(await manager.hasClaimed(player.address), true)
      assert.equal((await manager.nonce()).toString(), "1")
    })

    it("assigns sequential token ids across different claimers", async () => {
      const { verifier, manager, trusted, player, other } = await deployFixture()

      for (const receiver of [player, other]) {
        const packet = await makePacket({
          verifier,
          signer: trusted,
          request: manager.address,
          receiver: receiver.address
        })
        await (await verifier.connect(receiver).claim(manager.address, packet)).wait()
      }

      assert.equal(await manager.ownerOf(0), player.address)
      assert.equal(await manager.ownerOf(1), other.address)
      assert.equal((await manager.nonce()).toString(), "2")
    })
  })

  describe("claim manager can only be driven by the verifier", () => {
    // The free-mint guard. Without it any player could mint straight from the
    // manager and skip packet verification entirely.
    it("rejects a direct claim() call from a player", async () => {
      const { manager, player } = await deployFixture()

      await assert.rejects(
        manager.connect(player).claim(player.address),
        /sender not claim verifier/
      )
      assert.equal((await manager.balanceOf(player.address)).toString(), "0")
    })

    it("rejects a direct claim() call from the contract owner", async () => {
      const { manager, owner, player } = await deployFixture()

      await assert.rejects(
        manager.connect(owner).claim(player.address),
        /sender not claim verifier/
      )
    })
  })

  describe("packet binding", () => {
    it("rejects a valid packet submitted by someone other than the receiver", async () => {
      const { verifier, manager, trusted, player, other } = await deployFixture()
      const packet = await makePacket({
        verifier,
        signer: trusted,
        request: manager.address,
        receiver: player.address
      })

      await assert.rejects(
        verifier.connect(other).claim(manager.address, packet),
        /not your packet/
      )
      assert.equal((await manager.balanceOf(other.address)).toString(), "0")
    })

    it("rejects a packet signed by an untrusted signer", async () => {
      const { verifier, manager, untrusted, player } = await deployFixture()
      const packet = await makePacket({
        verifier,
        signer: untrusted,
        request: manager.address,
        receiver: player.address
      })

      await assert.rejects(
        verifier.connect(player).claim(manager.address, packet),
        /Trustus__InvalidPacket/
      )
    })

    it("rejects a packet after the signer is untrusted again", async () => {
      const { verifier, manager, owner, trusted, player } = await deployFixture()
      const packet = await makePacket({
        verifier,
        signer: trusted,
        request: manager.address,
        receiver: player.address
      })

      await (await verifier.connect(owner).setIsTrusted(trusted.address, false)).wait()

      await assert.rejects(
        verifier.connect(player).claim(manager.address, packet),
        /Trustus__InvalidPacket/
      )
    })

    it("rejects an expired packet", async () => {
      const { verifier, manager, trusted, player } = await deployFixture()
      const latest = await ethers.provider.getBlock("latest")
      const packet = await makePacket({
        verifier,
        signer: trusted,
        request: manager.address,
        receiver: player.address,
        deadline: latest.timestamp - 1
      })

      await assert.rejects(
        verifier.connect(player).claim(manager.address, packet),
        /Trustus__InvalidPacket/
      )
    })

    it("rejects a packet whose request does not match the claim argument", async () => {
      const { verifier, manager, trusted, player } = await deployFixture()
      // Signed over a different request than the one passed to claim().
      const packet = await makePacket({
        verifier,
        signer: trusted,
        request: REQUEST_MISMATCH_SENTINEL,
        receiver: player.address
      })

      await assert.rejects(
        verifier.connect(player).claim(manager.address, packet),
        /Trustus__InvalidPacket/
      )
    })
  })

  describe("claim manager registry", () => {
    it("rejects a claim against an unregistered claim manager", async () => {
      const { verifier, manager, owner, trusted, player } = await deployFixture()
      await (await verifier.connect(owner).setIsClaimManager(manager.address, false)).wait()

      const packet = await makePacket({
        verifier,
        signer: trusted,
        request: manager.address,
        receiver: player.address
      })

      await assert.rejects(
        verifier.connect(player).claim(manager.address, packet),
        /invalid claim manager address/
      )
    })

    it("refuses to register the zero address", async () => {
      const { verifier, owner } = await deployFixture()

      await assert.rejects(
        verifier.connect(owner).setIsClaimManager(ethers.constants.AddressZero, true),
        /zero address/
      )
    })
  })

  describe("replay protection", () => {
    it("rejects a second claim with the same packet", async () => {
      const { verifier, manager, trusted, player } = await deployFixture()
      const packet = await makePacket({
        verifier,
        signer: trusted,
        request: manager.address,
        receiver: player.address
      })

      await (await verifier.connect(player).claim(manager.address, packet)).wait()

      await assert.rejects(
        verifier.connect(player).claim(manager.address, packet),
        /already claimed/
      )
      assert.equal((await manager.balanceOf(player.address)).toString(), "1")
    })

    it("rejects a second claim even with a freshly signed packet", async () => {
      const { verifier, manager, trusted, player } = await deployFixture()

      for (const attempt of [0, 1]) {
        const packet = await makePacket({
          verifier,
          signer: trusted,
          request: manager.address,
          receiver: player.address,
          deadline: ethers.constants.MaxUint256.sub(attempt)
        })
        if (attempt === 0) {
          await (await verifier.connect(player).claim(manager.address, packet)).wait()
        } else {
          await assert.rejects(
            verifier.connect(player).claim(manager.address, packet),
            /already claimed/
          )
        }
      }

      assert.equal((await manager.balanceOf(player.address)).toString(), "1")
    })
  })

  describe("owner-only administration", () => {
    // These setters are the trust root: whoever can call them can mint at will.
    it("rejects setIsTrusted from a non-owner", async () => {
      const { verifier, untrusted } = await deployFixture()

      await assert.rejects(
        verifier.connect(untrusted).setIsTrusted(untrusted.address, true),
        /Ownable: caller is not the owner/
      )
    })

    it("rejects setIsClaimManager from a non-owner", async () => {
      const { verifier, manager, untrusted } = await deployFixture()

      await assert.rejects(
        verifier.connect(untrusted).setIsClaimManager(manager.address, true),
        /Ownable: caller is not the owner/
      )
    })

    it("lets a non-owner signer become trusted only via the owner", async () => {
      const { verifier, manager, owner, untrusted, player } = await deployFixture()
      await (await verifier.connect(owner).setIsTrusted(untrusted.address, true)).wait()

      const packet = await makePacket({
        verifier,
        signer: untrusted,
        request: manager.address,
        receiver: player.address
      })
      await (await verifier.connect(player).claim(manager.address, packet)).wait()

      assert.equal((await manager.balanceOf(player.address)).toString(), "1")
    })
  })

  describe("token metadata", () => {
    it("reverts tokenURI for an unminted id", async () => {
      const { manager } = await deployFixture()

      await assert.rejects(manager.tokenURI(0), /NOT MINTED/)
    })

    it("concatenates baseURI and token id after a claim", async () => {
      const { verifier, manager, trusted, player } = await deployFixture()
      const packet = await makePacket({
        verifier,
        signer: trusted,
        request: manager.address,
        receiver: player.address
      })
      await (await verifier.connect(player).claim(manager.address, packet)).wait()

      assert.equal(await manager.tokenURI(0), "ipfs://lost-temple/0")
    })
  })
})
