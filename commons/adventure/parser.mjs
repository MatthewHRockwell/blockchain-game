import { DIRECTION_ALIASES } from "./schema.mjs"

const FILLER_WORDS = new Set(["the", "a", "an", "please", "some", "my"])

// Verbs the game's own room text uses, mapped onto the intents the engine already
// implements. The objective lines say "Clear the vines" and "repair the bridge", so
// those words have to work; players reach for the neighbouring synonyms too.
const CUT_VERBS = ["cut", "clear", "chop", "slash", "hack", "cut through", "cut down"]
const REPAIR_VERBS = ["repair", "fix", "mend", "tie", "attach", "lash", "secure", "rebuild"]
const TAKE_VERBS = ["take", "get", "grab", "collect", "pick up", "pickup"]
const LOOK_VERBS = ["look at", "look", "examine", "inspect", "check", "x", "study"]
const USE_VERBS = ["use", "press", "push", "touch", "activate"]
const GO_VERBS = ["go", "walk", "move", "head", "travel"]
const TALK_VERBS = ["talk to", "speak to", "talk", "speak", "ask"]

const INVENTORY_PHRASES = new Set([
  "inventory", "inv", "i", "items", "bag", "pack",
  "check inventory", "look at inventory", "look inventory",
  "show inventory", "examine inventory", "my inventory"
])

const LOOK_PHRASES = new Set(["look", "l", "look around", "look room"])

/** First words we recognise, used to suggest a correction for a typo. */
const KNOWN_VERB_WORDS = [
  ...CUT_VERBS, ...REPAIR_VERBS, ...TAKE_VERBS, ...LOOK_VERBS,
  ...USE_VERBS, ...GO_VERBS, ...TALK_VERBS,
  "read", "open", "help", "inventory"
].map((phrase) => phrase.split(" ")[0])

function cleanInput(rawCommand) {
  return String(rawCommand || "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function stripFiller(phrase) {
  return phrase
    .split(" ")
    .filter((word) => word && !FILLER_WORDS.has(word))
    .join(" ")
    .trim()
}

function malformed(raw, message) {
  return {
    ok: false,
    kind: "malformed",
    raw,
    message
  }
}

function intent(raw, data) {
  return {
    ok: true,
    intent: {
      raw,
      ...data
    }
  }
}

/** Longest-first so "look at" wins over "look" and "cut through" over "cut". */
function verbGroup(verbs) {
  return [...verbs]
    .sort((a, b) => b.length - a.length)
    .map((verb) => verb.replace(/\s+/g, "\\s+"))
    .join("|")
}

function matchVerb(command, verbs, rest = "(.+)") {
  return command.match(new RegExp(`^(?:${verbGroup(verbs)})\\s+${rest}$`))
}

function editDistance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) rows[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost)
    }
  }
  return rows[a.length][b.length]
}

/**
 * Closest known verb to an unrecognised first word, or null when nothing is near
 * enough to be worth suggesting.
 */
export function suggestVerb(word) {
  const candidate = String(word || "").toLowerCase()
  if (candidate.length < 2) return null

  let best = null
  let bestDistance = Infinity
  for (const known of KNOWN_VERB_WORDS) {
    const distance = editDistance(candidate, known)
    if (distance < bestDistance) {
      bestDistance = distance
      best = known
    }
  }

  const tolerance = candidate.length <= 4 ? 1 : 2
  return bestDistance <= tolerance ? best : null
}

export function normalizePhrase(phrase) {
  return stripFiller(cleanInput(phrase))
}

