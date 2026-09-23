// Registry of live player sessions, keyed by wallet address.
//
// A session used to be refused while another was registered for the same address.
// That sounds protective, but the address is only reachable by someone who just
// signed the server's challenge, so refusing buys nothing — it only punishes the
// legitimate owner for reconnecting. WebRTC reports a closed peer roughly 13 seconds
// after the browser goes away, so a player who refreshed was locked out for that
// whole window.
//
// A fresh, signature-verified login now supersedes the old session instead.
//
// The subtle part is ordering: the superseded channel's disconnect still fires, and
// it arrives *after* the newcomer has registered. Clearing the map unconditionally at
// that point would evict the live session, so `endIfCurrent` only clears an entry
// that still belongs to the caller.

export function createSessionRegistry({ stopSession, logger = console } = {}) {
  const sessions = new Map()

  /**
   * Register a session, ending any session already held for that address.
   * @returns {boolean} whether an existing session was superseded
   */
  function start(address, session) {
    const previous = sessions.get(address)
    sessions.set(address, session)

    if (!previous || previous === session) return false

    logger.log(address, "superseded by a newer session")
    try {
      stopSession?.(previous)
    } catch (error) {
      // Tearing down the old session must never prevent the new one from starting.
      logger.error("failed to stop superseded session:", error?.message || error)
    }
    return true
  }

  /**
   * Clear an address, but only when it still maps to this exact session. A stale
   * disconnect arriving after a takeover must not evict the session that replaced it.
   * @returns {boolean} whether the entry was removed
   */
  function endIfCurrent(address, session) {
    if (!sessions.has(address) || sessions.get(address) !== session) return false
    sessions.delete(address)
    return true
  }

  /**
   * Whether this session is still the live one for the address.
   *
   * Stopping a Phaser scene does not unregister the `channel.on(...)` handlers the
   * scene installed, and closing a superseded channel fires its own disconnect
   * handler, which persists. Both run after the replacement has registered, so every
   * write must be gated on this or a stale snapshot overwrites the live session.
   */
  function isCurrent(address, session) {
    return sessions.get(address) === session
  }

  return {
    start,
    endIfCurrent,
    isCurrent,
    has: (address) => sessions.has(address),
    get: (address) => sessions.get(address),
    get size() {
      return sessions.size
    }
  }
}
