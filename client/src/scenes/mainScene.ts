import * as Phaser from 'phaser'
import type { ClientChannel } from '@geckos.io/client'
import { ethers } from 'ethers'
import { getVisibleObjects, getRoom, WORLD_SIZE } from '../../../commons/adventure/rooms.mjs'
import { ITEM_NAMES, NETWORK_EVENTS } from '../../../commons/adventure/schema.mjs'
import { addresses, contracts } from '../../../commons/contracts.mjs'
import { ClaimVerifier } from '../contracts'
import { getContract } from '../utils/contracts'
import { IDLE, KNIGHT, MAIN_SCENE, MOVE, SIGNER } from '../utils/keys'

type AdventureState = {
  address: string
  currentRoom: string
  roomName: string
  objective: string
  position: { x: number, y: number }
  inventory: string[]
  flags: Record<string, boolean>
  discoveredClues: Array<{ id: string, title: string, text: string }>
  puzzle: { templeSequence: string[] }
  completed: boolean
  rewardAuthorized: boolean
}

type ClaimPayload = {
  sig: string
  request: string
  deadline: string
  receiver: string
}

export class MainScene extends Phaser.Scene {
  channel?: ClientChannel
  state?: AdventureState
  signer?: ethers.providers.JsonRpcSigner
  cursors?: Phaser.Types.Input.Keyboard.CursorKeys
  wasd?: any
  player?: Phaser.GameObjects.Sprite
  graphics?: Phaser.GameObjects.Graphics
  labels: Phaser.GameObjects.Text[] = []
  commandInput?: HTMLInputElement
  logPanel?: HTMLDivElement
  roomNameEl?: HTMLDivElement
  objectiveEl?: HTMLDivElement
  inventoryEl?: HTMLDivElement
  cluesEl?: HTMLDivElement
  walletEl?: HTMLDivElement
  claimStatusEl?: HTMLDivElement
  claimButton?: HTMLButtonElement
  uiRoot?: HTMLDivElement
  claimPayload?: ClaimPayload
  claimed = false
  claimBusy = false
  moveElapsed = 0
  lastDirectionIsLeft = false

  constructor() {
    super(MAIN_SCENE)
  }

  init({ channel, initialState }: { channel: ClientChannel, initialState: AdventureState }) {
    this.channel = channel
    this.state = initialState
  }

  preload() {
    this.load.spritesheet(KNIGHT, '/spritesheets/knight.png', { frameWidth: 15, frameHeight: 22 })
    this.cursors = this.input.keyboard?.createCursorKeys()
    this.wasd = this.input.keyboard?.addKeys('W,S,A,D')
    this.signer = this.registry.get(SIGNER)
  }

