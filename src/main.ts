import * as THREE from 'three';
import { ChessAI } from './engine/ChessAI';
import { ChessController } from './engine/ChessController';
import { PieceAnimator } from './pieces/PieceAnimator';
import { PieceFactory } from './pieces/PieceFactory';
import { CathedralScene } from './scene/CathedralScene';
import { CombatFX } from './scene/CombatFX';
import { THEMES } from './themes';
import {
  SQUARE_SIZE,
  squareToWorld,
  type ArticulatedPiece,
  type CameraPreset,
  type GameSettings,
  type GameSnapshot,
  type LegalMoveOption,
  type PieceType,
  type Square,
  type ThemeId,
} from './types';
import { HudOverlay } from './ui/HudOverlay';
import { MusicEngine } from './ui/MusicEngine';
import { SoundFX } from './ui/SoundFX';

export interface WizardChessState {
  snapshot: GameSnapshot;
  settings: GameSettings;
  pieceMeshCount: number;
  activeDebrisCount: number;
  isAnimating: boolean;
  aiThinking: boolean;
  usingBlenderModels: boolean;
}

export interface WizardChessAPI {
  getState: () => WizardChessState;
  playMove: (from: Square, to: Square, promotion?: PieceType) => Promise<boolean>;
  triggerAIMove: () => Promise<boolean>;
  newGame: () => void;
  loadFen: (fen: string) => void;
  setCameraPreset: (preset: CameraPreset) => void;
  setTheme: (theme: ThemeId) => Promise<void>;
}

declare global {
  interface Window {
    __WIZARD_CHESS__?: WizardChessAPI;
  }
}

interface PointerInteractionState {
  pointerId: number;
  startX: number;
  startY: number;
  isOrbiting: boolean;
  dragPiece: ArticulatedPiece | null;
  dragFromSquare: Square | null;
  isDraggingPiece: boolean;
  wasAlreadySelected: boolean;
}

type RaycastTargetHit =
  | { kind: 'piece'; pieceId: string; square: Square }
  | { kind: 'square'; square: Square };

const DRAG_THRESHOLD_PX = 6;
const BOARD_DRAG_LIMIT = SQUARE_SIZE * 4.1;

function worldToSquare(x: number, z: number): Square | null {
  const fileIndex = Math.round(x / SQUARE_SIZE + 3.5);
  const rankNumber = Math.round(4.5 - z / SQUARE_SIZE);
  if (fileIndex < 0 || fileIndex > 7 || rankNumber < 1 || rankNumber > 8) {
    return null;
  }
  return `${String.fromCharCode(97 + fileIndex)}${rankNumber}`;
}

function findPieceIdFromObject(obj: THREE.Object3D): string | null {
  let current: THREE.Object3D | null = obj;
  while (current) {
    if (typeof current.userData?.pieceId === 'string') {
      return current.userData.pieceId;
    }
    current = current.parent;
  }
  return null;
}

