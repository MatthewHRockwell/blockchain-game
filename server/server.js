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

dotenv.config()

const app = express()
const server = http.createServer(app)

app.use(cors())
app.use(express.text())

const authRequest = new Map()
const sessions = new Map()
const playerStates = new Map()

//generate signer
const wallet = process.env.NODE_ENV === 'production' ? ethers.Wallet.createRandom() : new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80")
let signerAddress
wallet.getAddress().then(address => {
    console.log("trusted address: ", address)
    signerAddress = address
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
        return verifyAuthorization(auth, { authRequest, sessions })
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

    //add game to sessions map
    sessions.set(address, game)

    //delete sessions from sessions map after dc
    channel.onDisconnect(() => {
        sessions.delete(address)
        game.destroy(true)
        console.log(address, 'disconnected')
    })
})

server.listen(9208, () => {
    console.log("authoritative adventure server listening on 9208")
})