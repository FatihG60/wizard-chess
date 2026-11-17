import type * as THREE from 'three';

export type PieceColor = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Square = string; // 'a1' .. 'h8'
export type GameMode = 'ai' | 'pass-and-play';
export type AIDifficulty = 'novice' | 'adept' | 'grandmaster';
export type CameraPreset = 'player' | 'top-down';
export type ThemeId = 'gothic' | 'samurai' | 'pharaoh' | 'frost' | 'infernal' | 'astral';
export type PieceModelSet = 'sovereign' | 'crusader' | 'samurai' | 'pharaoh' | 'astral';
export type PieceStylePreference = 'theme-default' | PieceModelSet;
export type MusicSourceMode = 'auto' | 'theme-synth' | 'video-ost';

export const SQUARE_SIZE = 1.0;

export function squareToWorld(square: Square): { x: number; z: number } {
  const fileIndex = square.charCodeAt(0) - 97; // 'a'->0 .. 'h'->7
  const rankNumber = parseInt(square[1], 10);  // '1'->1 .. '8'->8
  return {
    x: (fileIndex - 3.5) * SQUARE_SIZE,
    z: (4.5 - rankNumber) * SQUARE_SIZE,
  };
}

export function isLightSquare(square: Square): boolean {
  const fileIndex = square.charCodeAt(0) - 97;
  const rankNumber = parseInt(square[1], 10);
  return (fileIndex + rankNumber) % 2 === 0; // a1(0+1=1)=dark, h1(7+1=8)=light
}

export interface BoardPiece {
  id: string;
  type: PieceType;
  color: PieceColor;
  square: Square;
}

export interface LegalMoveOption {
  from: Square;
  to: Square;
  san: string;
  isCapture: boolean;
  isPromotion: boolean;
  isCastling: boolean;
  isEnPassant: boolean;
}

export interface MoveExecutionResult {
  from: Square;
  to: Square;
  san: string;
  pieceId: string;
  pieceType: PieceType;
  promotedTo?: PieceType;
  color: PieceColor;
  capturedPieceId?: string;
  capturedPieceType?: PieceType;
  capturedSquare?: Square;
  rookCastleMove?: {
    rookId: string;
    from: Square;
    to: Square;
  };
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  fen: string;
}

export interface CapturedCounts {
  whiteCapturedByBlack: number;
  blackCapturedByWhite: number;
}

export interface CapturedPiecesList {
  white: PieceType[];
  black: PieceType[];
}

export interface LastMoveInfo {
  from: Square;
  to: Square;
  color: PieceColor;
  isCapture: boolean;
}

export interface GameSnapshot {
  fen: string;
  turn: PieceColor;
  inCheck: boolean;
  checkedKingSquare: Square | null;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  isGameOver: boolean;
  winner: PieceColor | 'draw' | null;
  pieces: BoardPiece[];
  moveHistory: string[];
  captured: CapturedCounts;
  capturedPieces: CapturedPiecesList;
  lastMove: LastMoveInfo | null;
}

export interface ArticulatedPiece {
  id: string;
  root: THREE.Group;
  body: THREE.Group;
  weaponArm: THREE.Group;
  shieldArm?: THREE.Group;
  head?: THREE.Group;
  type: PieceType;
  color: PieceColor;
}

export interface GameSettings {
  mode: GameMode;
  playerColor: PieceColor;
  difficulty: AIDifficulty;
  cameraPreset: CameraPreset;
  battleCam: boolean;
  soundEnabled: boolean;
  theme: ThemeId;
  pieceStyle: PieceStylePreference;
  musicEnabled: boolean;
  musicSource: MusicSourceMode;
}
