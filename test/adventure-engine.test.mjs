import test from "node:test"
import assert from "node:assert/strict"
import { applyCommand, canAuthorizeReward, canReissueRewardPacket, markRewardPacketIssued } from "../server/game/adventure/engine.js"
import { createAdventureState, forceCompleteForTests } from "../server/game/adventure/state.js"
import { getRoom } from "../commons/adventure/rooms.mjs"
import { FLAG_IDS, ITEM_IDS, OBJECT_IDS, ROOM_IDS } from "../commons/adventure/schema.mjs"

const ADDRESS = "0x0000000000000000000000000000000000000001"

function stateIn(roomId, objectId) {
  const state = createAdventureState(ADDRESS)
  state.currentRoom = roomId
  if (objectId) state.position = { ...objectIn(roomId, objectId).position }
  return state
}

function objectIn(roomId, objectId) {
  const object = getRoom(roomId).objects.find(candidate => candidate.id === objectId)
  assert.ok(object, `missing object ${objectId}`)
  return object
}

function run(state, command) {
  return applyCommand(state, command).state
}

test("rejects remote machete pickup and prevents duplicates", () => {
  const far = createAdventureState(ADDRESS)
  const farResult = applyCommand(far, "take machete")
  assert.equal(farResult.state.flags[FLAG_IDS.MACHETE_COLLECTED], false)
  assert.equal(farResult.state.inventory.length, 0)
  assert.match(farResult.message, /too far/i)

  let near = stateIn(ROOM_IDS.CRASH_SITE, OBJECT_IDS.MACHETE)
  near = run(near, "take machete")
  near = run(near, "get machete")
  assert.deepEqual(near.inventory, [ITEM_IDS.MACHETE])
})

test("requires machete before cutting vines", () => {
  const noMachete = stateIn(ROOM_IDS.JUNGLE_TRAIL, OBJECT_IDS.VINES)
  const rejected = applyCommand(noMachete, "cut vines")
  assert.equal(rejected.state.flags[FLAG_IDS.VINES_CUT], false)
  assert.match(rejected.message, /empty hands|machete/i)

  let state = stateIn(ROOM_IDS.CRASH_SITE, OBJECT_IDS.MACHETE)
  state = run(state, "take machete")
  state.currentRoom = ROOM_IDS.JUNGLE_TRAIL
  state.position = { ...objectIn(ROOM_IDS.JUNGLE_TRAIL, OBJECT_IDS.VINES).position }
  state = run(state, "use machete on vines")
  assert.equal(state.flags[FLAG_IDS.VINES_CUT], true)
})

test("requires rope before repairing bridge", () => {
  const noRope = stateIn(ROOM_IDS.RIVER_CROSSING, OBJECT_IDS.BRIDGE)
  const rejected = applyCommand(noRope, "use rope on bridge")
  assert.equal(rejected.state.flags[FLAG_IDS.BRIDGE_REPAIRED], false)
  assert.match(rejected.message, /need the rope/i)

  let state = stateIn(ROOM_IDS.RIVER_CROSSING, OBJECT_IDS.ROPE)
  state = run(state, "take rope")
  state.position = { ...objectIn(ROOM_IDS.RIVER_CROSSING, OBJECT_IDS.BRIDGE).position }
  state = run(state, "use rope on bridge")
  state = run(state, "use rope on bridge")
  assert.equal(state.flags[FLAG_IDS.BRIDGE_REPAIRED], true)
  assert.deepEqual(state.inventory, [ITEM_IDS.ROPE])
})

test("records the journal clue without duplicating clue state", () => {
  let state = stateIn(ROOM_IDS.ABANDONED_CAMP, OBJECT_IDS.JOURNAL)
  state = run(state, "read journal")
  state = run(state, "read journal")
  assert.equal(state.flags[FLAG_IDS.JOURNAL_READ], true)
  assert.equal(state.discoveredClues.length, 1)
})

