# The Hollow Maze

A first-person horror maze game built with Three.js. You wake up trapped in a dark procedural maze with a stalking entity. Find three keys, reach the exit, and don't let it catch you.

## Quick start

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`). Click **ENTER THE MAZE** and the pointer will lock to the canvas.

## Controls

| Key | Action |
|-----|--------|
| `W A S D` | Move |
| Mouse | Look |
| `Shift` | Sprint (also makes noise — monster can hear you) |
| `F` | Toggle flashlight |
| `E` | Pick up / Interact |
| `Esc` | Pause |

## How to play

- Three keys are hidden throughout the maze. Collect all three.
- Blue battery cells recharge your flashlight. Manage drain carefully.
- The exit (red-glowing door) is locked until you have all three keys.
- The monster wanders, searches noise, and chases anything its eyes catch. A flashlight beam pointed at it dramatically increases detection range.
- Hide by breaking line of sight and moving quietly (no sprint) — it will lose interest after a few seconds.

## Architecture

All game code lives in `src/`. Each module owns one concern:

| File | Responsibility |
|------|---------------|
| `main.js` | Bootstraps the game on page load. |
| `Game.js` | Top-level orchestrator: scene, renderer, state machine, main loop. |
| `MazeGenerator.js` | Recursive-backtracker maze + BFS helpers + pickup placement. |
| `Player.js` | First-person controller with PointerLockControls, head bob, stamina. |
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
    └── styles.css
```

## Tuning the difficulty

Numbers worth tweaking live near the top of each module:

- `Game.js` → `mazeConfig` (grid size, cell size, wall height) and `totalKeys`.
- `MonsterAI.js` → `speeds`, `detectionRange`, `flashlightRange`, `noiseRange`.
- `FlashlightSystem.js` → `drainRate`, `FLICKER_THRESHOLD`, `CRITICAL_THRESHOLD`.
- `Player.js` → `walkSpeed`, `sprintSpeed`, stamina drain/regen.

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # serves dist/ locally
```
