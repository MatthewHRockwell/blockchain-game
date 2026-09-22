import { parseCommand, helpText, normalizePhrase } from "../../../commons/adventure/parser.mjs"
import {
  CLUE_IDS,
  DIRECTIONS,
  FLAG_IDS,
  ITEM_IDS,
  ITEM_NAMES,
  OBJECT_IDS,
  SYMBOL_SEQUENCE
} from "../../../commons/adventure/schema.mjs"
import {
  CLUES,
  INTERACTION_RADIUS,
  ITEM_ALIASES,
  PLAYER_RADIUS,
  getRoom,
  getVisibleObjects,
  isAvailable,
  isSolid,
  isVisible
} from "../../../commons/adventure/rooms.mjs"
import {
  addClue,
  addItem,
  cloneAdventureState,
  hasItem,
  isCompletionEligible,
  toPublicState
} from "./state.js"

const MOVE_SPEED = 92

function result(state, message, extras = {}) {
  return {
    state,
    publicState: toPublicState(state),
    message,
    events: [],
    ...extras
  }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function rectContainsPoint(rect, point) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

function pointInsideSolid(rect, point) {
  return (
    point.x + PLAYER_RADIUS > rect.x &&
    point.x - PLAYER_RADIUS < rect.x + rect.width &&
    point.y + PLAYER_RADIUS > rect.y &&
    point.y - PLAYER_RADIUS < rect.y + rect.height
  )
}

function clampPosition(room, position) {
  return {
    x: Math.max(PLAYER_RADIUS, Math.min(room.bounds.width - PLAYER_RADIUS, position.x)),
    y: Math.max(PLAYER_RADIUS, Math.min(room.bounds.height - PLAYER_RADIUS, position.y))
  }
}

function solidRects(room, state) {
  return room.objects
    .filter((object) => object.solid && isVisible(object, state) && isSolid(object, state))
    .map((object) => object.solid)
}

function collides(room, state, position) {
  return solidRects(room, state).some((rect) => pointInsideSolid(rect, position))
}

function moveAxis(room, state, position, dx, dy) {
  const candidate = clampPosition(room, { x: position.x + dx, y: position.y + dy })
  return collides(room, state, candidate) ? position : candidate
}

function normalizeMovement(input) {
  if (!Array.isArray(input)) return [false, false, false, false]
  return input.slice(0, 4).map(Boolean)
}

function setRoom(state, exit) {
  state.currentRoom = exit.to
  state.position = { ...exit.spawn }
  state.lastNotice = null
}

function maybeTransitionByPosition(state) {
  const room = getRoom(state.currentRoom)
  const exit = room.exits.find((candidate) => rectContainsPoint(candidate.area, state.position))
  if (!exit) return null
  if (!isAvailable(exit, state)) return null
  setRoom(state, exit)
  const destination = getRoom(state.currentRoom)
  return {
    roomChanged: true,
    message: `You enter ${destination.name}. ${destination.look}`
  }
}

export function applyMovement(currentState, movementInput, deltaMs = 1000 / 30) {
  const state = cloneAdventureState(currentState)
  const room = getRoom(state.currentRoom)
  const [up, down, left, right] = normalizeMovement(movementInput)
  let vx = 0
  let vy = 0
  if (up) vy -= 1
  if (down) vy += 1
  if (left) vx -= 1
  if (right) vx += 1

  if (vx !== 0 || vy !== 0) {
    const length = Math.hypot(vx, vy)
    const step = (MOVE_SPEED * deltaMs) / 1000
    vx = (vx / length) * step
    vy = (vy / length) * step
    let nextPosition = moveAxis(room, state, state.position, vx, 0)
    nextPosition = moveAxis(room, state, nextPosition, 0, vy)
    state.position = nextPosition
  }

  const transition = maybeTransitionByPosition(state)
  return result(state, transition?.message || "", transition || {})
}

function allAliases(definition) {
  return [definition.id, definition.name, ...(definition.aliases || [])].map(normalizePhrase)
}


function singular(word) {
  return word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word
}

/**
 * Fall back to token overlap so "the damaged plane" or "look vines" resolve without
 * requiring an exact alias. Only used when exactly one object matches: an ambiguous
 * phrase stays unresolved rather than silently picking whichever came first.
 */
function tokenMatches(objects, normalized) {
  const words = normalized.split(" ").filter(Boolean).map(singular)
  if (!words.length) return []

  return objects.filter((object) =>
    allAliases(object).some((alias) =>
      alias
        .split(" ")
        .filter(Boolean)
        .map(singular)
        .some((aliasWord) => words.includes(aliasWord))
    )
  )
}

function resolveByTokens(objects, normalized) {
  const matches = tokenMatches(objects, normalized)
  return matches.length === 1 ? matches[0] : undefined
}

function joinNames(names) {
  if (names.length <= 1) return names.join("")
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`
}

/**
 * Message for a noun that did not resolve. A phrase matching several things in the
 * room is ambiguous rather than absent, so say which ones were meant.
 */
function missingObject(room, state, phrase) {
  const matches = tokenMatches(getVisibleObjects(room, state), normalizePhrase(phrase))
  if (matches.length > 1) {
    return `Which one do you mean: ${joinNames(matches.map((object) => object.name))}?`
  }
  return `I don't see "${phrase}" here.`
}

function resolveVisibleObject(room, state, phrase) {
  const normalized = normalizePhrase(phrase)
  const visible = getVisibleObjects(room, state)
  const exact = visible.find((object) => allAliases(object).includes(normalized))
  if (exact) return exact
  return resolveByTokens(visible, normalized)
}

function resolveAnyRoomObject(room, phrase) {
  const normalized = normalizePhrase(phrase)
  return room.objects.find((object) => allAliases(object).includes(normalized))
}

function resolveItem(phrase) {
  const normalized = normalizePhrase(phrase)
  for (const [itemId, aliases] of Object.entries(ITEM_ALIASES)) {
    if (itemId === normalized || aliases.map(normalizePhrase).includes(normalized)) return itemId
  }
  return null
}


function nearEnough(state, object, radius = INTERACTION_RADIUS) {
  return distance(state.position, object.position) <= (object.radius || radius)
}

function roomLook(state) {
  const room = getRoom(state.currentRoom)
  const visibleObjects = getVisibleObjects(room, state).map((object) => object.name)
  const exits = room.exits.map((exit) => exit.direction).join(", ")
  const parts = [room.look]
  if (visibleObjects.length) parts.push(`You notice ${visibleObjects.join(", ")}.`)
  if (exits) parts.push(`Exits: ${exits}.`)
  return parts.join(" ")
}

function inventoryText(state) {
  if (!state.inventory.length) return "Your inventory is empty, which is tidy but not encouraging."
  return `You are carrying: ${state.inventory.map((item) => ITEM_NAMES[item] || item).join(", ")}.`
}

function setFlag(state, flagId) {
  state.flags[flagId] = true
}

function takeObject(state, object) {
  if (!object.takeable || !object.itemId) {
    return result(state, `You cannot take the ${object.name}. It has chosen a more rooted lifestyle.`)
  }
  if (!nearEnough(state, object)) return result(state, "You're too far away.")
  if (hasItem(state, object.itemId)) {
    return result(state, `You already have the ${ITEM_NAMES[object.itemId] || object.itemId}.`)
  }

  addItem(state, object.itemId)
  if (object.itemId === ITEM_IDS.MACHETE) setFlag(state, FLAG_IDS.MACHETE_COLLECTED)
  if (object.itemId === ITEM_IDS.ROPE) setFlag(state, FLAG_IDS.ROPE_COLLECTED)

  return result(state, object.takeText || `You take the ${object.name}.`, {
    inventoryAdded: object.itemId,
    flagSet: object.itemId === ITEM_IDS.MACHETE ? FLAG_IDS.MACHETE_COLLECTED : object.itemId === ITEM_IDS.ROPE ? FLAG_IDS.ROPE_COLLECTED : null
  })
}

function cutVines(state, object) {
  const room = getRoom(state.currentRoom)
  const vines = object || resolveVisibleObject(room, state, "vines")
  if (!vines || vines.id !== OBJECT_IDS.VINES) return result(state, "There are no vines here that need your editorial judgment.")
  if (!nearEnough(state, vines)) return result(state, "You're too far away.")
  if (!hasItem(state, ITEM_IDS.MACHETE)) return result(state, "You swing your empty hands at the vines. The vines remain diplomatically unimpressed.")
  if (state.flags[FLAG_IDS.VINES_CUT]) return result(state, "The vines are already cut. They are coping privately.")

  setFlag(state, FLAG_IDS.VINES_CUT)
  return result(state, "You cut through the vines. The trail east opens with a leafy sigh.", {
    flagSet: FLAG_IDS.VINES_CUT,
    objectChanged: OBJECT_IDS.VINES
  })
}

function repairBridge(state, bridge) {
  if (!bridge || bridge.id !== OBJECT_IDS.BRIDGE) return result(state, "That does not look like a bridge, even by expedition standards.")
  if (!nearEnough(state, bridge)) return result(state, "You're too far away.")
  if (!hasItem(state, ITEM_IDS.ROPE)) return result(state, "You need the rope before the bridge can enjoy a redemption arc.")
  if (state.flags[FLAG_IDS.BRIDGE_REPAIRED]) return result(state, "The bridge is already repaired. Best not to over-manage it.")

  setFlag(state, FLAG_IDS.BRIDGE_REPAIRED)
  return result(state, "You lash the bridge into a shape that would make an engineer nod slowly. The crossing is open.", {
    flagSet: FLAG_IDS.BRIDGE_REPAIRED,
    objectChanged: OBJECT_IDS.BRIDGE
  })
}

function readJournal(state, journal) {
  if (!journal || journal.id !== OBJECT_IDS.JOURNAL) return result(state, "There is nothing useful to read there, unless mildew has developed a thesis.")
  if (!nearEnough(state, journal)) return result(state, "You're too far away.")
  setFlag(state, FLAG_IDS.JOURNAL_READ)
  addClue(state, CLUE_IDS.TEMPLE_SEQUENCE)
  return result(state, journal.readText, {
    flagSet: FLAG_IDS.JOURNAL_READ,
    clueAdded: CLUES[CLUE_IDS.TEMPLE_SEQUENCE]
  })
}

function useSymbol(state, symbol) {
  if (!symbol) return result(state, "That glyph is not accepting applications right now.")
  if (!nearEnough(state, symbol)) return result(state, "You're too far away.")
  if (state.flags[FLAG_IDS.TEMPLE_PUZZLE_SOLVED]) return result(state, "The door is already open. The glyphs look relieved to be off duty.")

  const nextSequence = [...state.puzzle.templeSequence, symbol.symbol]
  const expected = SYMBOL_SEQUENCE.slice(0, nextSequence.length)
  const matches = nextSequence.every((entry, index) => entry === expected[index])
  if (!matches) {
    state.puzzle.templeSequence = []
    return result(state, `The ${symbol.symbol} glyph clicks, then all three glyphs reset. Ancient security remains annoyingly good.`, {
      puzzleReset: true
    })
  }

  state.puzzle.templeSequence = nextSequence
  if (nextSequence.length === SYMBOL_SEQUENCE.length) {
    setFlag(state, FLAG_IDS.TEMPLE_PUZZLE_SOLVED)
    state.puzzle.templeSequence = []
    return result(state, "The glyphs glow in sequence. The stone door opens, having made its point.", {
      flagSet: FLAG_IDS.TEMPLE_PUZZLE_SOLVED,
      puzzleSolved: true,
      objectChanged: OBJECT_IDS.TEMPLE_DOOR
    })
  }

  return result(state, `The ${symbol.symbol} glyph holds a soft glow.`, {
    puzzleProgress: [...state.puzzle.templeSequence]
  })
}

function recoverArtifact(state, artifact) {
  if (!artifact || artifact.id !== OBJECT_IDS.ARTIFACT) return result(state, "That is not the artifact. It may still be emotionally important.")
  if (!nearEnough(state, artifact)) return result(state, "You're too far away.")
  if (hasItem(state, ITEM_IDS.ARTIFACT)) return result(state, "You already recovered the artifact. It is still humming smugly.")
  if (!state.flags[FLAG_IDS.TEMPLE_PUZZLE_SOLVED] || !state.flags[FLAG_IDS.JOURNAL_READ] || !state.flags[FLAG_IDS.BRIDGE_REPAIRED] || !state.flags[FLAG_IDS.VINES_CUT] || !state.flags[FLAG_IDS.MACHETE_COLLECTED] || !state.flags[FLAG_IDS.ROPE_COLLECTED]) {
    return result(state, "The artifact remains fixed in place. The temple wants the whole story, not a speedrun confession.")
  }

  addItem(state, ITEM_IDS.ARTIFACT)
  setFlag(state, FLAG_IDS.ARTIFACT_RECOVERED)
  state.completed = true
  state.rewardAuthorized = isCompletionEligible(state)
  return result(state, artifact.takeText, {
    inventoryAdded: ITEM_IDS.ARTIFACT,
    flagSet: FLAG_IDS.ARTIFACT_RECOVERED,
    gameCompleted: true,
    rewardAuthorized: state.rewardAuthorized
  })
}

function goDirection(state, direction) {
  const room = getRoom(state.currentRoom)
  const exit = room.exits.find((candidate) => candidate.direction === direction)
  if (!exit) return result(state, "You cannot go that way without first inventing more map.")
  if (!rectContainsPoint(expandRect(exit.area, 40), state.position)) {
    return result(state, `Move closer to the ${exit.name || direction} first.`)
  }
  if (!isAvailable(exit, state)) return result(state, exit.lockedMessage || "That way is blocked.")
  setRoom(state, exit)
  const destination = getRoom(state.currentRoom)
  return result(state, `You enter ${destination.name}. ${destination.look}`, {
    roomChanged: true
  })
}

function expandRect(rect, amount) {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2
  }
}

