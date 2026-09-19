import * as Phaser from 'phaser'

export const FX_GLOW = 'fx-glow'
export const FX_VIGNETTE = 'fx-vignette'

// Deterministic per-room decoration: the same room always renders the same
// scatter, so redraws are stable and no assets are needed.
export function hashSeed(text: string) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function ensureFxTextures(scene: Phaser.Scene, worldWidth: number, worldHeight: number) {
  if (!scene.textures.exists(FX_GLOW)) {
    const size = 64
    const canvas = scene.textures.createCanvas(FX_GLOW, size, size)
    if (!canvas) return
    const ctx = canvas.getContext()
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.5)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
    canvas.refresh()
  }

  if (!scene.textures.exists(FX_VIGNETTE)) {
    const canvas = scene.textures.createCanvas(FX_VIGNETTE, worldWidth, worldHeight)
    if (!canvas) return
    const ctx = canvas.getContext()
    const radius = Math.max(worldWidth, worldHeight) * 0.72
    const gradient = ctx.createRadialGradient(
      worldWidth / 2, worldHeight / 2, radius * 0.42,
      worldWidth / 2, worldHeight / 2, radius
    )
    gradient.addColorStop(0, 'rgba(5,9,8,0)')
    gradient.addColorStop(1, 'rgba(5,9,8,0.6)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, worldWidth, worldHeight)
    canvas.refresh()
  }
}

type Palette = { ground: number, shade: number, accent: number }
type Room = { id: string, palette: Palette }
type WorldSize = { width: number, height: number }

export function drawBackdrop(graphics: Phaser.GameObjects.Graphics, room: Room, world: WorldSize) {
  const rng = mulberry32(hashSeed(room.id))
  const temple = room.id.includes('temple')

  if (temple) {
    drawStoneFloor(graphics, room.palette, world, rng)
  } else {
    drawJungleFloor(graphics, room.palette, world, rng)
  }
}

function drawJungleFloor(graphics: Phaser.GameObjects.Graphics, palette: Palette, world: WorldSize, rng: () => number) {
  // Mottled ground
  for (let i = 0; i < 150; i++) {
    const light = rng() > 0.5
    graphics.fillStyle(light ? palette.accent : palette.shade, light ? 0.05 : 0.12)
    graphics.fillCircle(rng() * world.width, 56 + rng() * (world.height - 104), 3 + rng() * 9)
  }

  // Canopy scallops along the shaded top and bottom bands
  graphics.fillStyle(palette.shade, 0.85)
  for (let x = -10; x < world.width + 20; x += 34) {
    graphics.fillCircle(x + rng() * 14, 44 + rng() * 14, 16 + rng() * 14)
    graphics.fillCircle(x + rng() * 14, world.height - 38 - rng() * 12, 14 + rng() * 12)
  }

  // Grass tufts, kept out of the central walkway
  for (let i = 0; i < 30; i++) {
    const x = rng() * world.width
    const y = 70 + rng() * (world.height - 130)
    if (x > world.width * 0.3 && x < world.width * 0.7 && y > world.height * 0.35 && y < world.height * 0.75) continue
    graphics.lineStyle(2, rng() > 0.4 ? palette.shade : palette.accent, 0.55)
    for (let blade = -1; blade <= 1; blade++) {
      graphics.lineBetween(x, y, x + blade * 4 + (rng() - 0.5) * 3, y - 7 - rng() * 6)
    }
  }

  // A few half-buried stones
  for (let i = 0; i < 6; i++) {
    const x = 30 + rng() * (world.width - 60)
    const y = 76 + rng() * (world.height - 140)
    const r = 5 + rng() * 7
    graphics.fillStyle(0x6f6f66, 0.8)
    graphics.fillEllipse(x, y, r * 2.2, r * 1.3)
    graphics.fillStyle(0x8a8a7e, 0.5)
    graphics.fillEllipse(x - r * 0.3, y - r * 0.25, r * 1.2, r * 0.6)
  }
}

function drawStoneFloor(graphics: Phaser.GameObjects.Graphics, palette: Palette, world: WorldSize, rng: () => number) {
  // Flagstone grid with jittered seams
  graphics.lineStyle(1, palette.shade, 0.5)
  for (let y = 54; y < world.height - 46; y += 58) {
    graphics.lineBetween(0, y + (rng() - 0.5) * 6, world.width, y + (rng() - 0.5) * 6)
  }
  for (let x = 20; x < world.width; x += 72) {
    const jitter = (rng() - 0.5) * 10
    graphics.lineBetween(x + jitter, 54, x + jitter + (rng() - 0.5) * 8, world.height - 46)
  }

  // Cracks
  graphics.lineStyle(2, palette.shade, 0.7)
  for (let i = 0; i < 5; i++) {
    let x = 40 + rng() * (world.width - 80)
    let y = 80 + rng() * (world.height - 160)
    graphics.beginPath()
    graphics.moveTo(x, y)
    for (let seg = 0; seg < 4; seg++) {
      x += (rng() - 0.5) * 46
      y += (rng() - 0.3) * 30
      graphics.lineTo(x, y)
    }
    graphics.strokePath()
  }

  // Moss creeping over the stones
  for (let i = 0; i < 60; i++) {
    graphics.fillStyle(0x4c7350, 0.10 + rng() * 0.14)
    graphics.fillCircle(rng() * world.width, 60 + rng() * (world.height - 110), 3 + rng() * 8)
  }

  // Worn highlight down the central approach
  graphics.fillStyle(palette.accent, 0.05)
  graphics.fillRect(world.width * 0.34, 54, world.width * 0.32, world.height - 100)
}

export const GLOWING_KINDS = new Set(['item', 'rope', 'journal', 'symbol', 'artifact'])