test("temple puzzle rejects wrong sequence and accepts correct sequence", () => {
  let state = stateIn(ROOM_IDS.TEMPLE_ENTRANCE, OBJECT_IDS.SYMBOL_STAR)
  state = run(state, "use star")
  state.position = { ...objectIn(ROOM_IDS.TEMPLE_ENTRANCE, OBJECT_IDS.SYMBOL_JAGUAR).position }
  let wrong = run(state, "use jaguar")
  assert.equal(wrong.flags[FLAG_IDS.TEMPLE_PUZZLE_SOLVED], false)
  assert.deepEqual(wrong.puzzle.templeSequence, [])

  let correct = stateIn(ROOM_IDS.TEMPLE_ENTRANCE, OBJECT_IDS.SYMBOL_STAR)
  correct = run(correct, "use star")
  correct.position = { ...objectIn(ROOM_IDS.TEMPLE_ENTRANCE, OBJECT_IDS.SYMBOL_RAIN).position }
  correct = run(correct, "use rain")
  correct.position = { ...objectIn(ROOM_IDS.TEMPLE_ENTRANCE, OBJECT_IDS.SYMBOL_JAGUAR).position }
  correct = run(correct, "use jaguar")
  assert.equal(correct.flags[FLAG_IDS.TEMPLE_PUZZLE_SOLVED], true)
})

test("requires full progression before artifact recovery and reward authorization", () => {
  const premature = applyCommand(stateIn(ROOM_IDS.INNER_TEMPLE, OBJECT_IDS.ARTIFACT), "take artifact")
  assert.equal(premature.state.flags[FLAG_IDS.ARTIFACT_RECOVERED], false)
  assert.equal(premature.state.rewardAuthorized, false)

  let state = stateIn(ROOM_IDS.INNER_TEMPLE, OBJECT_IDS.ARTIFACT)
  forceCompleteForTests(state)
  const completed = applyCommand(state, "take artifact")
  assert.equal(completed.state.flags[FLAG_IDS.ARTIFACT_RECOVERED], true)
  assert.equal(completed.state.completed, true)
  assert.equal(completed.state.rewardAuthorized, true)
  assert.equal(canAuthorizeReward(completed.state), true)
})

test("issued reward packet is reissuable after restore but never double-authorized", () => {
  let state = stateIn(ROOM_IDS.INNER_TEMPLE, OBJECT_IDS.ARTIFACT)
  forceCompleteForTests(state)
  state = applyCommand(state, "take artifact").state
  assert.equal(canReissueRewardPacket(state), false)

  const issued = markRewardPacketIssued(state)
  assert.equal(canAuthorizeReward(issued), false)
  assert.equal(canReissueRewardPacket(issued), true)

  const incomplete = createAdventureState(ADDRESS)
  incomplete.rewardPacketIssued = true
  incomplete.rewardAuthorized = true
  assert.equal(canReissueRewardPacket(incomplete), false)
})

test("anti-cheat packets cannot mutate authoritative state", () => {
  const state = createAdventureState(ADDRESS)
  const nonString = applyCommand(state, { verb: "take", object: "machete" })
  assert.equal(nonString.state.flags[FLAG_IDS.MACHETE_COLLECTED], false)
  assert.equal(nonString.state.currentRoom, ROOM_IDS.CRASH_SITE)

  const forgedStatePacket = applyCommand(state, {
    currentRoom: ROOM_IDS.INNER_TEMPLE,
    inventory: [ITEM_IDS.MACHETE, ITEM_IDS.ROPE, ITEM_IDS.ARTIFACT],
    flags: {
      [FLAG_IDS.MACHETE_COLLECTED]: true,
      [FLAG_IDS.VINES_CUT]: true,
      [FLAG_IDS.ROPE_COLLECTED]: true,
      [FLAG_IDS.BRIDGE_REPAIRED]: true,
      [FLAG_IDS.JOURNAL_READ]: true,
      [FLAG_IDS.TEMPLE_PUZZLE_SOLVED]: true,
      [FLAG_IDS.ARTIFACT_RECOVERED]: true
    },
    completed: true,
    rewardAuthorized: true
  })
  assert.equal(forgedStatePacket.state.currentRoom, ROOM_IDS.CRASH_SITE)
  assert.deepEqual(forgedStatePacket.state.inventory, [])
  assert.equal(forgedStatePacket.state.completed, false)
  assert.equal(forgedStatePacket.state.rewardAuthorized, false)

  const forgedJson = applyCommand(state, JSON.stringify({
    currentRoom: ROOM_IDS.INNER_TEMPLE,
    inventory: [ITEM_IDS.MACHETE],
    completed: true,
    rewardAuthorized: true
  }))
  assert.equal(forgedJson.state.currentRoom, ROOM_IDS.CRASH_SITE)
  assert.deepEqual(forgedJson.state.inventory, [])
  assert.equal(forgedJson.state.completed, false)
  assert.equal(forgedJson.state.rewardAuthorized, false)

  const forgedCompletion = applyCommand(state, "artifactRecovered true rewardAuthorized true")
  assert.equal(forgedCompletion.state.completed, false)
  assert.equal(forgedCompletion.state.rewardAuthorized, false)

  const forgedRoom = applyCommand(state, "go east")
  assert.equal(forgedRoom.state.currentRoom, ROOM_IDS.CRASH_SITE)
})

