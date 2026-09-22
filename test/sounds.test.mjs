import test from "node:test"
import assert from "node:assert/strict"
import { SOUND_IDS, isRefusal, soundForResult } from "../commons/adventure/sounds.mjs"
import { FLAG_IDS } from "../commons/adventure/schema.mjs"

function stateWith(overrides = {}) {
  return {
    currentRoom: "crash-site",
    inventory: [],
    flags: {},
    discoveredClues: [],
    puzzle: { templeSequence: [] },
    ...overrides
  }
}

test("milestone flags pick their own sound", () => {
  const cases = [
    [FLAG_IDS.ARTIFACT_RECOVERED, SOUND_IDS.ARTIFACT],
    [FLAG_IDS.TEMPLE_PUZZLE_SOLVED, SOUND_IDS.DOOR],
    [FLAG_IDS.BRIDGE_REPAIRED, SOUND_IDS.REPAIR],
    [FLAG_IDS.VINES_CUT, SOUND_IDS.CUT]
  ]

  for (const [flag, expected] of cases) {
    const sound = soundForResult({
      previous: stateWith(),
      next: stateWith({ flags: { [flag]: true } })
    })
    assert.equal(sound?.id, expected, flag)
  }
})

test("a flag that was already set makes no sound", () => {
  const already = stateWith({ flags: { [FLAG_IDS.VINES_CUT]: true } })
  assert.equal(soundForResult({ previous: already, next: already }), null)
})

test("recovering the artifact outranks the inventory pickup it comes with", () => {
  // "take artifact" both adds an item and sets the flag; the finale must win.
  const sound = soundForResult({
    previous: stateWith(),
    next: stateWith({
      inventory: ["artifact"],
      flags: { [FLAG_IDS.ARTIFACT_RECOVERED]: true }
    })
  })
  assert.equal(sound?.id, SOUND_IDS.ARTIFACT)
})

test("glyph presses rise in pitch and a reset buzzes", () => {
  const first = soundForResult({
    previous: stateWith(),
    next: stateWith({ puzzle: { templeSequence: ["star"] } })
  })
  assert.equal(first?.id, SOUND_IDS.GLYPH)
  assert.equal(first?.step, 1)

  const second = soundForResult({
    previous: stateWith({ puzzle: { templeSequence: ["star"] } }),
    next: stateWith({ puzzle: { templeSequence: ["star", "rain"] } })
  })
  assert.equal(second?.step, 2)

  const reset = soundForResult({
    previous: stateWith({ puzzle: { templeSequence: ["star", "rain"] } }),
    next: stateWith({ puzzle: { templeSequence: [] } })
  })
  assert.equal(reset?.id, SOUND_IDS.GLYPH_WRONG)
})

test("picking things up, reading clues, and changing room each have a cue", () => {
  const took = soundForResult({
    previous: stateWith(),
    next: stateWith({ inventory: ["machete"] })
  })
  assert.equal(took?.id, SOUND_IDS.TAKE)

  const clue = soundForResult({
    previous: stateWith(),
    next: stateWith({ discoveredClues: [{ id: "templeSequence" }] })
  })
  assert.equal(clue?.id, SOUND_IDS.CLUE)

  const moved = soundForResult({
    previous: stateWith({ currentRoom: "crash-site" }),
    next: stateWith({ currentRoom: "jungle-trail" })
  })
  assert.equal(moved?.id, SOUND_IDS.ROOM_CHANGE)
})

test("refusals buzz but descriptive replies stay silent", () => {
  const refusals = [
    "You're too far away.",
    "You don't have the rope.",
    'I don\'t see "glyphs" here.',
    'I don\'t understand "xyzzy".',
    "Which one do you mean: star glyph, rain glyph or jaguar glyph?",
    "The machete will not repair the damaged bridge.",
    "Move closer to the narrow trail first.",
    "The vines are already cut. They are coping privately."
  ]
  for (const message of refusals) {
    assert.equal(isRefusal(message), true, message)
    const unchanged = stateWith()
    assert.equal(soundForResult({ previous: unchanged, next: unchanged, message })?.id, SOUND_IDS.REFUSED, message)
  }

  const quiet = [
    "The survey plane rests in a heroic number of pieces.",
    "You are carrying: machete.",
    "Your inventory is empty, which is tidy but not encouraging.",
    "The aircraft has achieved the aviation equivalent of a bad day."
  ]
  for (const message of quiet) {
    assert.equal(isRefusal(message), false, message)
    const unchanged = stateWith()
    assert.equal(soundForResult({ previous: unchanged, next: unchanged, message }), null, message)
  }
})

test("a successful action never also buzzes", () => {
  // A state change wins over any refusal-looking wording in the same reply.
  const sound = soundForResult({
    previous: stateWith(),
    next: stateWith({ inventory: ["machete"] }),
    message: "You already had trouble seeing it, but you don't see the problem now."
  })
  assert.equal(sound?.id, SOUND_IDS.TAKE)
})

test("missing or empty input is silent rather than throwing", () => {
  assert.equal(soundForResult(), null)
  assert.equal(soundForResult({}), null)
  assert.equal(soundForResult({ message: "" }), null)
  assert.equal(isRefusal(undefined), false)
})

test("the server's refused flag wins over the message patterns", () => {
  const unchanged = stateWith()

  // A failure whose wording is in no pattern list still buzzes.
  const flagged = soundForResult({
    previous: unchanged,
    next: unchanged,
    message: "You cannot take the damaged aircraft. It has chosen a more rooted lifestyle.",
    refused: true
  })
  assert.equal(flagged?.id, SOUND_IDS.REFUSED)

  // And an inspection stays silent even if its prose trips a pattern.
  const notRefused = soundForResult({
    previous: unchanged,
    next: unchanged,
    message: "You don't see anything already worth noting.",
    refused: false
  })
  assert.equal(notRefused, null)
})