  create() {
    const loading = document.getElementById('loading')
    if (loading) loading.style.display = 'none'

    this.cameras.main.setBackgroundColor('0x101715')
    this.graphics = this.add.graphics()
    this.player = this.add.sprite(this.state?.position.x || 110, this.state?.position.y || 236, KNIGHT)
      .setScale(2.35)
      .setDepth(80)

    this.createAnimations()
    this.createUi()
    this.bindNetwork()
    this.resizeLayout()

    if (this.state) {
      this.renderFromState(this.state)
    }

    this.scale.on('resize', () => this.resizeLayout())
    window.addEventListener('resize', this.handleWindowResize)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyUi())
    this.checkRewardBalance()
  }

  update(_time: number, delta: number) {
    const movement = this.currentMovement()
    this.updatePlayerAnimation(movement)

    this.moveElapsed += delta
    if (this.moveElapsed >= 33) {
      this.channel?.emit(NETWORK_EVENTS.MOVE, movement)
      this.moveElapsed = 0
    }
  }

  createAnimations() {
    if (!this.anims.exists(IDLE)) {
      this.anims.create({
        key: IDLE,
        frameRate: 8,
        frames: this.anims.generateFrameNumbers(KNIGHT, { start: 0, end: 3 }),
        repeat: -1
      })
    }

    if (!this.anims.exists(MOVE)) {
      this.anims.create({
        key: MOVE,
        frameRate: 10,
        frames: this.anims.generateFrameNumbers(KNIGHT, { start: 4, end: 7 }),
        repeat: -1
      })
    }
  }

  bindNetwork() {
    this.channel?.on(NETWORK_EVENTS.UPDATE, (state: AdventureState) => this.renderFromState(state))
    this.channel?.on(NETWORK_EVENTS.STATE, (state: AdventureState) => this.renderFromState(state))
    this.channel?.on(NETWORK_EVENTS.RESULT, (result: { message: string, state?: AdventureState }) => {
      if (result.message) this.addMessage(result.message)
      if (result.state) this.renderFromState(result.state)
    })
    this.channel?.on(NETWORK_EVENTS.CLAIM, (payload: ClaimPayload | string) => {
      this.claimPayload = typeof payload === 'string'
        ? { sig: payload, request: addresses[contracts.ARTIFACT_REWARD], deadline: ethers.constants.MaxUint256.toString(), receiver: this.state?.address || '' }
        : payload
      this.addMessage('The server signed your reward packet. The chain still expects you to do the clicking.')
      this.renderUi()
    })
    this.channel?.onDisconnect(() => {
      this.addMessage('Disconnected from the authoritative server.')
    })
  }

  createUi() {
    document.getElementById('adventure-ui')?.remove()

    const root = document.createElement('div')
    root.id = 'adventure-ui'
    root.innerHTML = `
      <section class="hud-main">
        <div class="title-row">
          <div>
            <div class="game-title">The Lost Temple</div>
            <div class="room-name"></div>
          </div>
          <div class="wallet-state"></div>
        </div>
        <div class="message-log" aria-live="polite"></div>
        <form class="command-form">
          <span>&gt;</span>
          <input class="command-input" autocomplete="off" spellcheck="false" aria-label="Adventure command" />
          <button type="submit">Enter</button>
        </form>
      </section>
      <aside class="hud-side">
        <div class="panel objective-panel">
          <h2>Objective</h2>
          <div class="objective-text"></div>
        </div>
        <div class="panel inventory-panel">
          <h2>Inventory</h2>
          <div class="inventory-list"></div>
        </div>
        <div class="panel clue-panel">
          <h2>Clues</h2>
          <div class="clue-list"></div>
        </div>
        <div class="panel claim-panel">
          <h2>Reward</h2>
          <div class="claim-status"></div>
          <button class="claim-button" type="button">Claim NFT</button>
        </div>
      </aside>
    `

    document.body.appendChild(root)
    this.uiRoot = root
    this.logPanel = root.querySelector('.message-log') as HTMLDivElement
    this.roomNameEl = root.querySelector('.room-name') as HTMLDivElement
    this.objectiveEl = root.querySelector('.objective-text') as HTMLDivElement
    this.inventoryEl = root.querySelector('.inventory-list') as HTMLDivElement
    this.cluesEl = root.querySelector('.clue-list') as HTMLDivElement
    this.walletEl = root.querySelector('.wallet-state') as HTMLDivElement
    this.claimStatusEl = root.querySelector('.claim-status') as HTMLDivElement
    this.claimButton = root.querySelector('.claim-button') as HTMLButtonElement
    this.commandInput = root.querySelector('.command-input') as HTMLInputElement

    const form = root.querySelector('.command-form') as HTMLFormElement
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      this.submitCommand()
    })
    this.commandInput.addEventListener('keydown', (event) => event.stopPropagation())
    this.claimButton.addEventListener('click', () => this.claimReward())
  }

  destroyUi() {
    window.removeEventListener('resize', this.handleWindowResize)
    this.uiRoot?.remove()
  }

  handleWindowResize = () => {
    this.resizeLayout()
  }

  resizeLayout() {
    const compact = window.innerWidth < 860
    this.uiRoot?.classList.toggle('compact', compact)

    const viewportWidth = compact ? window.innerWidth : Math.max(420, window.innerWidth - 360)
    const viewportHeight = compact ? Math.max(300, Math.floor(window.innerHeight * 0.56)) : window.innerHeight
    const camera = this.cameras.main
    camera.setViewport(0, 0, viewportWidth, viewportHeight)
    const zoom = Math.min(viewportWidth / WORLD_SIZE.width, viewportHeight / WORLD_SIZE.height) * 0.92
    camera.setZoom(Math.max(0.72, zoom))
    camera.centerOn(WORLD_SIZE.width / 2, WORLD_SIZE.height / 2)
  }

  submitCommand() {
    const command = this.commandInput?.value.trim() || ''
    if (!command) return
    this.addMessage(`> ${command}`)
    this.channel?.emit(NETWORK_EVENTS.COMMAND, command)
    if (this.commandInput) this.commandInput.value = ''
  }

  addMessage(message: string) {
    if (!this.logPanel) return
    const entry = document.createElement('div')
    entry.className = 'log-entry'
    entry.textContent = message
    this.logPanel.appendChild(entry)
    while (this.logPanel.children.length > 28) {
      this.logPanel.firstElementChild?.remove()
    }
    this.logPanel.scrollTop = this.logPanel.scrollHeight
  }

  renderFromState(state: AdventureState) {
    this.state = state
    this.player?.setPosition(state.position.x, state.position.y)
    this.renderRoom()
    this.renderUi()
  }

  renderUi() {
    if (!this.state) return
    if (this.roomNameEl) this.roomNameEl.textContent = this.state.roomName
    if (this.objectiveEl) this.objectiveEl.textContent = this.state.objective
    if (this.walletEl) this.walletEl.textContent = this.shortAddress(this.state.address)

    if (this.inventoryEl) {
      this.inventoryEl.textContent = this.state.inventory.length
        ? this.state.inventory.map(item => ITEM_NAMES[item as keyof typeof ITEM_NAMES] || item).join(', ')
        : 'Empty'
    }

    if (this.cluesEl) {
      this.cluesEl.textContent = this.state.discoveredClues.length
        ? this.state.discoveredClues.map(clue => `${clue.title}: ${clue.text}`).join(' ')
        : 'No expedition notes yet.'
    }

    if (this.claimStatusEl) {
      if (this.claimed) this.claimStatusEl.textContent = 'Claimed on local chain.'
      else if (this.claimBusy) this.claimStatusEl.textContent = 'Claim transaction pending...'
      else if (this.claimPayload) this.claimStatusEl.textContent = 'Authorized by server.'
      else if (this.state.rewardAuthorized) this.claimStatusEl.textContent = 'Awaiting server packet...'
      else this.claimStatusEl.textContent = 'Complete the expedition to unlock.'
    }

    if (this.claimButton) {
      this.claimButton.disabled = this.claimed || this.claimBusy || !this.claimPayload
    }
  }

  renderRoom() {
    if (!this.state || !this.graphics) return
    const room = getRoom(this.state.currentRoom)
    const graphics = this.graphics
    graphics.clear()
    this.labels.forEach(label => label.destroy())
    this.labels = []

    graphics.fillStyle(room.palette.ground, 1)
    graphics.fillRect(0, 0, WORLD_SIZE.width, WORLD_SIZE.height)
    graphics.fillStyle(room.palette.shade, 0.55)
    graphics.fillRect(0, 0, WORLD_SIZE.width, 54)
    graphics.fillRect(0, WORLD_SIZE.height - 46, WORLD_SIZE.width, 46)
    graphics.lineStyle(2, room.palette.accent, 0.8)
    graphics.strokeRect(10, 10, WORLD_SIZE.width - 20, WORLD_SIZE.height - 20)

    this.drawExits(room)
    getVisibleObjects(room, this.state).forEach((object: any) => this.drawObject(object))

    if (this.player) {
      this.player.setDepth(90)
      this.player.setPosition(this.state.position.x, this.state.position.y)
    }
  }

  drawExits(room: any) {
    if (!this.graphics || !this.state) return
    for (const exit of room.exits) {
      const available = exit.availableWhen ? exit.availableWhen(this.state) : true
      this.graphics.fillStyle(available ? room.palette.accent : 0x2a2a2a, available ? 0.45 : 0.6)
      this.graphics.fillRect(exit.area.x, exit.area.y, exit.area.width, exit.area.height)
      this.graphics.lineStyle(1, available ? 0xf4e1a1 : 0x777777, 0.9)
      this.graphics.strokeRect(exit.area.x, exit.area.y, exit.area.width, exit.area.height)
      const label = this.add.text(exit.area.x + exit.area.width / 2, exit.area.y - 14, exit.direction.toUpperCase(), {
        color: available ? '#f8e7b0' : '#9f9f9f',
        fontFamily: 'monospace',
        fontSize: '11px'
      }).setOrigin(0.5).setDepth(70)
      this.labels.push(label)
    }
  }

  drawObject(object: any) {
    if (!this.graphics) return
    const visual = object.visual || { kind: 'object', color: 0xffffff, width: 32, height: 32 }
    const { x, y } = object.position
    const color = visual.color || 0xffffff

    switch (visual.kind) {
      case 'wreck':
        this.graphics.fillStyle(color, 1)
        this.graphics.fillRoundedRect(x - 84, y - 24, 150, 38, 7)
        this.graphics.fillStyle(0xd2d6c9, 1)
        this.graphics.fillTriangle(x + 36, y - 22, x + 112, y - 48, x + 54, y + 0)
        this.graphics.fillStyle(0x4b5550, 1)
        this.graphics.fillCircle(x - 56, y + 18, 12)
        break
      case 'crate':
        this.graphics.fillStyle(color, 1)
        this.graphics.fillRect(x - 24, y - 17, 48, 34)
        this.graphics.lineStyle(2, 0x5a3824, 1)
        this.graphics.strokeRect(x - 24, y - 17, 48, 34)
        this.graphics.lineBetween(x - 24, y, x + 24, y)
        break
      case 'item':
        this.graphics.lineStyle(5, color, 1)
        this.graphics.lineBetween(x - 22, y + 4, x + 18, y - 7)
        this.graphics.fillStyle(0x6b4a2c, 1)
        this.graphics.fillRect(x + 12, y - 5, 14, 7)
        break
      case 'vines':
        this.graphics.lineStyle(4, color, 1)
        for (let i = -24; i <= 24; i += 12) {
          this.graphics.beginPath()
          this.graphics.moveTo(x + i, y - 84)
          this.graphics.lineTo(x + i + 10, y - 26)
          this.graphics.lineTo(x + i - 8, y + 42)
          this.graphics.lineTo(x + i + 6, y + 88)
          this.graphics.strokePath()
        }
        break
      case 'river':
        this.graphics.fillStyle(color, 0.9)
        this.graphics.fillRect(x - 43, 0, 86, WORLD_SIZE.height)
        this.graphics.lineStyle(2, 0xbde9f2, 0.75)
        for (let yy = 22; yy < WORLD_SIZE.height; yy += 42) {
          this.graphics.lineBetween(x - 30, yy, x + 28, yy + 12)
        }
        break
      case 'rope':
        this.graphics.lineStyle(5, color, 1)
        this.graphics.strokeCircle(x, y, 18)
        this.graphics.strokeCircle(x + 12, y, 14)
        break
      case 'bridge':
        this.graphics.fillStyle(color, 1)
        const repaired = Boolean(this.state?.flags.bridgeRepaired)
        this.graphics.fillRect(x - 66, y - 14, repaired ? 132 : 50, 28)
        if (!repaired) this.graphics.fillRect(x + 16, y - 14, 50, 28)
        this.graphics.lineStyle(2, 0x4a321f, 1)
        for (let plank = -56; plank <= 56; plank += 22) {
          if (repaired || Math.abs(plank) > 18) this.graphics.lineBetween(x + plank, y - 14, x + plank, y + 14)
        }
        break
      case 'camp':
        this.graphics.fillStyle(0xa77a49, 1)
        this.graphics.fillTriangle(x - 58, y + 20, x - 8, y - 36, x + 42, y + 20)
        this.graphics.fillStyle(0x4f3420, 1)
        this.graphics.fillRect(x + 42, y + 6, 38, 28)
        this.graphics.fillStyle(0x333333, 1)
        this.graphics.fillCircle(x - 78, y + 30, 12)
        break
      case 'journal':
        this.graphics.fillStyle(color, 1)
        this.graphics.fillRoundedRect(x - 20, y - 15, 40, 30, 4)
        this.graphics.lineStyle(2, 0x6e482d, 1)
        this.graphics.lineBetween(x, y - 15, x, y + 15)
        break
      case 'door':
        this.graphics.fillStyle(this.state?.flags.templePuzzleSolved ? 0x171717 : color, 1)
        this.graphics.fillRoundedRect(x - 37, y - 88, 74, 176, 8)
        this.graphics.lineStyle(3, 0xd0b56c, 0.8)
        this.graphics.strokeRoundedRect(x - 37, y - 88, 74, 176, 8)
        break
      case 'symbol':
        this.graphics.fillStyle(color, 0.9)
        this.graphics.fillCircle(x, y, 23)
        this.graphics.lineStyle(2, 0x181818, 0.8)
        this.graphics.strokeCircle(x, y, 23)
        this.addWorldLabel(object.symbol.toUpperCase(), x, y - 7, '#171717', 14)
        break
      case 'altar':
        this.graphics.fillStyle(color, 1)
        this.graphics.fillRect(x - 48, y - 22, 96, 44)
        this.graphics.fillStyle(0x44392d, 1)
        this.graphics.fillRect(x - 34, y + 22, 68, 18)
        break
      case 'artifact':
        this.graphics.fillStyle(color, 1)
        this.graphics.fillCircle(x, y, 18)
        this.graphics.lineStyle(2, 0xfff2c1, 1)
        this.graphics.strokeCircle(x, y, 25)
        break
      default:
        this.graphics.fillStyle(color, 1)
        this.graphics.fillCircle(x, y, 18)
    }

    this.addWorldLabel(object.name, x, y + 34)
  }

  addWorldLabel(text: string, x: number, y: number, color = '#f6edcf', size = 10) {
    const label = this.add.text(x, y, text, {
      color,
      fontFamily: 'monospace',
      fontSize: `${size}px`,
      backgroundColor: color === '#171717' ? undefined : 'rgba(12, 18, 16, 0.62)',
      padding: { x: 4, y: 2 }
    }).setOrigin(0.5).setDepth(75)
    this.labels.push(label)
    return label
  }

  currentMovement() {
    if (document.activeElement === this.commandInput) return [false, false, false, false]
    return [
      Boolean(this.cursors?.up.isDown || this.wasd?.W?.isDown),
      Boolean(this.cursors?.down.isDown || this.wasd?.S?.isDown),
      Boolean(this.cursors?.left.isDown || this.wasd?.A?.isDown),
      Boolean(this.cursors?.right.isDown || this.wasd?.D?.isDown)
    ]
  }

  updatePlayerAnimation(movement: boolean[]) {
    if (!this.player) return
    const moving = movement.some(Boolean)
    if (movement[2]) this.lastDirectionIsLeft = true
    if (movement[3]) this.lastDirectionIsLeft = false
    this.player.setFlipX(this.lastDirectionIsLeft)
    this.player.anims.play(moving ? MOVE : IDLE, true)
  }

  async checkRewardBalance() {
    try {
      if (!this.signer) return
      const manager = getContract(contracts.ARTIFACT_REWARD, this.signer) as any
      const balance = await manager.balanceOf(await this.signer.getAddress())
      if (balance.gt(0)) {
        this.claimed = true
        this.renderUi()
      }
    } catch (error) {
      this.addMessage('Reward contract is not reachable yet. Deploy locally before claiming.')
    }
  }

  async claimReward() {
    if (!this.claimPayload || this.claimed || this.claimBusy || !this.signer) return
    this.claimBusy = true
    this.renderUi()

    try {
      const claimVerifier = getContract(contracts.CLAIM_VERIFIER, this.signer) as ClaimVerifier
      const { v, r, s } = ethers.utils.splitSignature(this.claimPayload.sig)
      const request = this.claimPayload.request
      const deadline = this.claimPayload.deadline
      const receiver = this.claimPayload.receiver
      const tx = await claimVerifier.claim(request, { v, r, s, request, deadline, receiver })
      this.addMessage(`Claim transaction sent: ${tx.hash}`)
      await tx.wait()
      this.claimed = true
      this.addMessage('NFT claimed on the local Hardhat chain.')
    } catch (error: any) {
      console.error(error)
      this.addMessage(error?.reason || error?.message || 'Claim failed.')
    } finally {
      this.claimBusy = false
      this.renderUi()
    }
  }

  shortAddress(address: string) {
    if (!address) return 'No wallet'
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }
}