function handleUse(state, intent, room) {
  const item = resolveItem(intent.object)
  const targetObject = intent.target ? resolveVisibleObject(room, state, intent.target) : resolveVisibleObject(room, state, intent.object)
  const symbol = resolveVisibleObject(room, state, intent.object)

  if (symbol?.symbol && targetObject?.id !== OBJECT_IDS.TEMPLE_DOOR) {
    return useSymbol(state, symbol)
  }

  if (item === ITEM_IDS.MACHETE && targetObject?.id === OBJECT_IDS.VINES) {
    return cutVines(state, targetObject)
  }

  if (item === ITEM_IDS.ROPE && targetObject?.id === OBJECT_IDS.BRIDGE) {
    return repairBridge(state, targetObject)
  }

  if (item && !hasItem(state, item)) {
    return result(state, `You don't have the ${ITEM_NAMES[item] || item}.`)
  }

  // "push door" used to read "You can't use the door on the stone door."
  if (!intent.target && targetObject?.id === OBJECT_IDS.TEMPLE_DOOR) {
    return openTempleDoor(state, targetObject)
  }

  if (intent.target && targetObject) {
    return result(state, `You can't use the ${intent.object} on the ${targetObject.name}.`)
  }
  if (targetObject) return result(state, `Using the ${targetObject.name} achieves nothing on its own.`)
  return result(state, `You can't use "${intent.object}" that way.`)
}

