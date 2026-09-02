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
