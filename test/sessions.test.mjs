import test from "node:test"
import assert from "node:assert/strict"
import { createSessionRegistry } from "../server/sessions.js"

const silentLogger = { log() {}, error() {} }
const ADDRESS = "0x0000000000000000000000000000000000000001"

test("a new session supersedes the one already held for the address", () => {
  const stopped = []
  const registry = createSessionRegistry({
    stopSession: (session) => stopped.push(session.id),
    logger: silentLogger
  })

  const first = { id: "first" }
  const second = { id: "second" }

  assert.equal(registry.start(ADDRESS, first), false, "nothing to supersede yet")
  assert.equal(registry.start(ADDRESS, second), true, "should report the takeover")

  assert.deepEqual(stopped, ["first"])
  assert.equal(registry.get(ADDRESS), second)
  assert.equal(registry.size, 1)
})

test("a superseded channel's late disconnect does not evict the session that replaced it", () => {
  // This is the ordering trap. WebRTC reports the old peer gone ~13s after it was
  // replaced, so the stale disconnect arrives while the newcomer is playing.
  const registry = createSessionRegistry({ stopSession: () => {}, logger: silentLogger })
  const first = { id: "first" }
  const second = { id: "second" }

  registry.start(ADDRESS, first)
  registry.start(ADDRESS, second)

  assert.equal(registry.endIfCurrent(ADDRESS, first), false, "stale disconnect must be ignored")
  assert.equal(registry.get(ADDRESS), second, "the live session must survive")
  assert.equal(registry.size, 1)
})

test("the current session's disconnect clears the address", () => {
  const registry = createSessionRegistry({ stopSession: () => {}, logger: silentLogger })
  const session = { id: "only" }

  registry.start(ADDRESS, session)
  assert.equal(registry.endIfCurrent(ADDRESS, session), true)
  assert.equal(registry.has(ADDRESS), false)
  assert.equal(registry.size, 0)
})

test("ending an unknown address or session is a no-op", () => {
  const registry = createSessionRegistry({ stopSession: () => {}, logger: silentLogger })
  assert.equal(registry.endIfCurrent(ADDRESS, { id: "ghost" }), false)
  assert.equal(registry.size, 0)
})

test("re-registering the identical session is not a takeover", () => {
  const stopped = []
  const registry = createSessionRegistry({
    stopSession: (session) => stopped.push(session.id),
    logger: silentLogger
  })
  const session = { id: "same" }

  registry.start(ADDRESS, session)
  assert.equal(registry.start(ADDRESS, session), false)
  assert.deepEqual(stopped, [], "must not tear down the session being registered")
})

test("a failure while stopping the old session still lets the new one in", () => {
  const registry = createSessionRegistry({
    stopSession: () => {
      throw new Error("channel already gone")
    },
    logger: silentLogger
  })

  registry.start(ADDRESS, { id: "first" })
  const second = { id: "second" }
  assert.doesNotThrow(() => registry.start(ADDRESS, second))
  assert.equal(registry.get(ADDRESS), second)
})

test("sessions for different addresses do not interfere", () => {
  const registry = createSessionRegistry({ stopSession: () => {}, logger: silentLogger })
  const other = "0x0000000000000000000000000000000000000002"

  registry.start(ADDRESS, { id: "a" })
  registry.start(other, { id: "b" })

  assert.equal(registry.size, 2)
  assert.equal(registry.get(ADDRESS).id, "a")
  assert.equal(registry.get(other).id, "b")
})

test("a superseded session cannot write state over the one that replaced it", () => {
  // Stopping a Phaser scene leaves its channel handlers installed, and closing the
  // superseded channel fires that scene's own disconnect persist. Both run after the
  // replacement registered, so writes have to be gated on session identity.
  const registry = createSessionRegistry({ stopSession: () => {}, logger: silentLogger })
  const store = new Map()

  // Mirrors the server's onStateChange wiring: each scene closes over its own session.
  const writerFor = (session) => (state) => {
    if (registry.isCurrent(ADDRESS, session)) store.set(ADDRESS, state)
  }

  const oldSession = { id: "old" }
  registry.start(ADDRESS, oldSession)
  const writeOld = writerFor(oldSession)
  writeOld({ room: "crash-site" })
  assert.deepEqual(store.get(ADDRESS), { room: "crash-site" })

  const newSession = { id: "new" }
  registry.start(ADDRESS, newSession)
  const writeNew = writerFor(newSession)

  // The replacement makes progress.
  writeNew({ room: "inner-temple" })

  // Now the stale channel finally delivers a queued event and then disconnects.
  writeOld({ room: "crash-site" })
  writeOld({ room: "crash-site" })

  assert.deepEqual(
    store.get(ADDRESS),
    { room: "inner-temple" },
    "the superseded session rolled the live session back"
  )
})

test("isCurrent tracks the live session and forgets it on disconnect", () => {
  const registry = createSessionRegistry({ stopSession: () => {}, logger: silentLogger })
  const session = { id: "only" }

  assert.equal(registry.isCurrent(ADDRESS, session), false, "not registered yet")
  registry.start(ADDRESS, session)
  assert.equal(registry.isCurrent(ADDRESS, session), true)
  registry.endIfCurrent(ADDRESS, session)
  assert.equal(registry.isCurrent(ADDRESS, session), false, "cleared after disconnect")
})