// Objects that a player can sensibly "repair"/"fix", and the item each one needs.
// The room objective text says "repair the bridge", so that phrasing has to work
// even when the player does not name the rope.
const REPAIR_REQUIREMENTS = {
  [OBJECT_IDS.BRIDGE]: ITEM_IDS.ROPE
}

function openTempleDoor(state, object) {
  if (!nearEnough(state, object)) return result(state, "You're too far away.")
  if (!state.flags[FLAG_IDS.TEMPLE_PUZZLE_SOLVED]) {
    return result(state, "The stone door will not open by enthusiasm alone. Try the glyphs.")
  }
  return result(state, "The stone door is already open. The way east is clear.")
}

function handleRepair(state, intent, room) {
  const object = resolveVisibleObject(room, state, intent.object)
  if (!object) return result(state, missingObject(room, state, intent.object))

  const required = REPAIR_REQUIREMENTS[object.id]
  if (!required) return result(state, `You can't repair the ${object.name}.`)

  if (intent.item) {
    const named = resolveItem(intent.item)
    if (named !== required) {
      return result(state, `The ${ITEM_NAMES[named] || intent.item} will not repair the ${object.name}.`)
    }
  }

  if (!hasItem(state, required)) {
    return result(state, `You don't have the ${ITEM_NAMES[required] || required}.`)
  }

  if (object.id === OBJECT_IDS.BRIDGE) return repairBridge(state, object)
  return result(state, `The ${object.name} resists your improvements.`)
}

