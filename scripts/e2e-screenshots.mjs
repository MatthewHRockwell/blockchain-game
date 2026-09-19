// End-to-end screenshot harness for The Lost Temple.
//
// Plays the full adventure in headless Chrome with a scripted local Hardhat
// wallet: connects, signs the EIP-712 auth challenge, walks all six rooms,
// solves the glyph puzzle, recovers the artifact, receives the server-signed
// reward packet, claims the NFT on the local chain, and verifies the on-chain
// balance. Captures the readme screenshots along the way.
//
// Prerequisites (each running, fresh server session for the player address):
//   npm run node      # Hardhat chain on 8545
//   npm run deploy    # reward contracts
//   npm run server    # authoritative game server on 9208
//   npm run client    # Vite client on 3000
//   npm run install:e2e
//
// Then: npm run e2e:screenshots
//
// Environment overrides: RPC_URL, CLIENT_URL, CHROME_BIN, PLAYER_KEY.
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(repoRoot, 'server', 'package.json'))
const { ethers } = require('ethers')

const RPC = process.env.RPC_URL || 'http://127.0.0.1:8545'
const CLIENT = process.env.CLIENT_URL || 'http://localhost:3000'
// Hardhat development account #1 (public well-known key, local chain only)
const PLAYER_KEY = process.env.PLAYER_KEY || '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const OUT = path.join(repoRoot, 'readme')

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium'
].filter(Boolean)
const chromePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate))
if (!chromePath) throw new Error('No Chrome/Chromium binary found. Set CHROME_BIN.')

const provider = new ethers.providers.JsonRpcProvider(RPC)
const wallet = new ethers.Wallet(PLAYER_KEY, provider)

function log(msg) {
  console.log(`[e2e] ${msg}`)
}

async function walletRequest({ method, params }) {
  switch (method) {
    case 'eth_requestAccounts':
    case 'eth_accounts':
      return [wallet.address]
    case 'eth_chainId':
      return '0x7a69'
    case 'net_version':
      return '31337'
    case 'eth_signTypedData_v4': {
      const [, payload] = params
      const data = JSON.parse(payload)
      const { EIP712Domain, ...types } = data.types
      return wallet._signTypedData(data.domain, types, data.message)
    }
    case 'eth_sendTransaction': {
      const [tx] = params
      const sent = await wallet.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value,
        gasLimit: tx.gas
      })
      return sent.hash
    }
    default:
      return provider.send(method, params || [])
  }
}

async function preparePage(context) {
  const page = await context.newPage()
  await page.exposeFunction('__walletRequest', (args) => walletRequest(args))
  await page.addInitScript(() => {
    const request = (args) => window.__walletRequest(args)
    window.ethereum = {
      isMetaMask: true,
      request,
      enable: () => request({ method: 'eth_requestAccounts' }),
      on: () => {},
      off: () => {},
      removeListener: () => {},
      removeAllListeners: () => {}
    }
  })
  return page
}

async function getState(page) {
  return page.evaluate(() => {
    const game = window.__LOST_TEMPLE_GAME__
    const scene = game?.scene?.getScene('mainscene')
    return scene?.state ? JSON.parse(JSON.stringify(scene.state)) : null
  })
}

async function waitFor(fn, what, timeoutMs = 30000, intervalMs = 250) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const value = await fn()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(`timed out waiting for ${what}`)
}

async function typeCommand(page, command, verify) {
  await page.fill('.command-input', command)
  await page.press('.command-input', 'Enter')
  await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur())
  await new Promise((resolve) => setTimeout(resolve, 450))
  if (verify) {
    await waitFor(async () => verify(await getState(page)), `effect of "${command}"`, 8000)
  }
  log(`ok: ${command}`)
}

async function moveTo(page, targetX, targetY, timeoutMs = 40000) {
  const start = Date.now()
  const held = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false }
  const setKey = async (key, want) => {
    if (held[key] === want) return
    held[key] = want
    if (want) await page.keyboard.down(key)
    else await page.keyboard.up(key)
  }
  const startRoom = (await getState(page))?.currentRoom
  try {
    while (Date.now() - start < timeoutMs) {
      const state = await getState(page)
      if (!state) throw new Error('lost game state while moving')
      if (state.currentRoom !== startRoom) return state
      const dx = targetX - state.position.x
      const dy = targetY - state.position.y
      if (Math.hypot(dx, dy) <= 10) return state
      await setKey('ArrowRight', dx > 6)
      await setKey('ArrowLeft', dx < -6)
      await setKey('ArrowDown', dy > 6)
      await setKey('ArrowUp', dy < -6)
      await new Promise((resolve) => setTimeout(resolve, 90))
    }
    throw new Error(`timed out moving to ${targetX},${targetY}`)
  } finally {
    for (const key of Object.keys(held)) if (held[key]) await page.keyboard.up(key)
  }
}

async function waitRoom(page, roomId) {
  await waitFor(async () => (await getState(page))?.currentRoom === roomId, `room ${roomId}`)
  await new Promise((resolve) => setTimeout(resolve, 2600)) // let the entry banner fade
}

async function openClient(page, width, height) {
  await page.goto(CLIENT)
  await page.waitForSelector('canvas', { timeout: 20000 })
  await new Promise((resolve) => setTimeout(resolve, 1800))
  return { buttonX: width * 0.5, buttonY: height * 0.5 + 62 }
}

