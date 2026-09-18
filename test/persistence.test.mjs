import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createStateStore } from "../server/persistence.js"
import { createAdventureState } from "../server/game/adventure/state.js"

const ADDRESS = "0x1111111111111111111111111111111111111111"

function tempStateFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lost-temple-state-"))
  return path.join(dir, "player-states.json")
}

test("state survives a store restart after flush", () => {
  const filePath = tempStateFile()
  const store = createStateStore({ filePath, logger: silentLogger })

  const state = createAdventureState(ADDRESS)
  state.inventory.push("machete")
  state.flags.macheteCollected = true
  store.set(ADDRESS, state)
  store.close()

  const reopened = createStateStore({ filePath, logger: silentLogger })
  const restored = reopened.get(ADDRESS)
  assert.equal(restored.address, ADDRESS)
  assert.deepEqual(restored.inventory, ["machete"])
  assert.equal(restored.flags.macheteCollected, true)
})

test("writes are debounced until the save delay elapses", async () => {
  const filePath = tempStateFile()
  const store = createStateStore({ filePath, saveDelayMs: 50, logger: silentLogger })

  store.set(ADDRESS, createAdventureState(ADDRESS))
  assert.equal(fs.existsSync(filePath), false)

  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(fs.existsSync(filePath), true)
})

test("flush writes immediately without waiting for the delay", () => {
  const filePath = tempStateFile()
  const store = createStateStore({ filePath, saveDelayMs: 60_000, logger: silentLogger })

  store.set(ADDRESS, createAdventureState(ADDRESS))
  store.flush()
  assert.equal(fs.existsSync(filePath), true)
})

test("corrupt state file starts fresh and is backed up", () => {
  const filePath = tempStateFile()
  fs.writeFileSync(filePath, "not json {")

  const store = createStateStore({ filePath, logger: silentLogger })
  assert.equal(store.size, 0)
  assert.equal(fs.existsSync(`${filePath}.corrupt`), true)
})

test("entries with implausible shapes are dropped on load", () => {
  const filePath = tempStateFile()
  const valid = createAdventureState(ADDRESS)
  fs.writeFileSync(filePath, JSON.stringify({
    [ADDRESS]: valid,
    "0x2222222222222222222222222222222222222222": { address: "mismatch" },
    "0x3333333333333333333333333333333333333333": "not an object"
  }))

  const store = createStateStore({ filePath, logger: silentLogger })
  assert.equal(store.size, 1)
  assert.deepEqual(store.get(ADDRESS), valid)
})

test("deleting an entry persists across restart", () => {
  const filePath = tempStateFile()
  const store = createStateStore({ filePath, logger: silentLogger })
  store.set(ADDRESS, createAdventureState(ADDRESS))
  store.close()

  const reopened = createStateStore({ filePath, logger: silentLogger })
  reopened.delete(ADDRESS)
  reopened.close()

  const third = createStateStore({ filePath, logger: silentLogger })
  assert.equal(third.get(ADDRESS), undefined)
})

const silentLogger = { log() {}, error() {} }
