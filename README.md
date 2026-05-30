# The Hollow Maze

A first-person horror maze game built with Three.js. You wake up trapped in a dark procedural maze with a stalking entity. Find three keys, reach the exit, and don't let it catch you.

## Quick start

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`). Click **ENTER THE MAZE** and the pointer will lock to the canvas.

## Controls

### Desktop

| Key | Action |
|-----|--------|
| `W A S D` | Move |
| Mouse | Look |
| `F` | Toggle flashlight |
| `E` | Pick up / Interact |
| `Esc` | Pause |

### Mobile (touch)

Open the page in your phone's browser and rotate to landscape. The game shows touch controls automatically:

- **Left joystick** — move (analog, supports diagonals and partial speed)
- **Right side drag** — look around
- **F button** — toggle flashlight
- **E button** — interact / pick up
- **‖ button** (top right) — pause

## How to play

- Three keys are hidden throughout the maze. Collect all three.
- Blue battery cells recharge your flashlight. Manage drain carefully.
- The exit (red-glowing door) is locked until you have all three keys.
- The monster wanders, searches noise, and chases anything its eyes catch. A flashlight beam pointed at it dramatically increases detection range.
- Hide by breaking line of sight — the monster will lose interest after a few seconds.

## Architecture

All game code lives in `src/`. Each module owns one concern:

| File | Responsibility |
|------|---------------|
| `main.js` | Bootstraps the game on page load. |
| `Game.js` | Top-level orchestrator: scene, renderer, state machine, main loop. |
| `MazeGenerator.js` | Recursive-backtracker maze + BFS helpers + pickup placement. |
| `Player.js` | First-person controller with PointerLockControls, head bob, analog joystick input. |
| `MobileControls.js` | Touch joystick + look pad + buttons for mobile/landscape play. |
| `FlashlightSystem.js` | SpotLight rigged to camera + battery + flicker logic. |
| `MonsterAI.js` | Patrol / Search / Chase state machine with grid pathfinding. |
| `Environment.js` | Walls, floor, ceiling, decals, emergency lights, fog dynamics, procedural textures. |
| `CollisionSystem.js` | Grid-aware AABB collisions + line-of-sight raycast. |
| `AudioManager.js` | All sounds synthesized at runtime via Web Audio API. |
| `UI.js` | DOM HUD wrapper. |
| `PostProcessing.js` | Bloom + vignette + chromatic aberration + film grain composer. |

### Why procedural assets

The project ships zero binary assets so it runs as soon as `npm install` finishes. Textures are painted into `<canvas>` elements at startup, sounds are synthesized with `OscillatorNode` / noise buffers, and the maze is generated fresh every game. Replace any of these with imported assets (a `.glb` for the monster, audio files in `public/`) without touching the rest of the code.

## Project structure

```
horror-maze-game/
├── index.html
├── package.json
├── vite.config.js
├── README.md
└── src/
    ├── main.js
    ├── Game.js
    ├── MazeGenerator.js
    ├── Player.js
    ├── FlashlightSystem.js
    ├── MonsterAI.js
    ├── Environment.js
    ├── CollisionSystem.js
    ├── AudioManager.js
    ├── UI.js
    ├── PostProcessing.js
    ├── MobileControls.js
    └── styles.css
```

## Tuning the difficulty

Numbers worth tweaking live near the top of each module:

- `Game.js` → `mazeConfig` (grid size, cell size, wall height) and `totalKeys`.
- `MonsterAI.js` → `speeds`, `detectionRange`, `flashlightRange`.
- `FlashlightSystem.js` → `drainRate`, `DIM_THRESHOLD`, `FLICKER_THRESHOLD`, `CRITICAL_THRESHOLD`.
- `Player.js` → `walkSpeed`, `acceleration`, `friction`.
- `MobileControls.js` → `lookSensitivity`, `_joystickRadius`.

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # serves dist/ locally
```

## Deploy to Firebase Hosting

The site deploys to **https://play-horror-maze.web.app**.

One-time setup (machine-level):

```bash
npm install -g firebase-tools
firebase login
```

Deploy:

```bash
npm run deploy            # production
npm run deploy:preview    # ephemeral preview channel
```

The `firebase.json` `predeploy` hook runs `npm run build` automatically, so you don't need to build first. Caching: hashed assets in `assets/` are `immutable` for a year; `index.html` is `no-cache` so updates roll out immediately.

### Firebase config

Firebase config lives in `.env.local` (gitignored). Copy `.env.example` to `.env.local` and fill in real values from Firebase Console → Project Settings → Your apps → Web app:

```bash
cp .env.example .env.local
# then edit .env.local with real values
```

Vite inlines `VITE_FIREBASE_*` vars at build time, so they end up in the deployed JS bundle. That's fine — Firebase **web** API keys are public-by-design (they identify the project, not authenticate). Actual security comes from:

1. **HTTP-referrer restrictions** on the API key in Google Cloud Console → APIs & Services → Credentials → restrict to `play-horror-maze.web.app`, `play-horror-maze.firebaseapp.com`, and `localhost:*`.
2. **Firebase Security Rules** locking Firestore/Storage if/when you add them.
3. **App Check** (Firebase Console) to block traffic that isn't coming from your own site.