test("server-authorized room exits require position and prerequisites", () => {
  let state = createAdventureState(ADDRESS)
  let result = applyCommand(state, "go east")
  assert.equal(result.state.currentRoom, ROOM_IDS.CRASH_SITE)
  assert.match(result.message, /Move closer/i)

  state.position = { x: 610, y: 180 }
  result = applyCommand(state, "go east")
  assert.equal(result.state.currentRoom, ROOM_IDS.JUNGLE_TRAIL)

  result.state.position = { x: 610, y: 180 }
  const blocked = applyCommand(result.state, "go east")
  assert.equal(blocked.state.currentRoom, ROOM_IDS.JUNGLE_TRAIL)
  assert.match(blocked.message, /vines disagree/i)

  const unsolvedTemple = stateIn(ROOM_IDS.TEMPLE_ENTRANCE, OBJECT_IDS.TEMPLE_DOOR)
  unsolvedTemple.position = { x: 610, y: 180 }
  const bypass = applyCommand(unsolvedTemple, "go east")
  assert.equal(bypass.state.currentRoom, ROOM_IDS.TEMPLE_ENTRANCE)
  assert.match(bypass.message, /door remains sealed/i)
})

test("repair bridge works without naming the rope", () => {
  const withRope = stateIn(ROOM_IDS.RIVER_CROSSING, OBJECT_IDS.BRIDGE)
  withRope.inventory = [ITEM_IDS.ROPE]
  const repaired = applyCommand(withRope, "repair the bridge")
  assert.equal(repaired.state.flags[FLAG_IDS.BRIDGE_REPAIRED], true)
})

