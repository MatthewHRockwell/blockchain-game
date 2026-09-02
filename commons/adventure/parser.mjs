import { DIRECTION_ALIASES } from "./schema.mjs"

const FILLER_WORDS = new Set(["the", "a", "an", "please"])

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

export function normalizePhrase(phrase) {
  return stripFiller(cleanInput(phrase))
}

export function parseCommand(rawCommand) {
  const raw = String(rawCommand || "")
  const command = cleanInput(raw)

  if (!command) {
    return malformed(raw, "Say something expedition-adjacent first.")
  }

  if (command === "help" || command === "?") {
    return intent(raw, { verb: "help" })
  }

  if (command === "inventory" || command === "inv" || command === "i") {
    return intent(raw, { verb: "inventory" })
  }

  if (command === "look" || command === "l") {
    return intent(raw, { verb: "look" })
  }

  for (const [alias, direction] of Object.entries(DIRECTION_ALIASES)) {
    if (command === alias) {
      return intent(raw, { verb: "go", direction })
    }
  }

  const goMatch = command.match(/^(?:go|walk|move|head|travel)\s+(.+)$/)
  if (goMatch) {
    const directionPhrase = normalizePhrase(goMatch[1])
    const direction = DIRECTION_ALIASES[directionPhrase]
    if (!direction) return malformed(raw, `I don't know how to go "${goMatch[1]}".`)
    return intent(raw, { verb: "go", direction })
  }

  const lookMatch = command.match(/^(?:look at|examine|inspect|check)\s+(.+)$/)
  if (lookMatch) {
    const object = normalizePhrase(lookMatch[1])
    if (!object) return malformed(raw, "Look at what?")
    return intent(raw, { verb: "look", object })
  }

  const pickUpMatch = command.match(/^(?:pick up|pickup)\s+(.+)$/)
  if (pickUpMatch) {
    const object = normalizePhrase(pickUpMatch[1])
    if (!object) return malformed(raw, "Pick up what?")
    return intent(raw, { verb: "take", object })
  }

  const takeMatch = command.match(/^(?:take|get|grab|collect)\s+(.+)$/)
  if (takeMatch) {
    const object = normalizePhrase(takeMatch[1])
    if (!object) return malformed(raw, "Take what?")
    return intent(raw, { verb: "take", object })
  }

  const useOnMatch = command.match(/^use\s+(.+?)\s+(?:on|with)\s+(.+)$/)
  if (useOnMatch) {
    const object = normalizePhrase(useOnMatch[1])
    const target = normalizePhrase(useOnMatch[2])
    if (!object || !target) return malformed(raw, "Use what on what?")
    return intent(raw, { verb: "use", object, target })
  }

  const useMatch = command.match(/^(?:use|press|push|touch)\s+(.+)$/)
  if (useMatch) {
    const object = normalizePhrase(useMatch[1])
    if (!object) return malformed(raw, "Use what?")
    return intent(raw, { verb: "use", object })
  }

  const cutWithMatch = command.match(/^cut\s+(.+?)\s+with\s+(.+)$/)
  if (cutWithMatch) {
    const object = normalizePhrase(cutWithMatch[1])
    const item = normalizePhrase(cutWithMatch[2])
    if (!object || !item) return malformed(raw, "Cut what with what?")
    return intent(raw, { verb: "cut", object, item })
  }

  const cutMatch = command.match(/^cut\s+(.+)$/)
  if (cutMatch) {
    const object = normalizePhrase(cutMatch[1])
    if (!object) return malformed(raw, "Cut what?")
    return intent(raw, { verb: "cut", object })
  }

  const readMatch = command.match(/^read\s+(.+)$/)
  if (readMatch) {
    const object = normalizePhrase(readMatch[1])
    if (!object) return malformed(raw, "Read what?")
    return intent(raw, { verb: "read", object })
  }

  const openMatch = command.match(/^open\s+(.+)$/)
  if (openMatch) {
    const object = normalizePhrase(openMatch[1])
    if (!object) return malformed(raw, "Open what?")
    return intent(raw, { verb: "open", object })
  }

  const talkMatch = command.match(/^(?:talk to|speak to|ask)\s+(.+)$/)
  if (talkMatch) {
    const object = normalizePhrase(talkMatch[1])
    if (!object) return malformed(raw, "Talk to whom?")
    return intent(raw, { verb: "talk", object })
  }

  return intent(raw, { verb: "unknown", text: command })
}

export function helpText() {
  return [
    "Try LOOK, LOOK AT AIRCRAFT, TAKE MACHETE, USE MACHETE ON VINES, READ JOURNAL, USE STAR, INVENTORY, or GO EAST.",
    "Move with WASD or arrow keys. Stand near things before using expedition confidence on them."
  ].join(" ")
}

