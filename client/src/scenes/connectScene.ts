import { geckos } from '@geckos.io/client'
import { Scene } from 'phaser'
import { CONNECT_SCENE, MAIN_SCENE } from '../utils/keys'
import { NETWORK_EVENTS } from '../../../commons/adventure/schema.mjs'

export class ConnectScene extends Scene {
  sig?: string
  address?: string

  constructor() {
    super(CONNECT_SCENE)
  }

  init({ sig, address }: { sig: string, address: string }) {
    this.sig = sig
    this.address = address
  }

  create() {
    this.cameras.main.setBackgroundColor('0x171717')

    const { width, height } = this.scale
    const text = this.add.text(width * 0.5, height * 0.5, 'logging in to server...', {
      color: '#f1e7c8',
      fontFamily: 'monospace',
      fontSize: '18px'
    }).setOrigin(0.5, 0.5)

    const host = import.meta.env.VITE_HOST ? import.meta.env.VITE_HOST : 'http://localhost'
    const port = import.meta.env.VITE_SERVER_PORT ? parseInt(import.meta.env.VITE_SERVER_PORT) : 9208

    const channel = geckos({
      url: host,
      port,
      authorization: `${this.address} ${this.sig}`
    })

    channel.onConnect(error => {
      if (error) {
        console.error(error.message)
        text.setText(`error ${error.status}: ${error.statusText}. ${error.message}`)
        return
      }

      channel.on(NETWORK_EVENTS.READY, (initialState: any) => {
        text.setText('connected!')
        setTimeout(() => {
          this.scene.start(MAIN_SCENE, { channel, initialState })
        }, 250)
      })
    })
  }
}
