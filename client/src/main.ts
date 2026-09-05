import './style.css'
import * as Phaser from 'phaser'
import { MainScene } from './scenes/mainScene'
import { StartScene } from './scenes/startScene'
import { ConnectScene } from './scenes/connectScene'

try {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    backgroundColor: '#101715',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 0 },
        debug: false
      }
    },
    pixelArt: true,
    scene: [StartScene, ConnectScene, MainScene]
  })

  if (import.meta.env.DEV) {
    ;(window as Window & { __LOST_TEMPLE_GAME__?: Phaser.Game }).__LOST_TEMPLE_GAME__ = game
  }
} catch (error) {
  console.error('Failed to initialize game:', error)
  document.body.innerHTML = `<h1>Error Loading Game</h1><p>${error instanceof Error ? error.message : String(error)}</p>`
}
