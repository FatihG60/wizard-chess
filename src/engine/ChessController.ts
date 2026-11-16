import { Chess, type Move, type Square as ChessSquare } from 'chess.js';
import type {
  BoardPiece,
  CapturedCounts,
  GameSnapshot,
  LegalMoveOption,
  MoveExecutionResult,
  PieceColor,
  PieceType,
  Square,
} from '../types';

const SQUARE_PATTERN = /^[a-h][1-8]$/;

const CASTLE_ROOK_MOVES: Record<string, { from: Square; to: Square }> = {
  'e1->g1': { from: 'h1', to: 'f1' },
  'e1->c1': { from: 'a1', to: 'd1' },
  'e8->g8': { from: 'h8', to: 'f8' },
  'e8->c8': { from: 'a8', to: 'd8' },
};

/**
 * Wraps chess.js to manage game rules, legal move queries, persistent 3D piece IDs,
 * castling/en-passant/promotion metadata, and undo history.
 */
export class ChessController {
  private chess: Chess;
  private squareToId: Map<Square, string> = new Map();
  private idSnapshots: Map<Square, string>[] = [];
  private generation = 1;

  constructor(initialFen?: string) {
    this.chess = initialFen ? new Chess(initialFen) : new Chess();
    this.initializePieceIds();
  }

  public reset(fen?: string): GameSnapshot {
    this.chess = fen ? new Chess(fen) : new Chess();
    this.generation += 1;
    this.idSnapshots = [];
    this.initializePieceIds();
    return this.getSnapshot();
  }

  public getFen(): string {
    return this.chess.fen();
  }

  public getSnapshot(): GameSnapshot {
    const turn = this.chess.turn() as PieceColor;
    const inCheck = this.chess.inCheck();
    const checkedKingSquare = inCheck
      ? (this.chess.findPiece({ type: 'k', color: turn })[0] ?? null)
      : null;

    const isCheckmate = this.chess.isCheckmate();
    const isStalemate = this.chess.isStalemate();
    const isDraw = this.chess.isDraw();
    const isGameOver = this.chess.isGameOver();

    let winner: PieceColor | 'draw' | null = null;
    if (isCheckmate) {
      winner = turn === 'w' ? 'b' : 'w';
    } else if (isDraw || isStalemate) {
      winner = 'draw';
    }

    return {
      fen: this.chess.fen(),
      turn,
      inCheck,
      checkedKingSquare,
      isCheckmate,
      isStalemate,
      isDraw,
      isGameOver,
      winner,
      pieces: this.collectBoardPieces(),
      moveHistory: this.chess.history(),
      captured: this.computeCapturedCounts(),
    };
  }

  public getLegalMoves(square: Square): LegalMoveOption[] {
    if (!SQUARE_PATTERN.test(square)) {
      return [];
    }
    const moves = this.chess.moves({
      square: square as ChessSquare,
      verbose: true,
    });
    return this.toLegalMoveOptions(moves);
  }

  public getAllLegalMoves(): LegalMoveOption[] {
    const moves = this.chess.moves({ verbose: true });
    return this.toLegalMoveOptions(moves);
  }

