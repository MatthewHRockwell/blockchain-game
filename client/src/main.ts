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
        gravity: { x: 0, y: 0 },
        debug: false
      }
    },
    pixelArt: true,
    scene: [StartScene, ConnectScene, MainScene]
  })

  // The end-to-end harness reads this hook to introspect scene state. It is always
  // available in dev, and `vite build --mode e2e` opts a production bundle in so the
  // harness can run against the built output too. __E2E_HOOK__ is substituted at
  // build time, so in a normal build this whole branch is removed.
  if (import.meta.env.DEV || __E2E_HOOK__) {
    ;(window as Window & { __LOST_TEMPLE_GAME__?: Phaser.Game }).__LOST_TEMPLE_GAME__ = game
  }
} catch (error) {
  console.error('Failed to initialize game:', error)
  document.body.innerHTML = `<h1>Error Loading Game</h1><p>${error instanceof Error ? error.message : String(error)}</p>`
}
