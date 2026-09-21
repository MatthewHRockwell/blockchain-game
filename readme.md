# The Lost Temple

The Lost Temple is a six-room, server-authoritative graphical parser adventure built from a sanitized blockchain game starter. It combines early-1990s adventure-game interaction patterns with a modern local WebRTC server and a Trustus-style blockchain reward claim.

The player is a stranded expedition engineer who must recover a machete, cut through jungle vines, repair a river crossing, read an abandoned journal, solve a temple glyph puzzle, recover an artifact, and then claim a locally authorized NFT reward.

Attribution: this assessment baseline is derived from the original `davideliasdev05/blockchain-game` starter repository. It was re-rooted from sanitized source rather than preserving the original Git history. See [SECURITY.md](SECURITY.md).

## Screenshots

Captured during local end-to-end QA against the localhost stack.

![Start screen](readme/lost-temple-start.png)

![Connected local wallet](readme/lost-temple-connected.png)

![Reward authorized before claim](readme/lost-temple-pre-claim.png)

![NFT claimed on local Hardhat chain](readme/lost-temple-claimed.png)

![Mobile claimed layout](readme/lost-temple-mobile-claimed.png)

## Architecture

```mermaid
flowchart TD
  Browser[Phaser/Vite client] -->|movement input + raw parser commands| Geckos[Geckos WebRTC]
  Geckos --> Server[Authoritative Node server]
  Server --> State[Adventure state engine]
  State --> Rooms[Room definitions + object rules]
  State --> Parser[Deterministic command parser]
  State --> Completion[Verified completion flags]
  Completion -->|trusted EIP-712 packet only after valid progression| Claim[ClaimVerifier]
  Claim --> Reward[ClaimManagerERC721 artifact reward]
```

The client renders the world, captures movement, accepts typed commands, displays inventory/clues, and submits the final claim transaction. It does not decide inventory, room transitions, puzzle results, completion, or reward eligibility.

The server owns player state for each authenticated session:

- current room ID
- authoritative position
- inventory
- progression flags
- discovered clues
- temple glyph sequence
- completion and reward authorization state

## Security Model

Material gameplay actions are validated by the server. A modified client cannot set `artifactRecovered`, add inventory, teleport rooms, solve the puzzle, or request a reward by sending fabricated state. The server accepts raw movement and typed command strings, then derives every state transition from the authoritative room model and player position.

Reward authorization is only emitted after these server-owned flags are true:

- `macheteCollected`
- `vinesCut`
- `ropeCollected`
- `bridgeRepaired`
- `journalRead`
- `templePuzzleSolved`
- `artifactRecovered`
- `completed`

The Solidity contracts still verify that the reward packet was signed by the trusted local server signer. Local Hardhat accounts only are required. No real private keys, seed phrases, testnet funds, mainnet funds, or external RPC credentials are needed.

## Gameplay

Rooms use stable IDs rather than display strings:

1. `crash-site` - recover the machete near the damaged survey aircraft.
2. `jungle-trail` - cut obstructing vines with the machete.
3. `river-crossing` - collect rope and repair the bridge.
4. `abandoned-camp` - read the expedition journal and record the glyph clue.
5. `temple-entrance` - enter the three-symbol sequence on the glyph controls.
6. `inner-temple` - recover the artifact and unlock the server-authorized reward.

Movement uses WASD or arrow keys. Commands are typed into the command line and submitted with Enter. Useful commands include:

```text
LOOK
LOOK AT AIRCRAFT
TAKE MACHETE
USE MACHETE ON VINES
TAKE ROPE
USE ROPE ON BRIDGE
READ JOURNAL
USE STAR
INVENTORY
HELP
GO EAST
```

## Local Runtime

Use Node `20.20.2` and npm `10.8.2`. The legacy Geckos/WebRTC path depends on `node-datachannel@0.4.3`, which did not install cleanly under Node 22 in this environment.

If you have the isolated runtime used during validation:

```bash
export PATH="$HOME/Tools/node-v20.20.2-linux-x64/bin:$PATH"
node --version
npm --version
node -p "process.versions.modules"
```

Expected:

```text
v20.20.2
10.8.2
115
```

## Install

Install dependencies explicitly from the repository root:

```bash
npm run install:contracts
npm run install:server
npm run install:client
```

