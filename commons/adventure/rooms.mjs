import { CLUE_IDS, DIRECTIONS, FLAG_IDS, ITEM_IDS, OBJECT_IDS, ROOM_IDS, SYMBOL_SEQUENCE } from "./schema.mjs"

export const WORLD_SIZE = { width: 640, height: 360 }
export const PLAYER_RADIUS = 9
export const INTERACTION_RADIUS = 58

export const CLUES = {
  [CLUE_IDS.TEMPLE_SEQUENCE]: {
    id: CLUE_IDS.TEMPLE_SEQUENCE,
    title: "Expedition journal",
    text: `The door listens in this order: ${SYMBOL_SEQUENCE.join(", ")}. The writer adds that the ${SYMBOL_SEQUENCE[SYMBOL_SEQUENCE.length - 1]} was very smug about being last.`
  }
}

export const ITEM_ALIASES = {
  [ITEM_IDS.MACHETE]: ["machete", "blade", "knife", "cutting tool", "tool"],
  [ITEM_IDS.ROPE]: ["rope", "line", "cord"],
  [ITEM_IDS.ARTIFACT]: ["artifact", "idol", "relic", "stone heart", "ancient artifact"]
}

export const SYMBOL_CONTROLS = {
  star: {
    id: OBJECT_IDS.SYMBOL_STAR,
    symbol: "star",
    name: "star glyph",
    aliases: ["star", "star glyph", "glyph star", "left glyph"],
    position: { x: 236, y: 150 },
    radius: 56,
    color: 0xf8d66d,
    description: "A star glyph cut into the stone. It has the confident shine of something that has never paid rent."
  },
  rain: {
    id: OBJECT_IDS.SYMBOL_RAIN,
    symbol: "rain",
    name: "rain glyph",
    aliases: ["rain", "rain glyph", "glyph rain", "middle glyph", "water glyph"],
    position: { x: 320, y: 150 },
    radius: 56,
    color: 0x70c7d4,
    description: "A rain glyph, all neat channels and patient erosion."
  },
  jaguar: {
    id: OBJECT_IDS.SYMBOL_JAGUAR,
    symbol: "jaguar",
    name: "jaguar glyph",
    aliases: ["jaguar", "jaguar glyph", "glyph jaguar", "right glyph", "cat glyph"],
    position: { x: 404, y: 150 },
    radius: 56,
    color: 0xd79a54,
    description: "A jaguar glyph with a stare that suggests it knows what happened to the previous expedition."
  }
}

const always = () => true
const flag = (flagId) => (state) => Boolean(state.flags[flagId])
const notFlag = (flagId) => (state) => !state.flags[flagId]