async function bootstrap(): Promise<void> {
  const rawCanvasRoot = document.getElementById('canvas-root');
  const rawHudRoot = document.getElementById('hud-root');
  if (!rawCanvasRoot || !rawHudRoot) {
    throw new Error('Missing #canvas-root or #hud-root mount element');
  }
  const canvasRoot: HTMLElement = rawCanvasRoot;
  const hudRoot: HTMLElement = rawHudRoot;

  let settings: GameSettings = {
    mode: 'ai',
    playerColor: 'w',
    difficulty: 'adept',
    cameraPreset: 'player',
    battleCam: true,
    soundEnabled: true,
    theme: 'gothic',
    pieceStyle: 'theme-default',
    musicEnabled: true,
    musicSource: 'auto',
  };

  let isAnimating = false;
  let aiThinking = false;
  let matchEpoch = 0;
  let themeSwitchEpoch = 0;

  let selectedSquare: Square | null = null;
  let selectedLegalMoves: LegalMoveOption[] = [];
  let activePointer: PointerInteractionState | null = null;
  let lastDebrisCount = -1;

  const piecesMap = new Map<string, ArticulatedPiece>();
  const capturedPiecesMap = new Map<string, ArticulatedPiece>();
  const TROPHY_SORT_WEIGHT: Record<PieceType, number> = {
    q: 0,
    r: 1,
    b: 2,
    n: 3,
    p: 4,
    k: 5,
  };
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const planeHit = new THREE.Vector3();

  // Declare mutable callbacks bound below after scene/controller instantiation
  const soundFX = new SoundFX(settings.soundEnabled);
  const musicEngine = new MusicEngine(
    settings.theme,
    settings.musicEnabled,
    settings.soundEnabled,
    settings.musicSource,
  );
  const hud = new HudOverlay(hudRoot, settings, {
    onNewGame: () => startNewGame(),
    onFlipSide: () => flipPlayerSide(),
    onRequestAIMove: () => {
      void triggerAITurnInternal();
    },
    onChangeSettings: (patch) => applySettingsChange(patch),
    onUndo: () => undoLastMove(),
    onLoadPresetFen: (fen) => loadFenPosition(fen),
    onSubmitMove: (notation) => submitMoveNotation(notation),
  });

  hud.setLoadingProgress(15, 'Conjuring Gothic Sanctum...');
  const cathedral = new CathedralScene(canvasRoot);

  hud.setLoadingProgress(35, 'Igniting Braziers & Combat Runes...');
  const combatFX = new CombatFX(cathedral.scene);
  const pieceFactory = new PieceFactory();
  pieceFactory.setPieceStyle(settings.pieceStyle);
  await pieceFactory.preload((pct, label) => {
    hud.setLoadingProgress(40 + Math.round(pct * 0.35), label);
  });
  const animator = new PieceAnimator();
  const controller = new ChessController();
  const chessAI = new ChessAI();

  const canvas = cathedral.renderer.domElement;
  const boardSquareMeshes = Array.from(cathedral.boardSquares.values());

  function syncDomTelemetry(snapshot = controller.getSnapshot()): void {
    const debrisCount = combatFX.getActiveDebrisCount();
    lastDebrisCount = debrisCount;
    canvasRoot.setAttribute('data-fen', snapshot.fen);
    canvasRoot.setAttribute('data-turn', snapshot.turn);
    canvasRoot.setAttribute('data-piece-count', String(piecesMap.size));
    canvasRoot.setAttribute('data-debris-count', String(debrisCount));
    canvasRoot.setAttribute('data-selected-square', selectedSquare ?? '');
    canvasRoot.setAttribute('data-checkmate', String(snapshot.isCheckmate));
    canvasRoot.setAttribute('data-blender-models', String(pieceFactory.isUsingBlenderModels(settings.theme)));
    canvasRoot.setAttribute('data-theme', settings.theme);
  }

  function syncCheckedAndAudioState(snapshot = controller.getSnapshot()): void {
    const checkedKing = snapshot.checkedKingSquare
      ? snapshot.pieces.find((p) => p.square === snapshot.checkedKingSquare)
      : undefined;
    animator.setCheckedKing(checkedKing?.id ?? null);
    musicEngine.setCheckState(snapshot.inCheck && !snapshot.isCheckmate);
  }

  function clearSelection(): void {
    selectedSquare = null;
    selectedLegalMoves = [];
    animator.setSelectedPiece(null);
    combatFX.clearHighlights();
    syncDomTelemetry();
  }

  function isHumanTurn(): boolean {
    if (isAnimating || aiThinking) return false;
    const snap = controller.getSnapshot();
    if (snap.isGameOver) return false;
    return settings.mode === 'pass-and-play' || snap.turn === settings.playerColor;
  }

  function syncBoardMeshes(snapshot: GameSnapshot, reportLoadingProgress = false): void {
    const activeIds = new Set(snapshot.pieces.map((p) => p.id));

    for (const [id, existing] of piecesMap.entries()) {
      if (!activeIds.has(id)) {
        cathedral.scene.remove(existing.root);
        piecesMap.delete(id);
      }
    }

    const total = snapshot.pieces.length || 1;
    snapshot.pieces.forEach((bp, idx) => {
      const existing = piecesMap.get(bp.id);
      if (existing && (existing.type !== bp.type || existing.color !== bp.color)) {
        cathedral.scene.remove(existing.root);
        piecesMap.delete(bp.id);
      }

      let piece = piecesMap.get(bp.id);
      if (!piece) {
        piece = pieceFactory.createPiece(bp.id, bp.type, bp.color, settings.theme);
        cathedral.scene.add(piece.root);
        piecesMap.set(bp.id, piece);
      }

      animator.placeAtSquare(piece, bp.square);

      if (reportLoadingProgress) {
        const pct = 75 + Math.round(((idx + 1) / total) * 20);
        hud.setLoadingProgress(pct, 'Deploying Ivory & Obsidian Legions...');
      }
    });

    syncCapturedTrophies(snapshot);
  }

  function syncCapturedTrophies(snapshot: GameSnapshot): void {
    for (const trophy of capturedPiecesMap.values()) {
      cathedral.scene.remove(trophy.root);
    }
    capturedPiecesMap.clear();

    const deploySide = (capColor: 'w' | 'b', list: PieceType[]) => {
      const sorted = [...list].sort(
        (a, b) => TROPHY_SORT_WEIGHT[a] - TROPHY_SORT_WEIGHT[b],
      );
      const count = Math.min(15, sorted.length);
      for (let idx = 0; idx < count; idx++) {
        const type = sorted[idx];
        const slot = cathedral.getCapturedSlotWorld(capColor, idx);
        const key = `trophy:${capColor}:${idx}:${type}`;
        const trophy = pieceFactory.createPiece(key, type, capColor, settings.theme);
        trophy.root.traverse((obj) => {
          delete obj.userData.pieceId;
        });
        trophy.root.scale.setScalar(0.46);
        trophy.root.position.set(slot.x, slot.y, slot.z);
        trophy.root.rotation.set(0, slot.rotY, 0);
        trophy.body.rotation.x = 0.08;
        cathedral.scene.add(trophy.root);
        capturedPiecesMap.set(key, trophy);
      }
    };

    deploySide('w', snapshot.capturedPieces.white);
    deploySide('b', snapshot.capturedPieces.black);
  }

  function selectSquare(square: Square): void {
    const moves = controller.getLegalMoves(square);
    if (moves.length === 0) {
      clearSelection();
      return;
    }
    const pieceAtSquare = controller.getSnapshot().pieces.find((p) => p.square === square);
    selectedSquare = square;
    selectedLegalMoves = moves;
    animator.setSelectedPiece(pieceAtSquare?.id ?? null);
    combatFX.showLegalMoves(square, moves);
    soundFX.playSelect();
    syncDomTelemetry();
  }

  function setRaycasterFromClient(clientX: number, clientY: number): boolean {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, cathedral.camera);
    return true;
  }

  function pickBoardOrPiece(clientX: number, clientY: number): RaycastTargetHit | null {
    if (!setRaycasterFromClient(clientX, clientY)) return null;

    const snap = controller.getSnapshot();
    const pieceSquareById = new Map<string, Square>();
    for (const bp of snap.pieces) {
      pieceSquareById.set(bp.id, bp.square);
    }

    const pieceRoots = Array.from(piecesMap.values()).map((p) => p.root);
    const hits = raycaster.intersectObjects([...pieceRoots, ...boardSquareMeshes], true);

    for (const hit of hits) {
      const pieceId = findPieceIdFromObject(hit.object);
      if (pieceId) {
        const sq = pieceSquareById.get(pieceId);
        if (sq) {
          return { kind: 'piece', pieceId, square: sq };
        }
      }
      const square = hit.object.userData?.square;
      if (typeof square === 'string') {
        return { kind: 'square', square };
      }
    }

    return null;
  }

  function pickBoardSquareOnly(clientX: number, clientY: number): Square | null {
    if (!setRaycasterFromClient(clientX, clientY)) return null;

    const hits = raycaster.intersectObjects(boardSquareMeshes, false);
    const square = hits[0]?.object.userData?.square;
    if (typeof square === 'string') {
      return square;
    }

    if (raycaster.ray.intersectPlane(boardPlane, planeHit)) {
      return worldToSquare(planeHit.x, planeHit.z);
    }
    return null;
  }

  async function executeMove(
    from: Square,
    to: Square,
    promotion?: PieceType,
  ): Promise<boolean> {
    if (isAnimating) {
      return false;
    }

    const legalOption = controller.getLegalMoves(from).find((m) => m.to === to);
    if (!legalOption) {
      return false;
    }

    const epoch = matchEpoch;
    const preSnap = controller.getSnapshot();

    if (
      promotion &&
      promotion !== 'q' &&
      promotion !== 'r' &&
      promotion !== 'b' &&
      promotion !== 'n'
    ) {
      return false;
    }

    isAnimating = true;
    clearSelection();

    let chosenPromotion: PieceType | undefined = promotion;
    if (legalOption.isPromotion && !chosenPromotion) {
      const pendingPiece = controller
        .getSnapshot()
        .pieces.find((p) => p.square === from);
      const pendingMesh = pendingPiece ? piecesMap.get(pendingPiece.id) : undefined;
      if (pendingMesh) {
        animator.placeAtSquare(pendingMesh, from);
      }
      chosenPromotion = await hud.promptPromotion(preSnap.turn);
      if (epoch !== matchEpoch) {
        return false;
      }
    }

    const result = controller.makeMove(from, to, chosenPromotion);
    if (!result) {
      if (epoch === matchEpoch) {
        isAnimating = false;
      }
      return false;
    }

    const snapshot = controller.getSnapshot();
    const attacker = piecesMap.get(result.pieceId);
    const victim = result.capturedPieceId
      ? piecesMap.get(result.capturedPieceId)
      : undefined;

    hud.updateFromSnapshot(snapshot, settings, aiThinking);
    syncDomTelemetry(snapshot);

    try {
      if (attacker && victim) {
        const attackerWorld = squareToWorld(result.from);
        const capturedSq = result.capturedSquare ?? result.to;
        const targetWorld = squareToWorld(capturedSq);

        if (settings.battleCam) {
          await cathedral.focusBattleCamera(attackerWorld, targetWorld);
          if (epoch !== matchEpoch) return false;
        }

        await animator.animateAttack(
          attacker,
          victim,
          result.from,
          result.to,
          capturedSq,
          () => {
            combatFX.shatterPiece(targetWorld, victim.color, attackerWorld, victim);
            victim.root.visible = false;
            cathedral.triggerCameraShake(0.14, 280);
            soundFX.playCapture();
          },
          (atkType, atkPos, tgtPos) => {
            combatFX.spawnAttackVFX(atkType, atkPos, tgtPos);
          },
        );
        if (epoch !== matchEpoch) return false;

        cathedral.scene.remove(victim.root);
        piecesMap.delete(victim.id);
        syncCapturedTrophies(snapshot);
        syncDomTelemetry(snapshot);

        if (settings.battleCam) {
          await cathedral.restoreCamera(settings.cameraPreset, settings.playerColor);
          if (epoch !== matchEpoch) return false;
        }
      } else if (attacker) {
        const targetWorld = squareToWorld(result.to);
        if (result.rookCastleMove) {
          soundFX.playCastle();
          const rook = piecesMap.get(result.rookCastleMove.rookId);
          if (rook) {
            await Promise.all([
              animator.animateMove(attacker, result.from, result.to, false, () => {
                combatFX.spawnLandingPulse(targetWorld);
              }),
              animator.animateMove(
                rook,
                result.rookCastleMove.from,
                result.rookCastleMove.to,
                false,
              ),
            ]);
          } else {
            await animator.animateMove(attacker, result.from, result.to, false, () => {
              combatFX.spawnLandingPulse(targetWorld);
            });
          }
        } else {
          soundFX.playMove();
          await animator.animateMove(
            attacker,
            result.from,
            result.to,
            result.pieceType === 'n',
            () => {
              combatFX.spawnLandingPulse(targetWorld);
            },
          );
        }
        if (epoch !== matchEpoch) return false;
      }

      if (result.promotedTo) {
        const oldPawn = piecesMap.get(result.pieceId);
        if (oldPawn) {
          cathedral.scene.remove(oldPawn.root);
        }
        const promotedPiece = pieceFactory.createPiece(
          result.pieceId,
          result.promotedTo,
          result.color,
          settings.theme,
        );
        cathedral.scene.add(promotedPiece.root);
        piecesMap.set(result.pieceId, promotedPiece);
        animator.placeAtSquare(promotedPiece, result.to);
        combatFX.spawnLandingPulse(squareToWorld(result.to));
        soundFX.playPromote();
      }

      combatFX.setCheckIndicator(snapshot.checkedKingSquare, snapshot.isCheckmate);
      syncCheckedAndAudioState(snapshot);

      if (snapshot.isCheckmate) {
        soundFX.playCheckmate();
        const winnerColor = snapshot.turn === 'w' ? 'b' : 'w';
        animator.animateVictorySalute(piecesMap.values(), winnerColor);
        const defeatedKingData = snapshot.pieces.find(
          (p) => p.type === 'k' && p.color === snapshot.turn,
        );
        const defeatedKing = defeatedKingData
          ? piecesMap.get(defeatedKingData.id)
          : undefined;
        if (defeatedKing) {
          await animator.animateCheckmateDefeat(defeatedKing);
          if (epoch !== matchEpoch) return false;
        }
        hud.showJudgmentModal(snapshot);
      } else if (snapshot.isStalemate || snapshot.isDraw) {
        hud.showJudgmentModal(snapshot);
      } else if (snapshot.inCheck) {
        soundFX.playCheck();
      }

      if (epoch !== matchEpoch) return false;
      isAnimating = false;

      const shouldTriggerAI =
        !snapshot.isGameOver &&
        settings.mode === 'ai' &&
        snapshot.turn !== settings.playerColor;

      if (shouldTriggerAI) {
        syncDomTelemetry(snapshot);
        void triggerAITurnInternal();
      } else {
        hud.updateFromSnapshot(snapshot, settings, aiThinking);
        syncDomTelemetry(snapshot);
      }

      return true;
    } finally {
      if (epoch === matchEpoch) {
        isAnimating = false;
      }
    }
  }

  async function triggerAITurnInternal(): Promise<boolean> {
    const snap = controller.getSnapshot();
    if (isAnimating || aiThinking || snap.isGameOver) {
      return false;
    }

    const epoch = matchEpoch;
    aiThinking = true;
    hud.updateFromSnapshot(snap, settings, aiThinking);

    let bestMove: { from: Square; to: Square; promotion?: PieceType } | null = null;
    try {
      bestMove = await chessAI.computeBestMove(snap.fen, settings.difficulty);
    } finally {
      if (epoch === matchEpoch) {
        aiThinking = false;
      }
    }

    if (epoch !== matchEpoch) {
      return false;
    }

    const currentSnap = controller.getSnapshot();
    hud.updateFromSnapshot(currentSnap, settings, aiThinking);

    if (!bestMove || currentSnap.isGameOver) {
      return false;
    }

    return executeMove(bestMove.from, bestMove.to, bestMove.promotion);
  }

  function submitMoveNotation(notation: string): void {
    const trimmed = notation.trim();
    if (!trimmed || isAnimating || aiThinking) {
      return;
    }

    const coordMatch = /^([a-h][1-8])[- ]?([a-h][1-8])([qrbn])?$/i.exec(trimmed);
    if (coordMatch) {
      const from = coordMatch[1].toLowerCase();
      const to = coordMatch[2].toLowerCase();
      const promo = coordMatch[3]?.toLowerCase() as PieceType | undefined;
      const legal = controller.getLegalMoves(from).find((m) => m.to === to);
      if (legal) {
        void executeMove(legal.from, legal.to, promo);
      }
      return;
    }

    const legalMoves = controller.getAllLegalMoves();
    const stripCheck = (san: string): string => san.replace(/[+#]+$/, '');
    const stripPromoAndCheck = (san: string): string =>
      stripCheck(san).replace(/=[qrbnQRBN]$/, '');

    const strippedInput = stripCheck(trimmed);
    const promoSuffixMatch = /=([qrbnQRBN])$/.exec(strippedInput);
    const explicitPromo = promoSuffixMatch
      ? (promoSuffixMatch[1].toLowerCase() as PieceType)
      : undefined;

    const match =
      legalMoves.find((m) => m.san === trimmed) ??
      legalMoves.find((m) => stripCheck(m.san) === strippedInput) ??
      legalMoves.find(
        (m) => stripCheck(m.san).toLowerCase() === strippedInput.toLowerCase(),
      ) ??
      (explicitPromo
        ? legalMoves.find(
            (m) => stripPromoAndCheck(m.san) === stripPromoAndCheck(trimmed),
          ) ??
          legalMoves.find(
            (m) =>
              stripPromoAndCheck(m.san).toLowerCase() ===
              stripPromoAndCheck(trimmed).toLowerCase(),
          )
        : undefined);

    if (match) {
      void executeMove(match.from, match.to, explicitPromo);
    }
  }

  function resetInteractionFlags(): void {
    animator.setDraggingPiece(null);
    animator.setHoveredPiece(null);
    if (activePointer?.dragPiece && activePointer.dragFromSquare) {
      animator.placeAtSquare(activePointer.dragPiece, activePointer.dragFromSquare);
    }
    activePointer = null;
    canvas.style.cursor = '';
    clearSelection();
  }

  async function applyThemeInternal(themeId: ThemeId, syncRealm = true): Promise<void> {
    const myEpoch = ++themeSwitchEpoch;
    settings = { ...settings, theme: themeId };
    const cfg = THEMES[themeId];
    const needsDownload = !pieceFactory.isUsingBlenderModels(themeId);

    try {
      if (needsDownload) {
        hud.setLoadingProgress(25, cfg.loadingLabel);
      }

      await pieceFactory.loadThemeModels(themeId, (pct, label) => {
        if (myEpoch === themeSwitchEpoch && needsDownload) {
          hud.setLoadingProgress(25 + Math.round(pct * 0.65), label);
        }
      });

      if (myEpoch !== themeSwitchEpoch || settings.theme !== themeId) return;

      if (syncRealm) {
        cathedral.setTheme(themeId);
        combatFX.setTheme(themeId);
        musicEngine.setTheme(themeId);
      }

      // Rebuild all living pieces in their current FEN squares using the new realm's 3D army
      for (const [id, existing] of piecesMap.entries()) {
        cathedral.scene.remove(existing.root);
        piecesMap.delete(id);
      }

      const snapshot = controller.getSnapshot();
      syncBoardMeshes(snapshot);
      combatFX.setCheckIndicator(snapshot.checkedKingSquare, snapshot.isCheckmate);
      syncCheckedAndAudioState(snapshot);

      if (selectedSquare) {
        const selPiece = snapshot.pieces.find((p) => p.square === selectedSquare);
        if (selPiece) {
          animator.setSelectedPiece(selPiece.id);
          combatFX.showLegalMoves(selectedSquare, selectedLegalMoves);
        }
      }

      if (snapshot.isCheckmate && snapshot.winner && snapshot.winner !== 'draw') {
        animator.animateVictorySalute(piecesMap.values(), snapshot.winner);
      }

      hud.updateFromSnapshot(snapshot, settings, aiThinking);
      syncDomTelemetry(snapshot);
    } catch (err) {
      console.error('[WizardChess] Theme switch failed:', err);
    } finally {
      if (myEpoch === themeSwitchEpoch) {
        if (needsDownload) {
          hud.setLoadingProgress(100, `${cfg.name} Ready`);
          window.setTimeout(() => hud.hideLoading(), 120);
        } else {
          hud.hideLoading();
        }
      }
    }
  }

  function startNewGame(): void {
    matchEpoch += 1;
    isAnimating = false;
    aiThinking = false;
    resetInteractionFlags();
    combatFX.clearDebris();
    hud.hideJudgmentModal();

    const snapshot = controller.reset();
    syncBoardMeshes(snapshot);
    combatFX.setCheckIndicator(snapshot.checkedKingSquare, snapshot.isCheckmate);
    syncCheckedAndAudioState(snapshot);
    cathedral.setCameraPreset(settings.cameraPreset, settings.playerColor);
    hud.updateFromSnapshot(snapshot, settings, aiThinking);
    syncDomTelemetry(snapshot);

    if (
      !snapshot.isGameOver &&
      settings.mode === 'ai' &&
      snapshot.turn !== settings.playerColor
    ) {
      void triggerAITurnInternal();
    }
  }

  function loadFenPosition(fen: string): void {
    const snapshot = controller.reset(fen);
    matchEpoch += 1;
    isAnimating = false;
    aiThinking = false;
    resetInteractionFlags();
    combatFX.clearDebris();
    hud.hideJudgmentModal();

    syncBoardMeshes(snapshot);
    combatFX.setCheckIndicator(snapshot.checkedKingSquare, snapshot.isCheckmate);
    syncCheckedAndAudioState(snapshot);
    cathedral.setCameraPreset(settings.cameraPreset, settings.playerColor);
    hud.updateFromSnapshot(snapshot, settings, aiThinking);
    syncDomTelemetry(snapshot);

    if (snapshot.isGameOver) {
      if (snapshot.isCheckmate && snapshot.winner && snapshot.winner !== 'draw') {
        animator.animateVictorySalute(piecesMap.values(), snapshot.winner);
      }
      hud.showJudgmentModal(snapshot);
    }
  }

  function flipPlayerSide(): void {
    if (isAnimating) return;

    if (aiThinking) {
      matchEpoch += 1;
      aiThinking = false;
    }
    resetInteractionFlags();

    settings = {
      ...settings,
      playerColor: settings.playerColor === 'w' ? 'b' : 'w',
    };
    cathedral.setCameraPreset(settings.cameraPreset, settings.playerColor);

    const snapshot = controller.getSnapshot();
    hud.updateFromSnapshot(snapshot, settings, aiThinking);
    syncDomTelemetry(snapshot);

    if (
      !snapshot.isGameOver &&
      settings.mode === 'ai' &&
      snapshot.turn !== settings.playerColor
    ) {
      void triggerAITurnInternal();
    }
  }

  function applySettingsChange(patch: Partial<GameSettings>): void {
    const prev = settings;
    settings = { ...settings, ...patch };

    if (patch.soundEnabled !== undefined) {
      soundFX.setEnabled(settings.soundEnabled);
      musicEngine.setMasterSoundEnabled(settings.soundEnabled);
    }
    if (patch.musicEnabled !== undefined) {
      musicEngine.setMusicEnabled(settings.musicEnabled);
    }
    if (patch.musicSource !== undefined) {
      musicEngine.setMusicSource(settings.musicSource);
    }

    const themeChanged = patch.theme !== undefined && patch.theme !== prev.theme;
    const styleChanged =
      patch.pieceStyle !== undefined && patch.pieceStyle !== prev.pieceStyle;

    if (styleChanged) {
      pieceFactory.setPieceStyle(settings.pieceStyle);
    }

    if (themeChanged || styleChanged) {
      void applyThemeInternal(settings.theme, themeChanged);
    }

    const sideOrModeChanged =
      settings.playerColor !== prev.playerColor || settings.mode !== prev.mode;
    if (sideOrModeChanged && aiThinking) {
      matchEpoch += 1;
      aiThinking = false;
      clearSelection();
    }

    const cameraChanged =
      settings.cameraPreset !== prev.cameraPreset ||
      settings.playerColor !== prev.playerColor;
    if (cameraChanged && !isAnimating) {
      cathedral.setCameraPreset(settings.cameraPreset, settings.playerColor);
    }

    const snapshot = controller.getSnapshot();
    hud.updateFromSnapshot(snapshot, settings, aiThinking);

    if (
      !isAnimating &&
      !aiThinking &&
      !snapshot.isGameOver &&
      settings.mode === 'ai' &&
      snapshot.turn !== settings.playerColor
    ) {
      void triggerAITurnInternal();
    }
  }

  function undoLastMove(): void {
    if (isAnimating) return;

    if (aiThinking) {
      matchEpoch += 1;
      aiThinking = false;
    }
    resetInteractionFlags();
    combatFX.clearDebris();
    hud.hideJudgmentModal();

    const before = controller.getSnapshot();
    if (
      settings.mode === 'ai' &&
      before.turn === settings.playerColor &&
      before.moveHistory.length >= 2
    ) {
      controller.undoMove();
      controller.undoMove();
    } else {
      const undone = controller.undoMove();
      if (!undone) return;
    }

    const snapshot = controller.getSnapshot();
    syncBoardMeshes(snapshot);
    combatFX.setCheckIndicator(snapshot.checkedKingSquare, snapshot.isCheckmate);
    syncCheckedAndAudioState(snapshot);
    hud.updateFromSnapshot(snapshot, settings, aiThinking);
    syncDomTelemetry(snapshot);

    if (
      !snapshot.isGameOver &&
      settings.mode === 'ai' &&
      snapshot.turn !== settings.playerColor
    ) {
      void triggerAITurnInternal();
    }
  }

  window.addEventListener(
    'pointerdown',
    () => {
      soundFX.unlock();
      musicEngine.unlock();
    },
    { passive: true },
  );

  // Capture-phase pointerdown on #canvas-root intercepts friendly piece clicks/drags
  // BEFORE OrbitControls on the canvas can enter camera-rotation state.
  canvasRoot.addEventListener(
    'pointerdown',
    (e: PointerEvent) => {
      soundFX.unlock();
      musicEngine.unlock();
      if (e.target !== canvas || e.button !== 0 || activePointer !== null) {
        return;
      }

      if (isHumanTurn()) {
        const hit = pickBoardOrPiece(e.clientX, e.clientY);
        if (hit) {
          const snap = controller.getSnapshot();
          const bp =
            hit.kind === 'piece'
              ? snap.pieces.find((p) => p.id === hit.pieceId)
              : snap.pieces.find((p) => p.square === hit.square);
          if (bp && bp.color === snap.turn) {
            e.stopPropagation();

            const wasAlreadySelected = selectedSquare === bp.square;
            if (!wasAlreadySelected) {
              selectSquare(bp.square);
            }

            const pieceMesh = piecesMap.get(bp.id) ?? null;
            activePointer = {
              pointerId: e.pointerId,
              startX: e.clientX,
              startY: e.clientY,
              isOrbiting: false,
              dragPiece: pieceMesh,
              dragFromSquare: bp.square,
              isDraggingPiece: false,
              wasAlreadySelected,
            };
            canvas.style.cursor = 'grabbing';
            return;
          }
        }
      }

      activePointer = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        isOrbiting: true,
        dragPiece: null,
        dragFromSquare: null,
        isDraggingPiece: false,
        wasAlreadySelected: false,
      };
    },
    { capture: true },
  );

  window.addEventListener('pointermove', (e: PointerEvent) => {
    if (!activePointer) {
      if (e.target === canvas && isHumanTurn()) {
        const hover = pickBoardOrPiece(e.clientX, e.clientY);
        if (hover) {
          const snap = controller.getSnapshot();
          const bp =
            hover.kind === 'piece'
              ? snap.pieces.find((p) => p.id === hover.pieceId)
              : snap.pieces.find((p) => p.square === hover.square);
          if (bp && bp.color === snap.turn) {
            animator.setHoveredPiece(bp.id);
            canvas.style.cursor = 'grab';
            return;
          }
        }
        animator.setHoveredPiece(null);
        if (
          selectedSquare &&
          hover &&
          selectedLegalMoves.some((m) => m.to === hover.square)
        ) {
          canvas.style.cursor = 'pointer';
          return;
        }
        canvas.style.cursor = '';
      } else {
        animator.setHoveredPiece(null);
        if (canvas.style.cursor !== '') {
          canvas.style.cursor = '';
        }
      }
      return;
    }

    if (e.pointerId !== activePointer.pointerId) {
      return;
    }

    if (activePointer.isOrbiting || !activePointer.dragPiece || !activePointer.dragFromSquare) {
      return;
    }

    const dist = Math.hypot(
      e.clientX - activePointer.startX,
      e.clientY - activePointer.startY,
    );
    if (!activePointer.isDraggingPiece && dist > DRAG_THRESHOLD_PX) {
      activePointer.isDraggingPiece = true;
      animator.setDraggingPiece(activePointer.dragPiece.id);
    }

    if (activePointer.isDraggingPiece && setRaycasterFromClient(e.clientX, e.clientY)) {
      if (raycaster.ray.intersectPlane(boardPlane, planeHit)) {
        const clampedX = THREE.MathUtils.clamp(
          planeHit.x,
          -BOARD_DRAG_LIMIT,
          BOARD_DRAG_LIMIT,
        );
        const clampedZ = THREE.MathUtils.clamp(
          planeHit.z,
          -BOARD_DRAG_LIMIT,
          BOARD_DRAG_LIMIT,
        );
        activePointer.dragPiece.root.position.set(clampedX, 0.36, clampedZ);
      }
    }
  });

  const finishPointerInteraction = (e: PointerEvent, cancelled: boolean): void => {
    if (!activePointer || e.pointerId !== activePointer.pointerId) {
      return;
    }

    const state = activePointer;
    activePointer = null;
    animator.setDraggingPiece(null);
    canvas.style.cursor = '';

    if (cancelled) {
      if (state.dragPiece && state.dragFromSquare) {
        animator.placeAtSquare(state.dragPiece, state.dragFromSquare);
      }
      return;
    }

    if (state.dragPiece && state.dragFromSquare) {
      if (state.isDraggingPiece) {
        const dropSquare = pickBoardSquareOnly(e.clientX, e.clientY);
        const isLegalDrop =
          dropSquare !== null &&
          selectedLegalMoves.some((m) => m.to === dropSquare);

        if (isLegalDrop && dropSquare && isHumanTurn()) {
          void executeMove(state.dragFromSquare, dropSquare);
        } else {
          animator.placeAtSquare(state.dragPiece, state.dragFromSquare);
          if (dropSquare !== state.dragFromSquare) {
            clearSelection();
          }
        }
      } else if (state.wasAlreadySelected) {
        clearSelection();
      }
      return;
    }

    // Orbit-mode pointerup: ignore clicks if pointer moved significantly (OrbitControls drag)
    const dist = Math.hypot(e.clientX - state.startX, e.clientY - state.startY);
    if (dist > DRAG_THRESHOLD_PX || !isHumanTurn()) {
      return;
    }

    const hit = pickBoardOrPiece(e.clientX, e.clientY);
    const clickedSquare = hit ? hit.square : null;

    if (
      selectedSquare &&
      clickedSquare &&
      selectedLegalMoves.some((m) => m.to === clickedSquare)
    ) {
      void executeMove(selectedSquare, clickedSquare);
    } else {
      clearSelection();
    }
  };

  window.addEventListener('pointerup', (e: PointerEvent) => {
    finishPointerInteraction(e, false);
  });

  window.addEventListener('pointercancel', (e: PointerEvent) => {
    finishPointerInteraction(e, true);
  });

  window.addEventListener('blur', () => {
    animator.setDraggingPiece(null);
    animator.setHoveredPiece(null);
    if (activePointer?.dragPiece && activePointer.dragFromSquare) {
      animator.placeAtSquare(activePointer.dragPiece, activePointer.dragFromSquare);
    }
    activePointer = null;
    canvas.style.cursor = '';
  });

  // Initial board setup & loading progress
  try {
    const initialSnapshot = controller.getSnapshot();
    syncBoardMeshes(initialSnapshot, true);
    combatFX.setCheckIndicator(
      initialSnapshot.checkedKingSquare,
      initialSnapshot.isCheckmate,
    );
    syncCheckedAndAudioState(initialSnapshot);
    cathedral.setCameraPreset(settings.cameraPreset, settings.playerColor, true);
    hud.updateFromSnapshot(initialSnapshot, settings, aiThinking);
    syncDomTelemetry(initialSnapshot);
  } catch (err) {
    console.error('[WizardChess] Initial board setup error:', err);
  } finally {
    hud.setLoadingProgress(100, 'Sanctum Ready');
    // Brief transition after 100% progress so the loading bar completes smoothly before fading out
    window.setTimeout(() => {
      hud.hideLoading();
    }, 160);
  }

  window.__WIZARD_CHESS__ = {
    getState: () => ({
      snapshot: controller.getSnapshot(),
      settings: { ...settings },
      pieceMeshCount: piecesMap.size,
      activeDebrisCount: combatFX.getActiveDebrisCount(),
      isAnimating,
      aiThinking,
      usingBlenderModels: pieceFactory.isUsingBlenderModels(settings.theme),
    }),
    playMove: async (from: Square, to: Square, promotion?: PieceType) => {
      if (isAnimating || aiThinking) return false;
      return executeMove(from, to, promotion);
    },
    triggerAIMove: () => triggerAITurnInternal(),
    newGame: () => startNewGame(),
    loadFen: (fen: string) => loadFenPosition(fen),
    setCameraPreset: (preset: CameraPreset) => {
      settings = { ...settings, cameraPreset: preset };
      if (!isAnimating) {
        cathedral.setCameraPreset(preset, settings.playerColor);
      }
      hud.updateFromSnapshot(controller.getSnapshot(), settings, aiThinking);
    },
    setTheme: (theme: ThemeId) => applyThemeInternal(theme),
  };

  // Start render & simulation loop
  let lastTime = performance.now();
  const startTime = lastTime;

  const animate = (now: number): void => {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    const elapsed = (now - startTime) / 1000;

    cathedral.update(dt, elapsed);
    combatFX.update(dt);
    animator.updateIdle(piecesMap.values(), elapsed, dt);
    cathedral.render();

    const debrisCount = combatFX.getActiveDebrisCount();
    if (debrisCount !== lastDebrisCount) {
      lastDebrisCount = debrisCount;
      canvasRoot.setAttribute('data-debris-count', String(debrisCount));
    }
  };

  cathedral.render();
  requestAnimationFrame(animate);
}

void bootstrap();
