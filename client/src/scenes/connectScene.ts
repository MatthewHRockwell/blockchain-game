import { geckos } from '@geckos.io/client'
import { ethers } from 'ethers'
import { Scene } from 'phaser'
import generateTypedAuth from '../../../commons/auth.mjs'
import { CONNECT_SCENE, MAIN_SCENE, SIGNER } from '../utils/keys'
import { NETWORK_EVENTS } from '../../../commons/adventure/schema.mjs'

export class ConnectScene extends Scene {
  sig?: string
  address?: string
  statusText?: Phaser.GameObjects.Text
  retryButton?: Phaser.GameObjects.Rectangle
  retryLabel?: Phaser.GameObjects.Text
  isRetrying = false

  constructor() {
    super(CONNECT_SCENE)
  }

  init({ sig, address }: { sig: string, address: string }) {
    this.sig = sig
    this.address = address
    this.isRetrying = false
    // Restart destroys the old display objects; drop the stale references so
    // a repeated failure can rebuild the retry button.
    this.statusText = undefined
    this.retryButton = undefined
    this.retryLabel = undefined
  }

  create() {
    this.cameras.main.setBackgroundColor('0x171717')

    const { width, height } = this.scale
    this.statusText = this.add.text(width * 0.5, height * 0.5, 'logging in to server...', {
      color: '#f1e7c8',
      fontFamily: 'monospace',
      fontSize: '18px',
      align: 'center',
      wordWrap: { width: Math.min(560, width - 60) }
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
        this.statusText?.setText(`error ${error.status}: ${error.statusText}. ${error.message}`)
        this.showRetryButton()
        return
      }

      channel.on(NETWORK_EVENTS.READY, (initialState: any) => {
        this.statusText?.setText('connected!')
        setTimeout(() => {
          this.scene.start(MAIN_SCENE, { channel, initialState })
        }, 250)
      })
    })
  }

  showRetryButton() {
    if (this.retryButton) return
    const { width, height } = this.scale
    const x = width * 0.5
    const y = height * 0.5 + 72

    this.retryButton = this.add.rectangle(x, y, 200, 44, 0xd6a94f)
      .setStrokeStyle(2, 0xf4dc9a, 0.8)
      .setInteractive({ useHandCursor: true })
    this.retryLabel = this.add.text(x, y, 'RETRY', {
      color: '#17130d',
      fontFamily: 'monospace',
      fontSize: '15px',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.retryButton.on('pointerover', () => this.retryButton?.setFillStyle(0xf1c86a))
    this.retryButton.on('pointerout', () => this.retryButton?.setFillStyle(0xd6a94f))
    this.retryButton.on('pointerup', () => this.retry())
  }

  // A used challenge is deleted server-side whether or not the login succeeded,
  // so retrying means requesting and signing a fresh challenge before
  // restarting this scene with the new signature.
  async retry() {
    if (this.isRetrying) return
    this.isRetrying = true
    this.retryButton?.disableInteractive()
    this.retryLabel?.setText('...')

    const signer = this.registry.get(SIGNER) as ethers.providers.JsonRpcSigner | undefined
    if (!signer) {
      this.scene.start('start-scene')
      return
    }

    try {
      this.statusText?.setText('requesting a new login challenge...')
      const address = await signer.getAddress()
      const host = import.meta.env.VITE_HOST ? import.meta.env.VITE_HOST : 'http://localhost:9208'
      const res = await fetch(host + '/challenge', {
        method: 'POST',
        body: address
      })
      if (!res.ok) throw new Error(`Challenge request failed: ${res.status}`)

      const challenge = await res.text()
      const { domain, types, value } = generateTypedAuth(challenge)
      const sig = await signer._signTypedData(domain, types, value)
      this.scene.restart({ sig, address })
    } catch (error: any) {
      this.statusText?.setText(error?.message || 'Retry failed.')
      this.isRetrying = false
      this.retryLabel?.setText('RETRY')
      this.retryButton?.setInteractive({ useHandCursor: true })
    }
  }
}
