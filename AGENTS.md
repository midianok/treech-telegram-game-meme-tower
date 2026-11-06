# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Vite dev server on 0.0.0.0 (network-accessible), Saturn API is mocked
npm run build    # TypeScript type-check + Vite production build
npm run preview  # Preview production build locally
```

No test suite exists. Type checking via `tsc` runs as part of `npm run build`.

## Architecture

**Мемный трич (Meme Tower)** is a Telegram Web App isometric Stack-style game built with three.js (render),
Rapier (`@dimforge/rapier3d-compat`, physics), TypeScript and Vite. Technically it mirrors
`treech-telegram-game-namorevo-gore` (Telegram integration, Saturn API client, logger, i18n, mock plugin, GH Pages),
but the engine is three.js + Rapier instead of Phaser because the game is 3D.
Backend lives in `treech-telegram-bot` (`MemeTowerController`, `MemeTowerOperation`, `meme_tower_scores` table).

### Entry Point Flow

1. `index.html` → `src/main.ts`: i18n (Russian), `initTelegram()`, `MemeTowerGame.boot()`
2. `MemeTowerGame.boot()` initialises Rapier and preloads memes (progress bar on `#loading-screen`), then starts the loop
3. `MemeTowerGame` mirrors `FlappyScene`: round creation, start, place, game over, score sync with the API

### Key modules

| Module | Location | Responsibility |
|---|---|---|
| `MemeTowerGame` | `src/game/MemeTowerGame.ts` | Orchestrator, session, best score/leaderboard sync, viewport |
| `Tower` | `src/game/tower/Tower.ts` | Stack mechanics: spawn at -5 → +5, cut/perfect, loss reasons, camera follow |
| `Box` | `src/game/entities/Box.ts` | Box mesh with top-face UVs inside the original 1.5×1.5 square, Rapier body |
| `PhysicsWorld` | `src/game/physics/PhysicsWorld.ts` | Rapier world, fixed 1/60 step, per-body gravity scale, floor |
| `GameView` | `src/game/render/GameView.ts` | Renderer, isometric orthographic camera (100 px/unit) |
| `MemeLibrary` | `src/game/memes/MemeLibrary.ts` | Memes from `src/assets/memes` (image / gif / video), placeholders, playback only for visible memes |
| `memeSources` | `src/game/memes/memeSources.ts` | Image, animated GIF (gifuct-js, frame-by-frame), video (`VideoTexture`) memes |
| `GameHud` | `src/game/ui/GameHud.ts` | DOM HUD: score, best score, start/game-over screens, leaderboard |
| `difficulty` | `src/game/difficulty.ts` | Box speed 5.5 → +0.35 every 3 boxes (max 9.5) |
| `CFG` | `src/game/constants.ts` | Mechanics/physics/camera constants |

### Backend API

`src/api/memeTower.ts` — `POST /api/meme-tower/score`, `GET /api/meme-tower/score/{userId}?chatId=`,
`GET /api/meme-tower/leaderboard?chatId=&limit=10`; `X-Telegram-Init-Data` header via `src/api.ts`.
Logs go to `POST /api/logs` (`src/api/logger.ts`, source `meme-tower`). Dev mock: `vite.memeTowerApiMock.ts`.
