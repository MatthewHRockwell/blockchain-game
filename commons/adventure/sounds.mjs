// Which sound a command result should make.
//
// Kept here, pure and server-shape-aware, so it is unit-testable and cannot drift
// from the state model. The client owns synthesis; this module only decides.
//
// Sounds are chosen from the authoritative state transition rather than by matching
// on prose, so a reworded message cannot silently lose its sound effect. The one
// exception is the refusal cue, which by definition has no state change to read.

import { CLUE_IDS, FLAG_IDS } from "./schema.mjs"

export const SOUND_IDS = {
  FOOTSTEP: "footstep",
  TAKE: "take",
  CUT: "cut",
  REPAIR: "repair",
  CLUE: "clue",
  GLYPH: "glyph",
  GLYPH_WRONG: "glyphWrong",
  DOOR: "door",
  ARTIFACT: "artifact",
  ROOM_CHANGE: "roomChange",
  REFUSED: "refused",
  CLAIMED: "claimed"
}

/**
 * Messages that mean "that didn't work". Deliberately a short, explicit list: a
 * message that is merely informational (a room description, an inventory listing)
 * must not buzz at the player.
 */
const REFUSAL_PATTERNS = [
  /too far away/i,
  /don't have the/i,
  /don't see/i,
  /don't understand/i,
  /don't know how to go/i,
  /which one do you mean/i,
  /will not repair/i,
  /can't repair/i,
  /can't use/i,
  /not something you can/i,
  /remains fixed in place/i,
  /will not open by enthusiasm/i,
  /needs? repair/i,
  /already/i,
  /^move closer/i,
  /invalid command packet/i,
  /say something expedition-adjacent/i
]

export function isRefusal(message) {
  const text = String(message || "")
  if (!text) return false
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(text))
}

function flagTurnedOn(previous, next, flag) {
  return Boolean(next?.flags?.[flag]) && !previous?.flags?.[flag]
}

function count(value) {
  return Array.isArray(value) ? value.length : 0
}

/**
 * Sound for one command result, or null for silence.
 *
 * @param {object} params
 * @param {object|undefined} params.previous state before the command
 * @param {object|undefined} params.next state after the command
 * @param {string|undefined} params.message the server's reply
 * @returns {{ id: string, step?: number } | null}
 */
export function soundForResult({ previous, next, message } = {}) {
  if (next) {
    // Most specific milestone first: recovering the artifact ends the expedition,
    // so it should not be masked by the inventory pickup that accompanies it.
    if (flagTurnedOn(previous, next, FLAG_IDS.ARTIFACT_RECOVERED)) {
      return { id: SOUND_IDS.ARTIFACT }
    }
    if (flagTurnedOn(previous, next, FLAG_IDS.TEMPLE_PUZZLE_SOLVED)) {
      return { id: SOUND_IDS.DOOR }
    }
    if (flagTurnedOn(previous, next, FLAG_IDS.BRIDGE_REPAIRED)) {
      return { id: SOUND_IDS.REPAIR }
    }
    if (flagTurnedOn(previous, next, FLAG_IDS.VINES_CUT)) {
      return { id: SOUND_IDS.CUT }
    }

    const sequenceBefore = count(previous?.puzzle?.templeSequence)
    const sequenceAfter = count(next?.puzzle?.templeSequence)
    if (sequenceAfter > sequenceBefore) {
      // step drives the pitch, so the glyphs rise as the sequence builds.
      return { id: SOUND_IDS.GLYPH, step: sequenceAfter }
    }
    if (sequenceAfter < sequenceBefore) {
      return { id: SOUND_IDS.GLYPH_WRONG }
    }

    if (count(next.inventory) > count(previous?.inventory)) {
      return { id: SOUND_IDS.TAKE }
    }

    if (count(next.discoveredClues) > count(previous?.discoveredClues)) {
      return { id: SOUND_IDS.CLUE }
    }

    if (previous?.currentRoom && previous.currentRoom !== next.currentRoom) {
      return { id: SOUND_IDS.ROOM_CHANGE }
    }
  }

  if (isRefusal(message)) return { id: SOUND_IDS.REFUSED }
  return null
}

/** Clue ids are re-exported so the client can special-case the journal chime. */
export { CLUE_IDS }
