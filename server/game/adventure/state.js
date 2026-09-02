import { CLUE_IDS, FLAG_DEFAULTS, FLAG_IDS, ITEM_IDS, ROOM_IDS } from "../../../commons/adventure/schema.mjs"
import { CLUES, getRoom } from "../../../commons/adventure/rooms.mjs"

export function createAdventureState(address) {
  const room = getRoom(ROOM_IDS.CRASH_SITE)
  return {
    address,
    currentRoom: room.id,
    position: { ...room.spawn },
    inventory: [],
    flags: { ...FLAG_DEFAULTS },
    discoveredClues: [],
    puzzle: {
      templeSequence: []
    },
    completed: false,
    rewardAuthorized: false,
    rewardPacketIssued: false,
    lastNotice: null
  }
}

export function cloneAdventureState(state) {
  return {
    ...state,
    position: { ...state.position },
    inventory: [...state.inventory],
    flags: { ...state.flags },
    discoveredClues: [...state.discoveredClues],
    puzzle: {
      templeSequence: [...state.puzzle.templeSequence]
    }
  }
}

export function hasItem(state, itemId) {
  return state.inventory.includes(itemId)
}

export function addItem(state, itemId) {
  if (!hasItem(state, itemId)) state.inventory.push(itemId)
}

export function addClue(state, clueId) {
  if (!state.discoveredClues.includes(clueId)) state.discoveredClues.push(clueId)
}

export function isCompletionEligible(state) {
  return Boolean(
    state.flags[FLAG_IDS.MACHETE_COLLECTED] &&
    state.flags[FLAG_IDS.VINES_CUT] &&
    state.flags[FLAG_IDS.ROPE_COLLECTED] &&
    state.flags[FLAG_IDS.BRIDGE_REPAIRED] &&
    state.flags[FLAG_IDS.JOURNAL_READ] &&
    state.flags[FLAG_IDS.TEMPLE_PUZZLE_SOLVED] &&
    state.flags[FLAG_IDS.ARTIFACT_RECOVERED] &&
    state.completed
  )
}

export function toPublicState(state) {
  const room = getRoom(state.currentRoom)
  return {
    address: state.address,
    currentRoom: state.currentRoom,
    roomName: room.name,
    objective: state.completed ? "Claim the expedition reward." : room.objective,
    position: { ...state.position },
    inventory: [...state.inventory],
    flags: { ...state.flags },
    discoveredClues: state.discoveredClues.map((id) => CLUES[id]).filter(Boolean),
    puzzle: {
      templeSequence: [...state.puzzle.templeSequence]
    },
    completed: state.completed,
    rewardAuthorized: state.rewardAuthorized
  }
}

export function forceCompleteForTests(state) {
  addItem(state, ITEM_IDS.MACHETE)
  addItem(state, ITEM_IDS.ROPE)
  state.flags[FLAG_IDS.MACHETE_COLLECTED] = true
  state.flags[FLAG_IDS.VINES_CUT] = true
  state.flags[FLAG_IDS.ROPE_COLLECTED] = true
  state.flags[FLAG_IDS.BRIDGE_REPAIRED] = true
  state.flags[FLAG_IDS.JOURNAL_READ] = true
  state.flags[FLAG_IDS.TEMPLE_PUZZLE_SOLVED] = true
  addClue(state, CLUE_IDS.TEMPLE_SEQUENCE)
}

