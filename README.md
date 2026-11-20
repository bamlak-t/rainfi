# ☔ Rainfi

A cozy, lo-fi pixel idle game. Rain drips off a roof **on the beat** and wears the earth away, layer by layer, forever.

**Play:** https://bamlak-t.github.io/rainfi/ · the first single-file prototype is kept at `/rainfi/prototype-v1.html`

## Stack
- **TypeScript + Vite**, with a custom 192×176 canvas renderer (no engine)
- **Tone.js** for the lo-fi loop (wobbly tape pads, swung drums, vinyl crackle, rain bed) and all sound effects
- Deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`

## Code map
| File | What it does |
| --- | --- |
| `src/config.ts` | **All the tuning**: layers, HP and loot curves, upgrade costs and caps, seasons, the skill tree |
| `src/game.ts` | Pure simulation (no DOM). Emits events like `drip`, `hit`, `break`, `rowClear`, `bolt` |
| `src/render.ts` | Pixel renderer and effects: impact frames, shattering chunks, shake, rings, loot motes, combo counter |
| `src/audio.ts` | Tone.js music and sfx, driven by the game's events |
| `src/ui.ts` | DOM panels: upgrades, skill tree, stats, Clear Skies |
| `scripts/sim.ts` | Headless pacing sim: a bot plays the real game and prints how long each season takes |

## Progression
- Upgrades are **capped per season**.
- Reaching the season goal depth unlocks **Clear Skies**: upgrade levels are halved, every cap rises, depth resets and you earn **rainbow shards**. Digging deeper before you clear earns more shards.
- Shards go into a 4-branch **skill tree** (Rain, Storm, Earth, Calm). Each branch ends in a capstone and an endless repeatable node.

## Develop
```bash
npm install
npm run dev        # local dev server
npm run sim -- 10  # simulate 10 hours of play and print season pacing
npm run build
```
The **Stats** tab has a tinker panel (free drops and shards, +20 depth, start a storm, speed 3×/10×). `window.game` is exposed in the console.
