import test from "node:test"
import assert from "node:assert/strict"
import { parseCommand } from "../commons/adventure/parser.mjs"

function parsed(command) {
  const result = parseCommand(command)
  assert.equal(result.ok, true)
  return result.intent
}

test("normalizes machete pickup commands", () => {
  assert.deepEqual(pick(parsed("TAKE MACHETE")), { verb: "take", object: "machete" })
  assert.deepEqual(pick(parsed("GET MACHETE")), { verb: "take", object: "machete" })
  assert.deepEqual(pick(parsed("PICK UP THE MACHETE")), { verb: "take", object: "machete" })
})

test("normalizes use and cut commands", () => {
  assert.deepEqual(pick(parsed("USE MACHETE ON VINES")), { verb: "use", object: "machete", target: "vines" })
  assert.deepEqual(pick(parsed("CUT VINES WITH MACHETE")), { verb: "cut", object: "vines", item: "machete" })
})

test("handles malformed and unknown commands", () => {
  const empty = parseCommand("   ")
  assert.equal(empty.ok, false)
  assert.match(empty.message, /Say something/)

  const unknown = parsed("dance with the door")
  assert.equal(unknown.verb, "unknown")
  assert.equal(unknown.text, "dance with the door")
})

test("normalizes direction commands", () => {
  assert.deepEqual(pick(parsed("GO EAST")), { verb: "go", direction: "east" })
  assert.deepEqual(pick(parsed("N")), { verb: "go", direction: "north" })
})

function pick(intent) {
  const selected = { verb: intent.verb }
  for (const key of ["object", "target", "item", "direction"]) {
    if (intent[key]) selected[key] = intent[key]
  }
  return selected
}

test("accepts the verbs the room objectives actually use", () => {
  // The objective text says "repair the bridge" and "Clear the vines", so these
  // must parse even though the original parser only accepted USE and CUT.
  for (const command of ["repair bridge", "fix the bridge", "mend bridge", "lash bridge"]) {
    const parsed = parseCommand(command)
    assert.equal(parsed.ok, true, command)
    assert.equal(parsed.intent.verb, "repair", command)
    assert.equal(parsed.intent.object, "bridge", command)
  }

  for (const command of ["clear vines", "chop the vines", "slash vines", "hack vines"]) {
    const parsed = parseCommand(command)
    assert.equal(parsed.ok, true, command)
    assert.equal(parsed.intent.verb, "cut", command)
    assert.equal(parsed.intent.object, "vines", command)
  }
})

test("repair and cut accept an explicit item", () => {
  const repair = parseCommand("repair the bridge with the rope")
  assert.equal(repair.intent.verb, "repair")
  assert.equal(repair.intent.object, "bridge")
  assert.equal(repair.intent.item, "rope")

  const cut = parseCommand("clear vines using machete")
  assert.equal(cut.intent.verb, "cut")
  assert.equal(cut.intent.object, "vines")
  assert.equal(cut.intent.item, "machete")
})

test("bare look and x resolve an object", () => {
  for (const command of ["look vines", "x vines", "study vines"]) {
    const parsed = parseCommand(command)
    assert.equal(parsed.intent.verb, "look", command)
    assert.equal(parsed.intent.object, "vines", command)
  }
  // Room-wide look must still win over the object form.
  assert.equal(parseCommand("look").intent.object, undefined)
  assert.equal(parseCommand("look around").intent.object, undefined)
})

test("inventory phrasings do not fall through to look at", () => {
  for (const command of ["inventory", "inv", "i", "items", "check inventory", "look at inventory"]) {
    const parsed = parseCommand(command)
    assert.equal(parsed.intent.verb, "inventory", command)
  }
})

test("an unknown verb suggests the closest known one", () => {
  const typo = parseCommand("reed journal")
  assert.equal(typo.intent.verb, "unknown")
  assert.equal(typo.intent.suggestion, "read")

  const nonsense = parseCommand("xyzzy plugh")
  assert.equal(nonsense.intent.verb, "unknown")
  assert.equal(nonsense.intent.suggestion, undefined)
})

test("every command form the original parser accepted still works", () => {
  // Guard against silently dropping a verb while reorganising the verb lists.
  // "check <object>" was lost once already: it fell through to unknown and the
  // did-you-mean helpfully suggested HACK.
  const ORIGINAL_FORMS = [
    ["help", "help"], ["?", "help"],
    ["inventory", "inventory"], ["inv", "inventory"], ["i", "inventory"],
    ["look", "look"], ["l", "look"],
    ["look at aircraft", "look"], ["examine aircraft", "look"],
    ["inspect aircraft", "look"], ["check aircraft", "look"],
    ["pick up machete", "take"], ["pickup machete", "take"],
    ["take machete", "take"], ["get machete", "take"],
    ["grab machete", "take"], ["collect machete", "take"],
    ["use machete on vines", "use"], ["use rope with bridge", "use"],
    ["use star", "use"], ["press star", "use"],
    ["push star", "use"], ["touch star", "use"],
    ["cut vines with machete", "cut"], ["cut vines", "cut"],
    ["read journal", "read"], ["open door", "open"],
    ["talk to jungle", "talk"], ["speak to jungle", "talk"], ["ask jungle", "talk"],
    ["go east", "go"], ["walk east", "go"], ["move east", "go"],
    ["head east", "go"], ["travel east", "go"],
    ["east", "go"], ["e", "go"], ["n", "go"]
  ]

  for (const [command, expectedVerb] of ORIGINAL_FORMS) {
    const parsed = parseCommand(command)
    assert.equal(parsed.ok, true, `"${command}" should parse`)
    assert.equal(parsed.intent.verb, expectedVerb, `"${command}" should be ${expectedVerb}`)
    assert.notEqual(parsed.intent.verb, "unknown", `"${command}" regressed to unknown`)
  }
})
