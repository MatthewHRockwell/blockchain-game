// Dev-only art preview: boots MainScene against a stub channel and fabricated
// state so room rendering can be inspected (and screenshotted) without a
// wallet, game server, or chain. Not part of the production build.
// Usage: /preview.html?room=river-crossing&flags=macheteCollected,vinesCut&inventory=machete
import './style.css'
import * as Phaser from 'phaser'
import { MainScene } from './scenes/mainScene'
import { getRoom } from '../../commons/adventure/rooms.mjs'
import { FLAG_DEFAULTS } from '../../commons/adventure/schema.mjs'
import { MAIN_SCENE } from './utils/keys'

const params = new URLSearchParams(window.location.search)
const roomId = params.get('room') || 'crash-site'
const room = getRoom(roomId)

const flags: Record<string, boolean> = { ...FLAG_DEFAULTS }
for (const flagId of (params.get('flags') || '').split(',').filter(Boolean)) {
  flags[flagId] = true
}

const initialState = {
  address: '0x0000000000000000000000000000000000000000',
  currentRoom: room.id,
  roomName: room.name,
  objective: room.objective,
  position: { ...room.spawn },
  inventory: (params.get('inventory') || '').split(',').filter(Boolean),
  flags,
  discoveredClues: [],
  puzzle: { templeSequence: [] },
  completed: false,
  rewardAuthorized: false
}

const stubChannel = {
  on() {},
  emit() {},
  onDisconnect() {}
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: '#101715',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER
  },
  pixelArt: true
})

game.scene.add(MAIN_SCENE, MainScene, true, { channel: stubChannel, initialState })