  public makeMove(
    from: Square,
    to: Square,
    promotion?: PieceType
  ): MoveExecutionResult | null {
    if (!SQUARE_PATTERN.test(from) || !SQUARE_PATTERN.test(to)) {
      return null;
    }

    const candidates = this.chess
      .moves({ square: from as ChessSquare, verbose: true })
      .filter((m) => m.to === to);

    if (candidates.length === 0) {
      return null;
    }

    const isPromotionMove = candidates.some((m) => m.isPromotion());
    let chosenPromotion: PieceType | undefined;

    if (isPromotionMove) {
      chosenPromotion = promotion ?? 'q';
      const hasValidPromo = candidates.some((m) => m.promotion === chosenPromotion);
      if (!hasValidPromo) {
        return null;
      }
    }

    const movingPieceId = this.squareToId.get(from);
    if (!movingPieceId) {
      return null;
    }

    // Save piece-ID layout before mutating chess.js state so undoMove restores exact IDs.
    this.idSnapshots.push(new Map(this.squareToId));

    let executed: Move;
    try {
      executed = this.chess.move(
        chosenPromotion
          ? { from, to, promotion: chosenPromotion }
          : { from, to }
      );
    } catch {
      this.idSnapshots.pop();
      return null;
    }

    let capturedPieceId: string | undefined;
    let capturedPieceType: PieceType | undefined;
    let capturedSquare: Square | undefined;

    if (executed.captured) {
      capturedSquare = executed.isEnPassant()
        ? `${executed.to[0]}${executed.from[1]}`
        : executed.to;
      capturedPieceId = this.squareToId.get(capturedSquare);
      capturedPieceType = executed.captured as PieceType;
      this.squareToId.delete(capturedSquare);
    }

    this.squareToId.delete(executed.from);
    this.squareToId.set(executed.to, movingPieceId);

    let rookCastleMove: MoveExecutionResult['rookCastleMove'];
    if (executed.isKingsideCastle() || executed.isQueensideCastle()) {
      const rookInfo = CASTLE_ROOK_MOVES[`${executed.from}->${executed.to}`];
      if (rookInfo) {
        const rookId = this.squareToId.get(rookInfo.from);
        if (rookId) {
          this.squareToId.delete(rookInfo.from);
          this.squareToId.set(rookInfo.to, rookId);
          rookCastleMove = {
            rookId,
            from: rookInfo.from,
            to: rookInfo.to,
          };
        }
      }
    }

    return {
      from: executed.from,
      to: executed.to,
      san: executed.san,
      pieceId: movingPieceId,
      pieceType: executed.piece as PieceType,
      promotedTo: executed.promotion ? (executed.promotion as PieceType) : undefined,
      color: executed.color as PieceColor,
      capturedPieceId,
      capturedPieceType,
      capturedSquare,
      rookCastleMove,
      isCheck: this.chess.inCheck(),
      isCheckmate: this.chess.isCheckmate(),
      isStalemate: this.chess.isStalemate(),
      isDraw: this.chess.isDraw(),
      fen: this.chess.fen(),
    };
  }

  public undoMove(): GameSnapshot | null {
    const undone = this.chess.undo();
    if (!undone) {
      return null;
    }

    const previousIds = this.idSnapshots.pop();
    if (previousIds) {
      this.squareToId = previousIds;
    } else {
      this.initializePieceIds();
    }

    return this.getSnapshot();
  }

  private initializePieceIds(): void {
    this.squareToId.clear();
    const board = this.chess.board();
    for (const row of board) {
      for (const cell of row) {
        if (cell) {
          this.squareToId.set(
            cell.square,
            `${this.generation}:${cell.color}:${cell.type}:${cell.square}`
          );
        }
      }
    }
  }

  private collectBoardPieces(): BoardPiece[] {
    const pieces: BoardPiece[] = [];
    const board = this.chess.board();
    for (const row of board) {
      for (const cell of row) {
        if (!cell) continue;
        let id = this.squareToId.get(cell.square);
        if (!id) {
          id = `${this.generation}:${cell.color}:${cell.type}:${cell.square}`;
          this.squareToId.set(cell.square, id);
        }
        pieces.push({
          id,
          type: cell.type as PieceType,
          color: cell.color as PieceColor,
          square: cell.square,
        });
      }
    }
    return pieces;
  }

  private computeCapturedCounts(): CapturedCounts {
    let whiteCapturedByBlack = 0;
    let blackCapturedByWhite = 0;

    for (const move of this.chess.history({ verbose: true })) {
      if (move.captured) {
        if (move.color === 'w') {
          blackCapturedByWhite += 1;
        } else {
          whiteCapturedByBlack += 1;
        }
      }
    }

    return {
      whiteCapturedByBlack,
      blackCapturedByWhite,
    };
  }

  private toLegalMoveOptions(moves: Move[]): LegalMoveOption[] {
    const byKey = new Map<string, LegalMoveOption>();

    for (const move of moves) {
      const key = `${move.from}->${move.to}`;
      const existing = byKey.get(key);
      // For promotions, chess.js emits 4 moves (n, b, r, q); keep one UI option preferring 'q'.
      if (existing && move.promotion !== 'q') {
        continue;
      }

      byKey.set(key, {
        from: move.from,
        to: move.to,
        san: move.san,
        isCapture: move.isCapture() || move.isEnPassant(),
        isPromotion: move.isPromotion(),
        isCastling: move.isKingsideCastle() || move.isQueensideCastle(),
        isEnPassant: move.isEnPassant(),
      });
    }

    return Array.from(byKey.values());
  }
}
