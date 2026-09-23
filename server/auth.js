import { ethers } from "ethers"
import generateTypedAuth from "../commons/auth.mjs"

/** How long an unclaimed challenge stays usable. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000

/** Ceiling on unclaimed challenges, so anonymous requests cannot grow the map forever. */
export const MAX_PENDING_CHALLENGES = 500

function pruneExpired(authRequest, now) {
  for (const [key, entry] of authRequest) {
    if (!entry || entry.expiresAt <= now) authRequest.delete(key)
  }
}

/**
 * Issue a single-use challenge for an address.
 *
 * `POST /challenge` is the one unauthenticated public input, and it used to take the
 * request body verbatim: any string became a map key, with no expiry and no ceiling,
 * so a loop of anonymous posts grew the map without bound.
 *
 * At capacity this refuses the *new* request rather than evicting the oldest pending
 * challenge. Evicting looks tidier but is a login denial-of-service: issuing costs an
 * anonymous caller nothing, so flooding generated addresses would drop a real user's
 * challenge while they were still signing it, and their authorization would then fail.
 * Re-issuing for an address that is already pending always succeeds, since it replaces
 * its own entry and adds no growth.
 *
 * @returns {{ ok: true, secret: string } | { ok: false, reason: "invalid-address" | "at-capacity" }}
 */
export function createChallenge(
  authRequest,
  address,
  { now = Date.now(), ttlMs = CHALLENGE_TTL_MS, maxPending = MAX_PENDING_CHALLENGES } = {}
) {
  if (typeof address !== "string" || !ethers.utils.isAddress(address)) {
    return { ok: false, reason: "invalid-address" }
  }

  pruneExpired(authRequest, now)

  // Replacing an existing entry cannot grow the map, so it is always allowed.
  if (!authRequest.has(address) && authRequest.size >= maxPending) {
    return { ok: false, reason: "at-capacity" }
  }

  const secret = ethers.utils.keccak256(ethers.utils.randomBytes(8))
  authRequest.set(address, { secret, expiresAt: now + ttlMs })
  return { ok: true, secret }
}

/**
 * Authorize a connection from a signed challenge.
 *
 * Deliberately does not consider whether a session already exists for the address:
 * a valid signature proves ownership, so a reconnecting player supersedes their own
 * stale session rather than being refused. See server/sessions.js for why that
 * matters — WebRTC can take ~13s to report that the previous peer is gone.
 */
export function verifyAuthorization(auth, { authRequest, now = Date.now(), logger = console }) {
  if (typeof auth !== "string") return false

  const token = auth.split(" ")
  const address = token[0]
  const sig = token[1]

  if (!address || !sig || !ethers.utils.isAddress(address)) return false

  const entry = authRequest.get(address)
  // Single use whatever happens next, so a challenge cannot be retried or replayed.
  authRequest.delete(address)
  if (!entry) return false

  if (entry.expiresAt <= now) {
    logger.log("challenge expired")
    return false
  }

  const { domain, types, value } = generateTypedAuth(entry.secret)

  try {
    const recoveredAddress = ethers.utils.verifyTypedData(domain, types, value, sig)
    if (recoveredAddress.toLowerCase() === address.toLowerCase()) {
      return { address }
    }
  } catch (error) {
    logger.log("invalid auth signature")
  }

  return false
}