export function parseCommand(rawCommand) {
  const raw = String(rawCommand || "")

  // Checked before cleanInput, which strips punctuation. The original `command === "?"`
  // branch was unreachable for exactly that reason, so "?" never actually opened help.
  if (raw.trim() === "?") {
    return intent(raw, { verb: "help" })
  }

  const command = cleanInput(raw)

  if (!command) {
    return malformed(raw, "Say something expedition-adjacent first.")
  }

  if (command === "help" || command === "commands") {
    return intent(raw, { verb: "help" })
  }

  // Before the look branch, so "check inventory" is not read as "look at inventory".
  if (INVENTORY_PHRASES.has(command) || INVENTORY_PHRASES.has(stripFiller(command))) {
    return intent(raw, { verb: "inventory" })
  }

  if (LOOK_PHRASES.has(command)) {
    return intent(raw, { verb: "look" })
  }

  for (const [alias, direction] of Object.entries(DIRECTION_ALIASES)) {
    if (command === alias) {
      return intent(raw, { verb: "go", direction })
    }
  }

  const goMatch = matchVerb(command, GO_VERBS)
  if (goMatch) {
    const directionPhrase = normalizePhrase(goMatch[1])
    const direction = DIRECTION_ALIASES[directionPhrase]
    if (!direction) return malformed(raw, `I don't know how to go "${goMatch[1]}".`)
    return intent(raw, { verb: "go", direction })
  }

  // "repair the bridge with the rope" as well as a bare "repair bridge"; the engine
  // infers the required item when none is named.
  const repairWithMatch = matchVerb(command, REPAIR_VERBS, "(.+?)\\s+(?:with|using)\\s+(.+)")
  if (repairWithMatch) {
    const object = normalizePhrase(repairWithMatch[1])
    const item = normalizePhrase(repairWithMatch[2])
    if (!object || !item) return malformed(raw, "Repair what with what?")
    return intent(raw, { verb: "repair", object, item })
  }

  const repairMatch = matchVerb(command, REPAIR_VERBS)
  if (repairMatch) {
    const object = normalizePhrase(repairMatch[1])
    if (!object) return malformed(raw, "Repair what?")
    return intent(raw, { verb: "repair", object })
  }

  const cutWithMatch = matchVerb(command, CUT_VERBS, "(.+?)\\s+(?:with|using)\\s+(.+)")
  if (cutWithMatch) {
    const object = normalizePhrase(cutWithMatch[1])
    const item = normalizePhrase(cutWithMatch[2])
    if (!object || !item) return malformed(raw, "Cut what with what?")
    return intent(raw, { verb: "cut", object, item })
  }

  const cutMatch = matchVerb(command, CUT_VERBS)
  if (cutMatch) {
    const object = normalizePhrase(cutMatch[1])
    if (!object) return malformed(raw, "Cut what?")
    return intent(raw, { verb: "cut", object })
  }

  const takeMatch = matchVerb(command, TAKE_VERBS)
  if (takeMatch) {
    const object = normalizePhrase(takeMatch[1])
    if (!object) return malformed(raw, "Take what?")
    return intent(raw, { verb: "take", object })
  }

  const useOnMatch = matchVerb(command, USE_VERBS, "(.+?)\\s+(?:on|with)\\s+(.+)")
  if (useOnMatch) {
    const object = normalizePhrase(useOnMatch[1])
    const target = normalizePhrase(useOnMatch[2])
    if (!object || !target) return malformed(raw, "Use what on what?")
    return intent(raw, { verb: "use", object, target })
  }

  const useMatch = matchVerb(command, USE_VERBS)
  if (useMatch) {
    const object = normalizePhrase(useMatch[1])
    if (!object) return malformed(raw, "Use what?")
    return intent(raw, { verb: "use", object })
  }

  const readMatch = matchVerb(command, ["read"])
  if (readMatch) {
    const object = normalizePhrase(readMatch[1])
    if (!object) return malformed(raw, "Read what?")
    return intent(raw, { verb: "read", object })
  }

  const openMatch = matchVerb(command, ["open"])
  if (openMatch) {
    const object = normalizePhrase(openMatch[1])
    if (!object) return malformed(raw, "Open what?")
    return intent(raw, { verb: "open", object })
  }

  const talkMatch = matchVerb(command, TALK_VERBS)
  if (talkMatch) {
    const object = normalizePhrase(talkMatch[1])
    if (!object) return malformed(raw, "Talk to whom?")
    return intent(raw, { verb: "talk", object })
  }

  // Bare "look vines" / "x vines". Last among the look forms so the room-wide
  // "look" and the explicit "look at X" are matched first.
  const lookMatch = matchVerb(command, LOOK_VERBS)
  if (lookMatch) {
    const object = normalizePhrase(lookMatch[1])
    if (!object) return malformed(raw, "Look at what?")
    return intent(raw, { verb: "look", object })
  }

  const suggestion = suggestVerb(command.split(" ")[0])
  return intent(raw, { verb: "unknown", text: command, ...(suggestion ? { suggestion } : {}) })
}

export function helpText() {
  return [
    "Verbs: LOOK, LOOK AT <thing>, TAKE <thing>, USE <thing> ON <thing>, CUT/CLEAR <thing>,",
    "REPAIR/FIX <thing>, READ <thing>, OPEN <thing>, INVENTORY, GO <direction>, HELP.",
    "Move with WASD or arrow keys, and stand near something before acting on it."
  ].join(" ")
}
