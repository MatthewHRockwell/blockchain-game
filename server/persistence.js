import fs from "node:fs"
import path from "node:path"

const DEFAULT_SAVE_DELAY_MS = 1000

// File-backed store for authoritative player states. Keeps the Map get/set
// surface used by server.js, loads synchronously at startup, and debounces
// atomic writes so per-frame movement updates do not thrash the disk.
export function createStateStore({ filePath, saveDelayMs = DEFAULT_SAVE_DELAY_MS, logger = console } = {}) {
  if (!filePath) throw new Error("createStateStore requires a filePath")

  const states = new Map(Object.entries(loadStates(filePath, logger)))
  let pendingSave = null
  let dirty = false

  function scheduleSave() {
    dirty = true
    if (pendingSave) return
    pendingSave = setTimeout(() => {
      pendingSave = null
      flush()
    }, saveDelayMs)
    if (typeof pendingSave.unref === "function") pendingSave.unref()
  }

  function flush() {
    if (pendingSave) {
      clearTimeout(pendingSave)
      pendingSave = null
    }
    if (!dirty) return
    try {
      writeStatesAtomically(filePath, Object.fromEntries(states))
      dirty = false
    } catch (error) {
      logger.error("failed to persist player states:", error.message)
    }
  }

  return {
    get(address) {
      return states.get(address)
    },
    set(address, state) {
      states.set(address, state)
      scheduleSave()
    },
    delete(address) {
      if (states.delete(address)) scheduleSave()
    },
    get size() {
      return states.size
    },
    flush,
    close() {
      flush()
    }
  }
}

function loadStates(filePath, logger) {
  let raw
  try {
    raw = fs.readFileSync(filePath, "utf8")
  } catch (error) {
    if (error.code !== "ENOENT") logger.error("failed to read player states:", error.message)
    return {}
  }

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object")
    const entries = Object.entries(parsed).filter(([address, state]) => isPlausibleState(address, state))
    logger.log(`restored ${entries.length} persisted player state(s)`)
    return Object.fromEntries(entries)
  } catch (error) {
    const backupPath = `${filePath}.corrupt`
    logger.error(`player state file is corrupt (${error.message}); starting fresh, backup at ${backupPath}`)
    try {
      fs.renameSync(filePath, backupPath)
    } catch (renameError) {
      logger.error("failed to back up corrupt state file:", renameError.message)
    }
    return {}
  }
}

function isPlausibleState(address, state) {
  return Boolean(
    state &&
    typeof state === "object" &&
    state.address === address &&
    typeof state.currentRoom === "string" &&
    Array.isArray(state.inventory) &&
    state.flags && typeof state.flags === "object"
  )
}

function writeStatesAtomically(filePath, snapshot) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tempPath, JSON.stringify(snapshot, null, 2))
  fs.renameSync(tempPath, filePath)
}
