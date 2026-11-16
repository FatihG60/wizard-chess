# Wizard Chess — 3D Sanctum

An interactive 3D Gothic Sanctum Wizard's Chess web application built with Three.js, chess.js, TypeScript, and procedural Web Audio synthesis, inspired by the Google Antigravity / Gemini 4 Argon showcase.

*(TR)* Three.js, chess.js, TypeScript ve prosedurel Web Audio sentezi ile gelistirilmis, Google Antigravity / Gemini 4 Argon vitrininden esinlenen etkilesimli 3D Gotik Tapinak (Wizard's Chess) satranc uygulamasi.

---

## Features / Ozellikler

- **Gothic Sanctum 3D Scene**: Procedural marble checkerboard, raised gold bezel, cracked obsidian outer border with etched Elder Futhark runes, stained-glass lancet windows, stone columns, floating dust motes, flickering wrought-iron braziers, and `RoomEnvironment` PMREM IBL lighting.
- **6 Articulated Medieval Chess Archetypes**: Sculpted Pawn (Footman), Rook (Battlement Keep), Knight (Armored Warhorse & Lancer), Bishop (Battle Prelate), Queen (Warrior Sovereign), and King (High Monarch) in Polished Ivory / Jet Obsidian with Brushed Gold and Steel PBR materials.
- **Wizard's Chess Combat & Shatter Physics**: Per-archetype attack animations, knight arched leaps, dynamic Battle Camera swoops, camera shake, Voronoi stone/gold debris shards with floor bounce, volumetric smoke particles, and checkmate King defeat animation.
- **Chess Engine & AI**: Full FIDE rule enforcement via `chess.js` (castling, en passant, promotion, check/checkmate, stalemate, threefold repetition, undo with persistent 3D piece IDs) plus an async Alpha-Beta AI (`Novice`, `Adept`, `Grandmaster`) with iterative deepening, transposition table, MVV-LVA move ordering, tapered Middlegame/Endgame Piece-Square Tables, and quiescence search.
- **Sanctum HUD & Procedural Audio**: Obsidian glassmorphic HUD (`Cinzel` + `Inter`), Sanctum Lobby (mode, AI difficulty, side selection, camera presets, notation input, tactical FEN presets, move history & undo), Pawn Promotion picker, Sanctum Judgment modal, and zero-asset Web Audio sound effects.

---

## Architecture / Mimari

```text
wizard-chess/
├── index.html                   # App shell, Google Fonts (Cinzel, Inter), #canvas-root & #hud-root
├── package.json                 # Dependencies and npm scripts
├── tsconfig.json                # Strict TypeScript (ES2022, Bundler resolution, noEmit)
├── vite.config.ts               # Vite & Vitest configuration
└── src/
    ├── main.ts                  # Application bootstrap, Raycaster interaction, game loop & window.__WIZARD_CHESS__
    ├── types.ts                 # Shared domain types, constants, and square-to-world coordinate helpers
    ├── engine/
    │   ├── ChessController.ts   # chess.js rules wrapper, persistent piece IDs, castling/EP/promotion & undo
    │   ├── ChessAI.ts           # Non-blocking Alpha-Beta + Quiescence AI across 3 difficulty levels
    │   └── engine.test.ts       # Vitest unit test suite for rules, coordinates, undo, and AI
    ├── scene/
    │   ├── CathedralScene.ts    # Three.js Gothic Sanctum environment, board, braziers, IBL & OrbitControls
    │   └── CombatFX.ts          # Legal move highlights, check halo, Voronoi piece shatter & smoke particles
    ├── pieces/
    │   ├── PieceFactory.ts      # Procedural PBR textures & 6 articulated medieval piece archetypes
    │   └── PieceAnimator.ts     # Stone glide, knight leap, per-archetype attack choreography & idle sway
    └── ui/
        ├── HudOverlay.ts        # Sanctum HUD, Lobby modal, Promotion picker, and Judgment modal
        ├── SoundFX.ts           # Procedural Web Audio API sound synthesizer
        └── styles.css           # Obsidian & gold glassmorphic UI styles
```

---

## Tech Stack / Teknoloji Yigini

- **3D Rendering**: Three.js (`WebGLRenderer`, `ACESFilmicToneMapping`, `PMREMGenerator` + `RoomEnvironment`, `OrbitControls`)
- **Chess Logic & AI**: `chess.js` + custom Alpha-Beta / Quiescence search (`ChessAI`)
- **Language & Tooling**: TypeScript, Vite, Vitest
- **Audio**: Procedural Web Audio API (`AudioContext` synthesis in `SoundFX.ts`, no external audio assets)

---

## Setup & Commands / Kurulum ve Komutlar

### English

```bash
# 1. Install dependencies
npm install

# 2. Start local development server
npm run dev

# 3. Type-check and create production build
npm run build

# 4. Preview production build locally
npm run preview

# 5. Run unit tests
npm test
```

### Turkce

```bash
# 1. Bagimliliklari yukle
npm install

# 2. Yerel gelistirme sunucusunu baslat
npm run dev

# 3. Tip denetimi yap ve uretim derlemesi (dist/) olustur
npm run build

# 4. Uretim derlemesini yerelde onizle
npm run preview

# 5. Birim testlerini calistir
npm test
```

---

## Controls / Kontroller

- **Select / Move Piece**: Click a piece to inspect legal moves, then click a highlighted destination square — or drag and drop a piece directly onto a valid square.
- **Camera**: Drag empty space or right-click drag to orbit, scroll wheel to zoom, or switch between **Sanctum Orbit** (`player`) and **Tactical Top-Down** (`top-down`) via the top-right bar or Lobby.
- **Sanctum Lobby**: Configure Single Player vs AI (`Novice`, `Adept`, `Grandmaster`) or `Pass & Play`, flip sides, enter algebraic/coordinate moves directly, load tactical presets, or undo the last move.
