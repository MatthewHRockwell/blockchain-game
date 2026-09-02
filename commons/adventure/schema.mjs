export const ROOM_IDS = {
  CRASH_SITE: "crash-site",
  JUNGLE_TRAIL: "jungle-trail",
  RIVER_CROSSING: "river-crossing",
  ABANDONED_CAMP: "abandoned-camp",
  TEMPLE_ENTRANCE: "temple-entrance",
  INNER_TEMPLE: "inner-temple"
}

export const ITEM_IDS = {
  MACHETE: "machete",
  ROPE: "rope",
  ARTIFACT: "artifact"
}

export const FLAG_IDS = {
  MACHETE_COLLECTED: "macheteCollected",
  VINES_CUT: "vinesCut",
  ROPE_COLLECTED: "ropeCollected",
  BRIDGE_REPAIRED: "bridgeRepaired",
  JOURNAL_READ: "journalRead",
  TEMPLE_PUZZLE_SOLVED: "templePuzzleSolved",
  ARTIFACT_RECOVERED: "artifactRecovered"
}

export const CLUE_IDS = {
  TEMPLE_SEQUENCE: "temple-sequence"
}

export const OBJECT_IDS = {
  AIRCRAFT: "aircraft",
  SUPPLIES: "supplies",
  MACHETE: "machete",
  TRAIL_EXIT: "trail-exit",
  VINES: "vines",
  RIVER: "river",
  ROPE: "rope",
  BRIDGE: "bridge",
  CAMP: "camp",
  JOURNAL: "journal",
  TEMPLE_DOOR: "temple-door",
  SYMBOL_STAR: "symbol-star",
  SYMBOL_RAIN: "symbol-rain",
  SYMBOL_JAGUAR: "symbol-jaguar",
  ALTAR: "altar",
  ARTIFACT: "artifact"
}

export const SYMBOL_SEQUENCE = ["star", "rain", "jaguar"]

export const NETWORK_EVENTS = {
  READY: "ready",
  MOVE: "move",
  UPDATE: "update",
  COMMAND: "command",
  RESULT: "result",
  STATE: "state",
  CLAIM: "claim"
}

export const DIRECTIONS = {
  NORTH: "north",
  SOUTH: "south",
  EAST: "east",
  WEST: "west"
}

export const DIRECTION_ALIASES = {
  n: DIRECTIONS.NORTH,
  north: DIRECTIONS.NORTH,
  up: DIRECTIONS.NORTH,
  s: DIRECTIONS.SOUTH,
  south: DIRECTIONS.SOUTH,
  down: DIRECTIONS.SOUTH,
  e: DIRECTIONS.EAST,
  east: DIRECTIONS.EAST,
  right: DIRECTIONS.EAST,
  w: DIRECTIONS.WEST,
  west: DIRECTIONS.WEST,
  left: DIRECTIONS.WEST
}

export const ITEM_NAMES = {
  [ITEM_IDS.MACHETE]: "machete",
  [ITEM_IDS.ROPE]: "rope",
  [ITEM_IDS.ARTIFACT]: "ancient artifact"
}

export const FLAG_DEFAULTS = Object.freeze({
  [FLAG_IDS.MACHETE_COLLECTED]: false,
  [FLAG_IDS.VINES_CUT]: false,
  [FLAG_IDS.ROPE_COLLECTED]: false,
  [FLAG_IDS.BRIDGE_REPAIRED]: false,
  [FLAG_IDS.JOURNAL_READ]: false,
  [FLAG_IDS.TEMPLE_PUZZLE_SOLVED]: false,
  [FLAG_IDS.ARTIFACT_RECOVERED]: false
})

