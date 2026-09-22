// Single source of truth for the Trustus reward-packet EIP-712 definition.
//
// These values must byte-match `_computeDomainSeparator()` and the `VerifyPacket`
// typestring in contracts/src/Trustus.sol. If they drift, every claim reverts with
// Trustus__InvalidPacket and nothing else fails first, so the contract test suite
// signs its packets with exactly these definitions to pin both sides together.

/** Matches `keccak256("BlockchainGame")` in Trustus._computeDomainSeparator(). */
export const PACKET_DOMAIN_NAME = "BlockchainGame"

/** Matches `keccak256("1")` in Trustus._computeDomainSeparator(). */
export const PACKET_DOMAIN_VERSION = "1"

/**
 * Matches the literal typestring hashed in Trustus._verifyPacket():
 *   "VerifyPacket(address request,uint256 deadline,address receiver)"
 * Field order is significant — it determines the struct hash.
 */
export const PACKET_TYPES = {
  VerifyPacket: [
    { name: "request", type: "address" },
    { name: "deadline", type: "uint256" },
    { name: "receiver", type: "address" }
  ]
}

/**
 * Build the EIP-712 domain for a specific chain and verifier deployment.
 * @param {{ chainId: number, verifyingContract: string }} params
 */
export function buildPacketDomain({ chainId, verifyingContract }) {
  return {
    name: PACKET_DOMAIN_NAME,
    version: PACKET_DOMAIN_VERSION,
    chainId,
    verifyingContract
  }
}