This project standardizes on npm. Do not use pnpm workspace commands for this assessment.

## Run

Run each service in a separate terminal from the repository root.

Start the local Hardhat chain:

```bash
npm run node
```

Deploy the reward contracts:

```bash
npm run deploy
```

Start the authoritative game server:

```bash
npm run server
```

Start the Vite client:

```bash
npm run client
```

Open:

```text
http://localhost:3000
```

Use a browser wallet connected to local Hardhat chain ID `31337`. Import or use only Hardhat development accounts.

## Tests

Run parser, progression, anti-cheat, and auth tests:

```bash
npm test
```

Run the local blockchain reward integration test after Hardhat is running and contracts are deployed:

```bash
npm run test:blockchain
```

Compile contracts:

```bash
npm run compile --prefix contracts
```

Build the production client bundle:

```bash
npm run build --prefix client
```

### Room preview harness

With the Vite dev server running, open `http://localhost:3000/preview.html` to render any room in `MainScene` against a stub channel and fabricated state - no wallet, game server, or chain required. Useful for art iteration and screenshots. Query parameters:

```text
/preview.html?room=river-crossing&flags=macheteCollected,vinesCut&inventory=machete
```

The harness is dev-only; `preview.html` is not part of the production build.

### End-to-end screenshot harness

`scripts/e2e-screenshots.mjs` plays the entire adventure in headless Chrome with a scripted local Hardhat wallet: it connects, signs the EIP-712 auth challenge, walks all six rooms, solves the glyph puzzle, receives the server-signed reward packet, claims the NFT on the local chain, verifies the on-chain balance, and recaptures every readme screenshot (including the mobile layout via a reconnect). With the full stack running (`npm run node`, `npm run deploy`, `npm run server`, `npm run client`) and a fresh game-server session:

```bash
npm run install:e2e
npm run e2e:screenshots
```

It needs a local Chrome/Chromium (`CHROME_BIN` to override) and uses Hardhat development account #1 as the player.

## Project Structure

```text
commons/adventure/        Shared parser schema, command parser, room definitions
server/auth.js            Testable local challenge/signature authorization helpers
server/persistence.js     File-backed player state store with debounced atomic writes
server/game/adventure/    Server-owned state and authoritative action engine
server/game/scenes/       Headless Phaser authoritative session scene
client/src/scenes/        Wallet connection, Geckos connection, rendered adventure UI
contracts/src/            ClaimVerifier and ClaimManagerERC721 Solidity contracts
test/                     Node test-runner coverage for parser, progression, auth, rewards
scripts/                  Headless end-to-end gameplay, claim, and screenshot harness
```

## Design Decisions

- The command parser returns structured intents; it does not mutate state.
- The action engine clones state, validates room/object/position/prerequisites, and returns structured results.
- The client displays server snapshots and result messages rather than making material decisions locally.
- The symbol puzzle is sequence-based and owned by server state.
- Repeated actions are idempotent or rejected without duplicating inventory/rewards.
- The blockchain reward path remains local and uses the existing Trustus verifier pattern.

## State Persistence

Player states survive server restarts. The server keeps authoritative state in a file-backed store (`server/persistence.js`) that loads `server/data/player-states.json` at startup, debounces atomic writes while play is in progress, and flushes on disconnect and shutdown. Set `STATE_FILE` to override the storage path. A corrupt state file is backed up to `player-states.json.corrupt` and the server starts fresh rather than crashing. Delete `server/data/` to reset all progress.

## Known Limitations

- Interactive play still requires a browser wallet configured for Hardhat localhost; the automated claim flow is covered by the end-to-end harness in `scripts/`.
- The legacy Vite 2 build still emits a single large chunk, dominated by Phaser and ethers v5; a Vite major upgrade and code splitting were intentionally deferred. Web3Modal was dropped in favour of a direct injected-provider request, since only injected wallets were ever supported, cutting the gzipped bundle by roughly a third.
- The art direction is fully procedural (layered scenery, particles, and lighting drawn in code) plus the starter knight sprite; there is no external sprite pack.

## Security Baseline

The starter repository contained unrelated unsafe remote-execution artifacts. They were removed before development, and the submitted repository was re-rooted from sanitized source. No malicious payloads are preserved in ordinary reachable Git history. See [SECURITY.md](SECURITY.md).
