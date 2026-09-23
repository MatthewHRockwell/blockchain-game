import "@geckos.io/phaser-on-nodejs"
import geckos from '@geckos.io/server'
import config from './game/config.js'
import AdventureScene from './game/scenes/adventureScene.js'
import express from 'express'
import http from 'http'
import cors from 'cors'
import { ethers } from "ethers"
import dotenv from 'dotenv'
import { iceServers } from "@geckos.io/server"
import { createChallenge, verifyAuthorization } from './auth.js'
import { createSessionRegistry } from './sessions.js'
import { createStateStore } from './persistence.js'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config()

const serverDir = path.dirname(fileURLToPath(import.meta.url))

// phaser-on-nodejs provides requestAnimationFrame but Phaser loop cleanup expects the matching cancel API.
if (globalThis.window && typeof globalThis.window.cancelAnimationFrame !== 'function') {
    globalThis.window.cancelAnimationFrame = clearTimeout
}

const app = express()
const server = http.createServer(app)

app.use(cors())
app.use(express.text())

function stopGame(game) {
    try {
        game.scene.stop('adventure')
        game.loop.stop()
    } catch (error) {
        console.error('failed to stop game loop:', error?.message || error)
    }
}

const authRequest = new Map()
// Stops a superseded session: the scene first, so it writes no further state, then
// the channel so the old tab is told to go away instead of lingering as a zombie.
const sessions = createSessionRegistry({
    stopSession: ({ game, channel }) => {
        stopGame(game)
        channel?.close?.()
    }
})
const playerStates = createStateStore({
    filePath: process.env.STATE_FILE || path.join(serverDir, 'data', 'player-states.json')
})

const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545"
const wallet = new ethers.providers.JsonRpcProvider(rpcUrl).getSigner(0)
let signerAddress
wallet.getAddress().then(address => {
    console.log("trusted address: ", address)
    signerAddress = address
}).catch(error => {
    console.error("trusted signer unavailable:", error.message)
    signerAddress = 'unavailable'
})

//GET signer address
app.get("/signer", (req, res) => {
    res.setHeader('Content-Type', 'text/plain')
    res.send(signerAddress ? signerAddress : 'generating..')
})

//request authentication secret
app.post("/challenge", (req, res) => {
    //get address
    const address = req.body

    const secret = createChallenge(authRequest, address)

    //return secret
    res.setHeader('Content-Type', 'text/plain')
    res.send(secret)
})

const io = geckos({
    //verify address used
    authorization: (auth, req, res) => {
        return verifyAuthorization(auth, { authRequest })
    },
    cors: { allowAuthorization: true },
    iceServers: process.env.NODE_ENV === 'production' ? iceServers : []
})

io.addServer(server)

io.onConnection(channel => {
    const address = channel.userData.address
    console.log(address, 'joined')

    //create new game instance
    const game = new Phaser.Game(config)

    //set scene for game
    game.scene.add('adventure', AdventureScene, true, {
        channel,
        wallet,
        initialState: playerStates.get(address),
        onStateChange: (state) => playerStates.set(address, state)
    })

    // Registering supersedes any session still held for this address. The newcomer
    // already proved ownership by signing the challenge.
    const session = { game, channel }
    sessions.start(address, session)

    channel.onDisconnect(() => {
        // A superseded channel disconnects long after it was replaced, so only clear
        // the registry when it still points at this session.
        const wasCurrent = sessions.endIfCurrent(address, session)
        stopGame(game)
        playerStates.flush()
        console.log(address, wasCurrent ? 'disconnected' : 'disconnected (already superseded)')
    })
})

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
        playerStates.flush()
        process.exit(0)
    })
}
process.on('exit', () => playerStates.flush())

server.listen(9208, () => {
    console.log("authoritative adventure server listening on 9208")
})