async function clickConnectAndWait(page, buttonX, buttonY, width, height) {
  for (let attempt = 1; attempt <= 8; attempt++) {
    await page.mouse.click(buttonX, buttonY)
    try {
      await waitFor(async () => Boolean(await getState(page)), 'main scene state', 15000)
      return
    } catch {
      // A rejected login (e.g. the previous session has not been dropped yet)
      // strands the client on the connect scene, so reload before retrying.
      log(`connect attempt ${attempt} did not reach main scene, reloading and retrying`)
      await new Promise((resolve) => setTimeout(resolve, 5000))
      await openClient(page, width, height)
    }
  }
  throw new Error('could not connect to the game server')
}

const browser = await chromium.launch({ executablePath: chromePath, headless: true })

try {
  log(`player wallet: ${wallet.address}`)
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await preparePage(context)
  page.on('console', (msg) => msg.type() === 'error' && log(`page error: ${msg.text()}`))

  const { buttonX, buttonY } = await openClient(page, 1440, 900)
  await page.screenshot({ path: path.join(OUT, 'lost-temple-start.png') })
  log('captured start screen')

  await clickConnectAndWait(page, buttonX, buttonY, 1440, 900)
  await waitRoom(page, 'crash-site')
  await page.screenshot({ path: path.join(OUT, 'lost-temple-connected.png') })
  log('connected; captured crash site')

  await moveTo(page, 300, 228)
  await typeCommand(page, 'TAKE MACHETE', (s) => s?.flags?.macheteCollected)
  await moveTo(page, 615, 180)
  await waitRoom(page, 'jungle-trail')

  await moveTo(page, 480, 200)
  await typeCommand(page, 'USE MACHETE ON VINES', (s) => s?.flags?.vinesCut)
  await moveTo(page, 615, 185)
  await waitRoom(page, 'river-crossing')

  await moveTo(page, 150, 250)
  await typeCommand(page, 'TAKE ROPE', (s) => s?.flags?.ropeCollected)
  await moveTo(page, 262, 196)
  await typeCommand(page, 'USE ROPE ON BRIDGE', (s) => s?.flags?.bridgeRepaired)
  await moveTo(page, 615, 185)
  await waitRoom(page, 'abandoned-camp')

  await moveTo(page, 380, 232)
  await typeCommand(page, 'READ JOURNAL', (s) => s?.flags?.journalRead)
  await moveTo(page, 615, 185)
  await waitRoom(page, 'temple-entrance')

  await moveTo(page, 236, 200)
  await typeCommand(page, 'USE STAR')
  await moveTo(page, 320, 200)
  await typeCommand(page, 'USE RAIN')
  await moveTo(page, 404, 200)
  await typeCommand(page, 'USE JAGUAR', (s) => s?.flags?.templePuzzleSolved)
  await moveTo(page, 615, 185)
  await waitRoom(page, 'inner-temple')

  await moveTo(page, 200, 120)
  await moveTo(page, 330, 120)
  await typeCommand(page, 'TAKE ARTIFACT', (s) => s?.completed)

  await waitFor(
    () => page.$eval('.claim-button', (button) => !button.disabled),
    'claim button enabled'
  )
  await new Promise((resolve) => setTimeout(resolve, 800))
  await page.screenshot({ path: path.join(OUT, 'lost-temple-pre-claim.png') })
  log('reward authorized; captured pre-claim')

  await page.click('.claim-button')
  await waitFor(
    () => page.$eval('.claim-status', (el) => el.textContent?.includes('Claimed on local chain')),
    'claim confirmation'
  )
  await new Promise((resolve) => setTimeout(resolve, 800))
  await page.screenshot({ path: path.join(OUT, 'lost-temple-claimed.png') })
  log('NFT claimed; captured claimed state')

  const { addresses, contracts } = await import(path.join(repoRoot, 'commons', 'contracts.mjs'))
  const manager = new ethers.Contract(
    addresses[contracts.ARTIFACT_REWARD],
    ['function balanceOf(address) view returns (uint256)'],
    provider
  )
  const balance = (await manager.balanceOf(wallet.address)).toString()
  log(`on-chain reward balance for player: ${balance}`)
  if (balance === '0') throw new Error('claim transaction did not mint the reward')

  await context.close()
  await new Promise((resolve) => setTimeout(resolve, 4000)) // let the server drop the session

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const mobilePage = await preparePage(mobileContext)
  const mobile = await openClient(mobilePage, 390, 844)
  await clickConnectAndWait(mobilePage, mobile.buttonX, mobile.buttonY, 390, 844)
  await waitRoom(mobilePage, 'inner-temple')
  await waitFor(
    () => mobilePage.$eval('.claim-status', (el) => el.textContent?.includes('Claimed on local chain')),
    'mobile claimed status'
  )
  await new Promise((resolve) => setTimeout(resolve, 800))
  await mobilePage.screenshot({ path: path.join(OUT, 'lost-temple-mobile-claimed.png') })
  log('captured mobile claimed layout')
  await mobileContext.close()

  log('ALL SCREENSHOTS CAPTURED')
} finally {
  await browser.close()
}