export function applyIntent(currentState, intent) {
  const state = cloneAdventureState(currentState)
  const room = getRoom(state.currentRoom)

  switch (intent.verb) {
    case "help":
      return result(state, helpText())
    case "inventory":
      return result(state, inventoryText(state))
    case "look": {
      if (!intent.object) return result(state, roomLook(state))
      const object = resolveVisibleObject(room, state, intent.object)
      if (object) return result(state, object.description || `You see ${object.name}.`)
      const item = resolveItem(intent.object)
      if (item && hasItem(state, item)) return result(state, `Your ${ITEM_NAMES[item]} is ready for questionable field decisions.`)
      return result(state, missingObject(room, state, intent.object))
    }
    case "take": {
      const object = resolveVisibleObject(room, state, intent.object)
      if (!object) {
        const hidden = resolveAnyRoomObject(room, intent.object)
        if (hidden?.itemId && hasItem(state, hidden.itemId)) return result(state, `You already have the ${ITEM_NAMES[hidden.itemId] || hidden.name}.`)
        return result(state, missingObject(room, state, intent.object))
      }
      if (object.id === OBJECT_IDS.ARTIFACT) return recoverArtifact(state, object)
      return takeObject(state, object)
    }
    case "cut": {
      const item = intent.item ? resolveItem(intent.item) : ITEM_IDS.MACHETE
      const object = resolveVisibleObject(room, state, intent.object)
      if (item !== ITEM_IDS.MACHETE) return result(state, `Cutting with ${intent.item || "that"} is bold, but not useful.`)
      if (!object) return result(state, missingObject(room, state, intent.object))
      if (object.id === OBJECT_IDS.VINES) return cutVines(state, object)
      return result(state, `Cutting the ${object.name} would not improve this expedition.`)
    }
    case "read": {
      const object = resolveVisibleObject(room, state, intent.object)
      if (!object) return result(state, missingObject(room, state, intent.object))
      return readJournal(state, object)
    }
    case "open": {
      const object = resolveVisibleObject(room, state, intent.object)
      if (!object) return result(state, missingObject(room, state, intent.object))
      if (object.id === OBJECT_IDS.TEMPLE_DOOR) return openTempleDoor(state, object)
      return result(state, `Opening the ${object.name} reveals mostly air and disappointment.`)
    }
    case "talk": {
      return result(state, `You address ${intent.object}. The jungle considers this and offers no formal reply.`)
    }
    case "use":
      return handleUse(state, intent, room)
    case "repair":
      return handleRepair(state, intent, room)
    case "go":
      return goDirection(state, intent.direction)
    case "unknown": {
      if (intent.suggestion) {
        return result(state, `I don't understand "${intent.text}". Did you mean ${intent.suggestion.toUpperCase()}? Try HELP for the full list.`)
      }
      return result(state, `I don't understand "${intent.text}". Try HELP if the jungle has started winning.`)
    }
    default:
      return result(state, "That is not a valid expedition action.")
  }
}

export function applyCommand(currentState, rawCommand) {
  if (typeof rawCommand !== "string") {
    return result(cloneAdventureState(currentState), "Invalid command packet. The server only accepts typed commands.")
  }

  const parsed = parseCommand(rawCommand)
  if (!parsed.ok) return result(cloneAdventureState(currentState), parsed.message)
  return applyIntent(currentState, parsed.intent)
}

export function canAuthorizeReward(state) {
  return isCompletionEligible(state) && state.rewardAuthorized && !state.rewardPacketIssued
}

// A restored session that already had its packet issued must be able to get a
// fresh copy: the signed packet lives only in client memory, so a reconnect or
// server restart before the claim transaction would otherwise strand the
// player. Re-signing the same fields yields the same authorization, and the
// contract still enforces one-time claiming on-chain.
export function canReissueRewardPacket(state) {
  return isCompletionEligible(state) && state.rewardAuthorized && state.rewardPacketIssued
}

export function markRewardPacketIssued(currentState) {
  const state = cloneAdventureState(currentState)
  state.rewardPacketIssued = true
  return state
}

export function getInitialMessage(state) {
  return `THE LOST TEMPLE. ${roomLook(state)} Type HELP for commands.`
}

