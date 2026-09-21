import * as Phaser from 'phaser'
import { ethers } from 'ethers'
import generateTypedAuth from '../../../commons/auth.mjs'
import { CONNECT_SCENE, SIGNER } from '../utils/keys'

async function connectWallet() {
  const injected = typeof window !== 'undefined' ? (window as any).ethereum : undefined
  if (!injected) {
    throw new Error('No injected browser wallet found. Use a local wallet connected to Hardhat chain 31337.')
  }

  // Only injected wallets are supported, so request accounts directly rather than
  // pulling in Web3Modal's provider-picker and its large dependency tree.
  if (typeof injected.request === 'function') {
    await injected.request({ method: 'eth_requestAccounts' })
  } else if (typeof injected.enable === 'function') {
    await injected.enable()
  } else {
    throw new Error('Injected wallet does not support account authorization.')
  }

  const provider = new ethers.providers.Web3Provider(injected)
  const network = await provider.getNetwork()
  if (network.chainId !== 31337) {
    throw new Error(`Wrong chain ${network.chainId}. Switch the wallet to localhost chain 31337.`)
  }

  return provider.getSigner()
}

export class StartScene extends Phaser.Scene {
  connectButton?: Phaser.GameObjects.Rectangle
  buttonText?: Phaser.GameObjects.Text
  statusText?: Phaser.GameObjects.Text
  signer?: ethers.providers.JsonRpcSigner
  isConnecting = false

  constructor() {
    super({ key: 'start-scene' })
  }

  create() {
    const loading = document.getElementById('loading')
    if (loading) loading.style.display = 'none'

    this.cameras.main.setBackgroundColor('0x101715')
    this.renderIntro()
    this.scale.on('resize', () => this.renderIntro())
  }

  renderIntro() {
    this.children.removeAll()
    const { width, height } = this.scale
    const centerX = width * 0.5
    const centerY = height * 0.5

    this.add.rectangle(centerX, centerY, width, height, 0x101715)
    this.add.rectangle(centerX, centerY - 10, Math.min(620, width - 48), 320, 0x17231f, 0.92)
      .setStrokeStyle(2, 0xd6a94f, 0.55)

    this.add.text(centerX, centerY - 116, 'THE LOST TEMPLE', {
      color: '#f6c968',
      fontFamily: 'Georgia, serif',
      fontSize: `${Math.min(42, Math.max(28, width / 18))}px`,
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.add.text(centerX, centerY - 62, 'A server-authoritative jungle parser adventure', {
      color: '#86d7c5',
      fontFamily: 'monospace',
      fontSize: '16px'
    }).setOrigin(0.5)

    this.add.text(centerX, centerY - 20, 'Connect a local Hardhat wallet. Then move with WASD or arrows and type commands to solve the expedition.', {
      color: '#f4edd8',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '15px',
      align: 'center',
      wordWrap: { width: Math.min(520, width - 76) }
    }).setOrigin(0.5)

    this.connectButton = this.add.rectangle(centerX, centerY + 62, 220, 46, 0xd6a94f)
      .setStrokeStyle(2, 0xf4dc9a, 0.8)
      .setInteractive({ useHandCursor: true })
    this.buttonText = this.add.text(centerX, centerY + 62, this.signer ? 'LOGIN' : 'CONNECT WALLET', {
      color: '#17130d',
      fontFamily: 'monospace',
      fontSize: '15px',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.statusText = this.add.text(centerX, centerY + 118, '', {
      color: '#f4edd8',
      fontFamily: 'monospace',
      fontSize: '13px',
      align: 'center',
      wordWrap: { width: Math.min(520, width - 76) }
    }).setOrigin(0.5)

    this.connectButton.on('pointerover', () => this.connectButton?.setFillStyle(0xf1c86a))
    this.connectButton.on('pointerout', () => this.connectButton?.setFillStyle(0xd6a94f))
    this.connectButton.on('pointerup', () => this.handleButtonClick())
  }

  async handleButtonClick() {
    if (this.isConnecting) return
    this.isConnecting = true
    this.connectButton?.disableInteractive()
    this.statusText?.setText(this.signer ? 'Authenticating...' : 'Connecting...')

    try {
      if (!this.signer) {
        this.signer = await connectWallet()
        this.registry.set(SIGNER, this.signer)
        this.buttonText?.setText('LOGIN')
        this.statusText?.setText('Wallet connected. Signing local challenge...')
      }

      await this.authenticate()
    } catch (error: any) {
      this.statusText?.setColor('#ff9b85')
      this.statusText?.setText(error?.message || 'Connection failed.')
      this.isConnecting = false
      this.connectButton?.setInteractive({ useHandCursor: true })
    }
  }

  async authenticate() {
    if (!this.signer) throw new Error('No signer available.')

    const address = await this.signer.getAddress()
    const host = import.meta.env.VITE_HOST ? import.meta.env.VITE_HOST : 'http://localhost:9208'
    const res = await fetch(host + '/challenge', {
      method: 'POST',
      body: address
    })

    if (!res.ok) throw new Error(`Challenge request failed: ${res.status}`)

    const challenge = await res.text()
    const { domain, types, value } = generateTypedAuth(challenge)
    const sig = await this.signer._signTypedData(domain, types, value)
    this.scene.start(CONNECT_SCENE, { sig, address })
  }
}