export const ROOMS = {
  [ROOM_IDS.CRASH_SITE]: {
    id: ROOM_IDS.CRASH_SITE,
    name: "Crash Site",
    palette: { ground: 0x2f6f50, shade: 0x194533, accent: 0xe8b96b },
    spawn: { x: 110, y: 236 },
    look: "The survey plane rests in a heroic number of pieces. Jungle crowds the clearing, and one useful blade glints near the scattered supplies.",
    objective: "Recover a tool and find the trail out of the clearing.",
    bounds: WORLD_SIZE,
    objects: [
      {
        id: OBJECT_IDS.AIRCRAFT,
        name: "damaged aircraft",
        aliases: ["aircraft", "airplane", "plane", "wreck", "fuselage", "engine"],
        position: { x: 180, y: 168 },
        radius: 78,
        solid: { x: 92, y: 118, width: 175, height: 58 },
        visual: { kind: "wreck", color: 0x8c8f87, width: 168, height: 50 },
        description: "The aircraft has achieved the aviation equivalent of a bad day."
      },
      {
        id: OBJECT_IDS.SUPPLIES,
        name: "scattered supplies",
        aliases: ["supplies", "crate", "crates", "kit", "gear", "supply crate"],
        position: { x: 292, y: 238 },
        radius: 60,
        visual: { kind: "crate", color: 0x9b6b3f, width: 50, height: 34 },
        description: "Rations, survey flags, one bent spoon, and a label reading: Emergency. Mostly."
      },
      {
        id: OBJECT_IDS.MACHETE,
        name: "machete",
        aliases: ["machete", "blade", "knife", "cutting tool", "tool"],
        position: { x: 320, y: 224 },
        radius: 52,
        itemId: ITEM_IDS.MACHETE,
        takeable: true,
        visibleWhen: notFlag(FLAG_IDS.MACHETE_COLLECTED),
        visual: { kind: "item", color: 0xded8b8, width: 44, height: 12 },
        description: "A sturdy machete. Its edge looks less doomed than everything else here.",
        takeText: "You take the machete. The jungle immediately pretends not to notice."
      }
    ],
    exits: [
      {
        id: "to-jungle-trail",
        direction: DIRECTIONS.EAST,
        name: "narrow trail",
        aliases: ["trail", "path", "jungle", "east"],
        area: { x: 594, y: 124, width: 44, height: 112 },
        to: ROOM_IDS.JUNGLE_TRAIL,
        spawn: { x: 58, y: 228 },
        availableWhen: always,
        description: "A narrow trail pushes east into the green."
      }
    ]
  },
  [ROOM_IDS.JUNGLE_TRAIL]: {
    id: ROOM_IDS.JUNGLE_TRAIL,
    name: "Jungle Trail",
    palette: { ground: 0x2d7556, shade: 0x123b2a, accent: 0x79b56b },
    spawn: { x: 58, y: 228 },
    look: "The trail narrows between ferns, hanging roots, and vines with a strong commitment to being in the way.",
    objective: "Clear the vines blocking the trail east.",
    bounds: WORLD_SIZE,
    objects: [
      {
        id: OBJECT_IDS.VINES,
        name: "obstructing vines",
        aliases: ["vines", "vine", "vegetation", "growth", "plants", "brush"],
        position: { x: 540, y: 188 },
        radius: 70,
        solidWhen: notFlag(FLAG_IDS.VINES_CUT),
        visibleWhen: notFlag(FLAG_IDS.VINES_CUT),
        solid: { x: 512, y: 92, width: 42, height: 186 },
        visual: { kind: "vines", color: 0x4aa35f, width: 56, height: 180 },
        description: "A curtain of vines blocks the route. They look professionally tangled."
      }
    ],
    exits: [
      {
        id: "to-crash-site",
        direction: DIRECTIONS.WEST,
        name: "trail back to the crash",
        aliases: ["west", "crash", "clearing", "crash site"],
        area: { x: 0, y: 124, width: 46, height: 126 },
        to: ROOM_IDS.CRASH_SITE,
        spawn: { x: 578, y: 214 },
        availableWhen: always
      },
      {
        id: "to-river-crossing",
        direction: DIRECTIONS.EAST,
        name: "cleared trail",
        aliases: ["east", "trail", "river", "path"],
        area: { x: 594, y: 124, width: 44, height: 126 },
        to: ROOM_IDS.RIVER_CROSSING,
        spawn: { x: 64, y: 220 },
        availableWhen: flag(FLAG_IDS.VINES_CUT),
        lockedMessage: "The vines disagree with your travel plans."
      }
    ]
  },
  [ROOM_IDS.RIVER_CROSSING]: {
    id: ROOM_IDS.RIVER_CROSSING,
    name: "River Crossing",
    palette: { ground: 0x376f58, shade: 0x183f3f, accent: 0x5fbfd5 },
    spawn: { x: 64, y: 220 },
    look: "A quick river cuts across the route. A rope lies near a toppled post, and a bridge is doing a poor impression of a bridge.",
    objective: "Recover the rope and repair the bridge.",
    bounds: WORLD_SIZE,
    objects: [
      {
        id: OBJECT_IDS.RIVER,
        name: "river",
        aliases: ["river", "water", "current", "rapids"],
        position: { x: 330, y: 180 },
        radius: 110,
        solidWhen: notFlag(FLAG_IDS.BRIDGE_REPAIRED),
        solid: { x: 278, y: 0, width: 86, height: 360 },
        visual: { kind: "river", color: 0x46a7c5, width: 86, height: 360 },
        description: "The river is fast, cold, and absolutely uninterested in your resume."
      },
      {
        id: OBJECT_IDS.ROPE,
        name: "coil of rope",
        aliases: ["rope", "coil", "line", "cord"],
        position: { x: 154, y: 254 },
        radius: 52,
        itemId: ITEM_IDS.ROPE,
        takeable: true,
        visibleWhen: notFlag(FLAG_IDS.ROPE_COLLECTED),
        visual: { kind: "rope", color: 0xd8c58a, width: 48, height: 28 },
        description: "A coil of rope. It has survived by pretending to be boring.",
        takeText: "You take the rope. It immediately becomes your most competent coworker."
      },
      {
        id: OBJECT_IDS.BRIDGE,
        name: "damaged bridge",
        aliases: ["bridge", "crossing", "planks", "post", "posts"],
        position: { x: 330, y: 190 },
        radius: 76,
        visual: { kind: "bridge", color: 0x9b7045, width: 132, height: 34 },
        description: "The bridge is short two ropes and several encouraging words."
      }
    ],
    exits: [
      {
        id: "to-jungle-trail",
        direction: DIRECTIONS.WEST,
        name: "trail back",
        aliases: ["west", "trail", "jungle"],
        area: { x: 0, y: 126, width: 46, height: 124 },
        to: ROOM_IDS.JUNGLE_TRAIL,
        spawn: { x: 578, y: 214 },
        availableWhen: always
      },
      {
        id: "to-abandoned-camp",
        direction: DIRECTIONS.EAST,
        name: "repaired crossing",
        aliases: ["east", "camp", "crossing", "bridge"],
        area: { x: 594, y: 126, width: 44, height: 124 },
        to: ROOM_IDS.ABANDONED_CAMP,
        spawn: { x: 72, y: 224 },
        availableWhen: flag(FLAG_IDS.BRIDGE_REPAIRED),
        lockedMessage: "The bridge needs repair before it can support anything more ambitious than regret."
      }
    ]
  },
  [ROOM_IDS.ABANDONED_CAMP]: {
    id: ROOM_IDS.ABANDONED_CAMP,
    name: "Abandoned Camp",
    palette: { ground: 0x5f714d, shade: 0x29331f, accent: 0xb98f5f },
    spawn: { x: 72, y: 224 },
    look: "An expedition camp slumps under broad leaves. The firepit is cold, the crates are open, and a journal waits inside a weatherproof case.",
    objective: "Read the expedition journal for the temple clue.",
    bounds: WORLD_SIZE,
    objects: [
      {
        id: OBJECT_IDS.CAMP,
        name: "abandoned camp",
        aliases: ["camp", "tent", "tents", "crates", "firepit"],
        position: { x: 292, y: 198 },
        radius: 90,
        solid: { x: 220, y: 126, width: 122, height: 70 },
        visual: { kind: "camp", color: 0x947145, width: 122, height: 70 },
        description: "The camp was left in a hurry, or by people with a very modern approach to tidying."
      },
      {
        id: OBJECT_IDS.JOURNAL,
        name: "expedition journal",
        aliases: ["journal", "book", "notebook", "diary", "log", "case"],
        position: { x: 386, y: 222 },
        radius: 58,
        visual: { kind: "journal", color: 0xc28b52, width: 38, height: 28 },
        description: "A battered journal sealed in oilcloth. It has exactly the look of something with plot relevance.",
        readText: "The final legible entry says: 'The door listens in this order: star, rain, jaguar.' Below it, someone has drawn a very judgmental cat."
      }
    ],
    exits: [
      {
        id: "to-river-crossing",
        direction: DIRECTIONS.WEST,
        name: "river path",
        aliases: ["west", "river", "bridge"],
        area: { x: 0, y: 126, width: 46, height: 124 },
        to: ROOM_IDS.RIVER_CROSSING,
        spawn: { x: 578, y: 214 },
        availableWhen: always
      },
      {
        id: "to-temple-entrance",
        direction: DIRECTIONS.EAST,
        name: "stone path",
        aliases: ["east", "temple", "stone path", "path"],
        area: { x: 594, y: 126, width: 44, height: 124 },
        to: ROOM_IDS.TEMPLE_ENTRANCE,
        spawn: { x: 68, y: 220 },
        availableWhen: flag(FLAG_IDS.JOURNAL_READ),
        lockedMessage: "The camp has a clue you should read before marching confidently at ancient masonry."
      }
    ]
  },
  [ROOM_IDS.TEMPLE_ENTRANCE]: {
    id: ROOM_IDS.TEMPLE_ENTRANCE,
    name: "Temple Entrance",
    palette: { ground: 0x58645a, shade: 0x252c2b, accent: 0xd0b56c },
    spawn: { x: 68, y: 220 },
    look: "A stone doorway rises from the roots. Three worn glyphs are set into the stone beside it, in no order that means anything yet.",
    objective: "Enter the journal's symbol sequence to open the temple door.",
    bounds: WORLD_SIZE,
    objects: [
      {
        id: OBJECT_IDS.TEMPLE_DOOR,
        name: "stone door",
        aliases: ["door", "stone door", "temple door", "entrance", "doorway", "gate"],
        position: { x: 526, y: 188 },
        radius: 74,
        solidWhen: notFlag(FLAG_IDS.TEMPLE_PUZZLE_SOLVED),
        solid: { x: 494, y: 90, width: 58, height: 196 },
        visual: { kind: "door", color: 0x8b8170, width: 74, height: 176 },
        description: "The stone door has no handle. It is either ancient design or ancient budget control."
      },
      ...Object.values(SYMBOL_CONTROLS).map((control) => ({
        ...control,
        visual: { kind: "symbol", color: control.color, width: 48, height: 48 }
      }))
    ],
    exits: [
      {
        id: "to-abandoned-camp",
        direction: DIRECTIONS.WEST,
        name: "camp path",
        aliases: ["west", "camp", "path"],
        area: { x: 0, y: 126, width: 46, height: 124 },
        to: ROOM_IDS.ABANDONED_CAMP,
        spawn: { x: 578, y: 214 },
        availableWhen: always
      },
      {
        id: "to-inner-temple",
        direction: DIRECTIONS.EAST,
        name: "open doorway",
        aliases: ["east", "door", "doorway", "inside", "temple"],
        area: { x: 594, y: 126, width: 44, height: 124 },
        to: ROOM_IDS.INNER_TEMPLE,
        spawn: { x: 82, y: 214 },
        availableWhen: flag(FLAG_IDS.TEMPLE_PUZZLE_SOLVED),
        lockedMessage: "The stone door remains sealed. The glyphs look patient, which is worse."
      }
    ],
    puzzle: {
      symbols: Object.keys(SYMBOL_CONTROLS),
      solution: SYMBOL_SEQUENCE
    }
  },
  [ROOM_IDS.INNER_TEMPLE]: {
    id: ROOM_IDS.INNER_TEMPLE,
    name: "Inner Temple",
    palette: { ground: 0x453f54, shade: 0x16131d, accent: 0xf2c96d },
    spawn: { x: 82, y: 214 },
    look: "The chamber glows with reflected gold and old rainwater. A central altar holds the artifact, surprisingly calm about the whole situation.",
    objective: "Recover the artifact and claim the expedition reward.",
    bounds: WORLD_SIZE,
    objects: [
      {
        id: OBJECT_IDS.ALTAR,
        name: "central altar",
        aliases: ["altar", "pedestal", "dais", "stone table"],
        position: { x: 330, y: 178 },
        radius: 74,
        solid: { x: 286, y: 146, width: 88, height: 58 },
        visual: { kind: "altar", color: 0x8f7c64, width: 96, height: 54 },
        description: "The altar is carved with the same three glyphs. It looks official enough to require paperwork."
      },
      {
        id: OBJECT_IDS.ARTIFACT,
        name: "ancient artifact",
        aliases: ["artifact", "idol", "relic", "stone heart", "treasure"],
        position: { x: 330, y: 134 },
        radius: 58,
        itemId: ITEM_IDS.ARTIFACT,
        takeable: true,
        visibleWhen: notFlag(FLAG_IDS.ARTIFACT_RECOVERED),
        visual: { kind: "artifact", color: 0xffd36e, width: 34, height: 34 },
        description: "A warm stone artifact rests above the altar. It hums like a tiny generator with a mythology budget.",
        takeText: "You recover the ancient artifact. Somewhere behind you, the temple decides this counts as a successful exit interview."
      }
    ],
    exits: [
      {
        id: "to-temple-entrance",
        direction: DIRECTIONS.WEST,
        name: "open doorway",
        aliases: ["west", "door", "doorway", "outside"],
        area: { x: 0, y: 126, width: 46, height: 124 },
        to: ROOM_IDS.TEMPLE_ENTRANCE,
        spawn: { x: 578, y: 214 },
        availableWhen: always
      }
    ]
  }
}

export function getRoom(roomId) {
  const room = ROOMS[roomId]
  if (!room) throw new Error(`Unknown room: ${roomId}`)
  return room
}

export function isVisible(definition, state) {
  return definition.visibleWhen ? definition.visibleWhen(state) : true
}

export function isSolid(definition, state) {
  if (definition.solidWhen) return definition.solidWhen(state)
  return Boolean(definition.solid)
}

export function isAvailable(definition, state) {
  return definition.availableWhen ? definition.availableWhen(state) : true
}

export function getVisibleObjects(room, state) {
  return room.objects.filter((object) => isVisible(object, state))
}

