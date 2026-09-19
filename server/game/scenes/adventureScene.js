import Phaser from "phaser"
import { ethers } from "ethers"
import { NETWORK_EVENTS } from "../../../commons/adventure/schema.mjs"
import { addresses, contracts } from "../../../commons/contracts.mjs"
import { createAdventureState, cloneAdventureState, toPublicState } from "../adventure/state.js"
import {
  applyCommand,
  applyMovement,
  canAuthorizeReward,
  canReissueRewardPacket,
  getInitialMessage,
  markRewardPacketIssued
} from "../adventure/engine.js"
import { signPacket } from "../utils.js"

const SNAPSHOT_INTERVAL_MS = 50
const MAX_COMMAND_LENGTH = 160

export default class AdventureScene extends Phaser.Scene {
  channel
  wallet
  onStateChange
  adventureState
  movement = [false, false, false, false]
  lastSnapshotAt = 0
  claimManager = addresses[contracts.ARTIFACT_REWARD]

  constructor() {
    super("adventure")
  }

  init({ channel, wallet, initialState, onStateChange }) {
    this.channel = channel
    this.wallet = wallet
    this.onStateChange = onStateChange
    this.adventureState = initialState
      ? cloneAdventureState(initialState)
      : createAdventureState(channel.userData.address)
  }

  create() {
    this.channel.on(NETWORK_EVENTS.MOVE, (movement) => {
      this.movement = Array.isArray(movement) ? movement.slice(0, 4).map(Boolean) : [false, false, false, false]
    })

    this.channel.on(NETWORK_EVENTS.COMMAND, (command) => {
      this.handleCommand(command)
    })

    this.channel.onDisconnect(() => {
      this.persistState()
      this.scene.stop()
    })

    this.emitResult(getInitialMessage(this.adventureState))
    this.emitState(NETWORK_EVENTS.READY)

    if (canReissueRewardPacket(this.adventureState)) {
      this.issueRewardPacket("Restored session: your reward authorization has been reissued. The claim panel is ready.")
        .catch(() => this.emitResult("The reward signer is unavailable. Start the local chain, then reconnect to receive your packet."))
    }
  }

  update(time, delta) {
    const movementResult = applyMovement(this.adventureState, this.movement, delta)
    this.setAdventureState(movementResult.state)
    if (movementResult.message) this.emitResult(movementResult.message)

    if (time - this.lastSnapshotAt >= SNAPSHOT_INTERVAL_MS) {
      this.emitState(NETWORK_EVENTS.UPDATE)
      this.lastSnapshotAt = time
    }
  }

  async handleCommand(command) {
    if (typeof command !== "string") {
      this.emitResult("Invalid command packet. Nice try, but the jungle only accepts words.")
      return
    }

    const trimmed = command.trim()
    if (trimmed.length > MAX_COMMAND_LENGTH) {
      this.emitResult("That command is longer than the expedition charter.")
      return
    }

    const commandResult = applyCommand(this.adventureState, trimmed)
    this.setAdventureState(commandResult.state)
    if (commandResult.message) this.emitResult(commandResult.message)
    this.emitState(NETWORK_EVENTS.STATE)

    if (commandResult.rewardAuthorized) {
      await this.authorizeReward()
    }
  }

  async authorizeReward() {
    if (!canAuthorizeReward(this.adventureState)) return
    await this.issueRewardPacket("Reward authorization received. The claim panel is ready.", { markIssued: true })
  }

  async issueRewardPacket(message, { markIssued = false } = {}) {
    const request = this.claimManager
    const deadline = ethers.constants.MaxUint256
    const receiver = this.channel.userData.address
    const sig = await signPacket(this.wallet, request, deadline, receiver)

    if (markIssued) this.setAdventureState(markRewardPacketIssued(this.adventureState))
    this.channel.emit(NETWORK_EVENTS.CLAIM, {
      sig,
      request,
      deadline: deadline.toString(),
      receiver
    })
    this.emitResult(message)
    this.emitState(NETWORK_EVENTS.STATE)
  }

  setAdventureState(nextState) {
    this.adventureState = nextState
    this.persistState()
  }

  persistState() {
    if (this.onStateChange && this.adventureState) {
      this.onStateChange(cloneAdventureState(this.adventureState))
    }
  }

  emitResult(message) {
    this.channel.emit(NETWORK_EVENTS.RESULT, {
      message,
      state: toPublicState(this.adventureState)
    })
  }

  emitState(eventName) {
    this.channel.emit(eventName, toPublicState(this.adventureState))
  }
}
