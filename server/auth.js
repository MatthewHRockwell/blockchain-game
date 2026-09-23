import { ethers } from "ethers"
import generateTypedAuth from "../commons/auth.mjs"

export function createChallenge(authRequest, address) {
  authRequest.delete(address)
  const secret = ethers.utils.keccak256(ethers.utils.randomBytes(8))
  authRequest.set(address, secret)
  return secret
}

/**
 * Authorize a connection from a signed challenge.
 *
 * Deliberately does not consider whether a session already exists for the address:
 * a valid signature proves ownership, so a reconnecting player supersedes their own
 * stale session rather than being refused. See server/sessions.js for why that
 * matters — WebRTC can take ~13s to report that the previous peer is gone.
 */
export function verifyAuthorization(auth, { authRequest, logger = console }) {
  if (typeof auth !== "string") return false

  const token = auth.split(" ")
  const address = token[0]
  const sig = token[1]

  if (!address || !sig || !ethers.utils.isAddress(address)) return false

  const secret = authRequest.get(address)
  if (!secret) return false

  const { domain, types, value } = generateTypedAuth(secret)

  try {
    const recoveredAddress = ethers.utils.verifyTypedData(domain, types, value, sig)
    if (recoveredAddress.toLowerCase() === address.toLowerCase()) {
      authRequest.delete(address)
      return { address }
    }
  } catch (error) {
    logger.log("invalid auth signature")
  }

  authRequest.delete(address)
  return false
}
