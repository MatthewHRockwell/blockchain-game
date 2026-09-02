import { ethers } from "ethers"
import generateTypedAuth from "../commons/auth.mjs"

export function createChallenge(authRequest, address) {
  authRequest.delete(address)
  const secret = ethers.utils.keccak256(ethers.utils.randomBytes(8))
  authRequest.set(address, secret)
  return secret
}

export function verifyAuthorization(auth, { authRequest, sessions, logger = console }) {
  if (typeof auth !== "string") return false

  const token = auth.split(" ")
  const address = token[0]
  const sig = token[1]

  if (!address || !sig || !ethers.utils.isAddress(address)) return false

  if (sessions.has(address)) {
    logger.log("session in progress")
    authRequest.delete(address)
    return false
  }

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