test("repair bridge requires the rope and rejects the wrong item", () => {
  const empty = stateIn(ROOM_IDS.RIVER_CROSSING, OBJECT_IDS.BRIDGE)
  const noRope = applyCommand(empty, "fix bridge")
  assert.equal(noRope.state.flags[FLAG_IDS.BRIDGE_REPAIRED], false)
  assert.match(noRope.message, /don't have the/i)

  const wrongItem = stateIn(ROOM_IDS.RIVER_CROSSING, OBJECT_IDS.BRIDGE)
  wrongItem.inventory = [ITEM_IDS.ROPE, ITEM_IDS.MACHETE]
  const rejected = applyCommand(wrongItem, "repair bridge with machete")
  assert.equal(rejected.state.flags[FLAG_IDS.BRIDGE_REPAIRED], false)
  assert.match(rejected.message, /will not repair/i)
})

test("clear vines behaves like cutting them", () => {
  const armed = stateIn(ROOM_IDS.JUNGLE_TRAIL, OBJECT_IDS.VINES)
  armed.inventory = [ITEM_IDS.MACHETE]
  const cleared = applyCommand(armed, "clear the vines")
  assert.equal(cleared.state.flags[FLAG_IDS.VINES_CUT], true)

  const bare = stateIn(ROOM_IDS.JUNGLE_TRAIL, OBJECT_IDS.VINES)
  const failed = applyCommand(bare, "chop vines")
  assert.equal(failed.state.flags[FLAG_IDS.VINES_CUT], false)
})

test("nothing but the bridge claims to be repairable", () => {
  const atVines = stateIn(ROOM_IDS.JUNGLE_TRAIL, OBJECT_IDS.VINES)
  atVines.inventory = [ITEM_IDS.MACHETE]
  const refused = applyCommand(atVines, "repair vines")
  assert.match(refused.message, /can.t repair the/i)
})

test("read case resolves the journal rather than the camp", () => {
  const atJournal = stateIn(ROOM_IDS.ABANDONED_CAMP, OBJECT_IDS.JOURNAL)
  const read = applyCommand(atJournal, "read case")
  assert.equal(read.state.flags[FLAG_IDS.JOURNAL_READ], true)
})

test("a partial noun phrase resolves when it is unambiguous", () => {
  const atAircraft = stateIn(ROOM_IDS.CRASH_SITE, OBJECT_IDS.AIRCRAFT)
  const looked = applyCommand(atAircraft, "look at the damaged plane")
  assert.match(looked.message, /aviation/i)
})

test("pushing the temple door explains itself instead of producing broken grammar", () => {
  const atDoor = stateIn(ROOM_IDS.TEMPLE_ENTRANCE, OBJECT_IDS.TEMPLE_DOOR)
  const pushed = applyCommand(atDoor, "push door")
  assert.doesNotMatch(pushed.message, /use the door on the/i)
  assert.match(pushed.message, /glyphs/i)
})

test("an unrecognised verb suggests a correction", () => {
  const state = stateIn(ROOM_IDS.ABANDONED_CAMP, OBJECT_IDS.JOURNAL)
  const typo = applyCommand(state, "reed journal")
  assert.match(typo.message, /did you mean READ/i)
})

test("an ambiguous noun asks which one rather than denying it exists", () => {
  const atDoor = stateIn(ROOM_IDS.TEMPLE_ENTRANCE, OBJECT_IDS.TEMPLE_DOOR)
  const asked = applyCommand(atDoor, "look at glyphs")
  assert.match(asked.message, /which one do you mean/i)
  assert.doesNotMatch(asked.message, /don't see/i)
})

test("failed actions are classified as refused, inspections are not", () => {
  // The client picks the refusal sound from this flag rather than pattern-matching
  // the message, so every failed action must carry it — not just the ones whose
  // wording someone remembered to list.
  const refusedCases = [
    [stateIn(ROOM_IDS.CRASH_SITE, OBJECT_IDS.AIRCRAFT), "take aircraft"],
    [stateIn(ROOM_IDS.CRASH_SITE, OBJECT_IDS.MACHETE), "go north"],
    [stateIn(ROOM_IDS.ABANDONED_CAMP, OBJECT_IDS.CAMP), "open camp"],
    [stateIn(ROOM_IDS.CRASH_SITE, OBJECT_IDS.MACHETE), "talk to jungle"],
    [stateIn(ROOM_IDS.CRASH_SITE, OBJECT_IDS.MACHETE), "xyzzy"],
    [stateIn(ROOM_IDS.RIVER_CROSSING, OBJECT_IDS.BRIDGE), "repair bridge"],
    [createAdventureState(ADDRESS), "take machete"]
  ]
  for (const [state, command] of refusedCases) {
    assert.equal(applyCommand(state, command).refused, true, command)
  }

  const quietCases = [
    [stateIn(ROOM_IDS.CRASH_SITE, OBJECT_IDS.MACHETE), "look"],
    [stateIn(ROOM_IDS.CRASH_SITE, OBJECT_IDS.AIRCRAFT), "look at aircraft"],
    [stateIn(ROOM_IDS.CRASH_SITE, OBJECT_IDS.MACHETE), "inventory"],
    [stateIn(ROOM_IDS.CRASH_SITE, OBJECT_IDS.MACHETE), "help"],
    [stateIn(ROOM_IDS.CRASH_SITE, OBJECT_IDS.MACHETE), "take machete"]
  ]
  for (const [state, command] of quietCases) {
    assert.notEqual(applyCommand(state, command).refused, true, command)
  }
})

test("a non-string command packet is refused rather than silently ignored", () => {
  const state = stateIn(ROOM_IDS.CRASH_SITE, OBJECT_IDS.MACHETE)
  assert.equal(applyCommand(state, { evil: true }).refused, true)
})
