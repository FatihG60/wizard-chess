import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { isLightSquare, squareToWorld, type PieceType } from '../types';
import { ChessAI } from './ChessAI';
import { ChessController } from './ChessController';

describe('Coordinate & board helpers', () => {
  it('maps squares to centered world coordinates', () => {
    expect(squareToWorld('a1')).toEqual({ x: -3.5, z: 3.5 });
    expect(squareToWorld('h1')).toEqual({ x: 3.5, z: 3.5 });
    expect(squareToWorld('a8')).toEqual({ x: -3.5, z: -3.5 });
    expect(squareToWorld('h8')).toEqual({ x: 3.5, z: -3.5 });
    expect(squareToWorld('e4')).toEqual({ x: 0.5, z: 0.5 });
  });

  it('correctly classifies light and dark squares', () => {
    expect(isLightSquare('a1')).toBe(false);
    expect(isLightSquare('h1')).toBe(true);
    expect(isLightSquare('a8')).toBe(true);
    expect(isLightSquare('h8')).toBe(false);
    expect(isLightSquare('e4')).toBe(true);
    expect(isLightSquare('d4')).toBe(false);
  });
});

describe('ChessController', () => {
  it('initializes 32 pieces with unique persistent IDs', () => {
    const controller = new ChessController();
    const snapshot = controller.getSnapshot();

    expect(snapshot.pieces).toHaveLength(32);
    expect(snapshot.turn).toBe('w');
    expect(snapshot.inCheck).toBe(false);
    expect(snapshot.checkedKingSquare).toBeNull();
    expect(snapshot.isGameOver).toBe(false);
    expect(snapshot.winner).toBeNull();
    expect(snapshot.moveHistory).toEqual([]);
    expect(snapshot.captured).toEqual({
      whiteCapturedByBlack: 0,
      blackCapturedByWhite: 0,
    });

    const ids = new Set(snapshot.pieces.map((p) => p.id));
    expect(ids.size).toBe(32);
  });

  it('returns opening legal moves and preserves moving piece ID across moves', () => {
    const controller = new ChessController();
    expect(controller.getAllLegalMoves()).toHaveLength(20);

    const e2Moves = controller.getLegalMoves('e2');
    expect(e2Moves.map((m) => m.to).sort()).toEqual(['e3', 'e4']);
    expect(e2Moves.every((m) => !m.isCapture && !m.isPromotion && !m.isCastling)).toBe(true);

    const initialPawn = controller.getSnapshot().pieces.find((p) => p.square === 'e2');
    expect(initialPawn).toBeDefined();

    const result = controller.makeMove('e2', 'e4');
    expect(result).not.toBeNull();
    expect(result?.pieceId).toBe(initialPawn?.id);
    expect(result?.san).toBe('e4');
    expect(result?.pieceType).toBe('p');
    expect(result?.color).toBe('w');

    const movedPawn = controller.getSnapshot().pieces.find((p) => p.square === 'e4');
    expect(movedPawn?.id).toBe(initialPawn?.id);
    expect(controller.getSnapshot().pieces.find((p) => p.square === 'e2')).toBeUndefined();
    expect(controller.getSnapshot().turn).toBe('b');
  });

  it('rejects illegal moves without mutating board state', () => {
    const controller = new ChessController();
    const fenBefore = controller.getFen();

    expect(controller.makeMove('e2', 'e5')).toBeNull();
    expect(controller.makeMove('e7', 'e5')).toBeNull();
    expect(controller.makeMove('z9', 'e4')).toBeNull();
    expect(controller.getFen()).toBe(fenBefore);
    expect(controller.getSnapshot().moveHistory).toEqual([]);
  });

  it('handles white kingside and black queenside castling with rookCastleMove and stable IDs', () => {
    // Both white kingside and black queenside castling are immediately legal in this FEN.
    const castleFen = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';
    const controller = new ChessController(castleFen);

    const whiteKing = controller.getSnapshot().pieces.find((p) => p.square === 'e1');
    const whiteKRook = controller.getSnapshot().pieces.find((p) => p.square === 'h1');
    const blackKing = controller.getSnapshot().pieces.find((p) => p.square === 'e8');
    const blackQRook = controller.getSnapshot().pieces.find((p) => p.square === 'a8');

    const kingMoves = controller.getLegalMoves('e1');
    const castleMoveOption = kingMoves.find((m) => m.to === 'g1');
    expect(castleMoveOption?.isCastling).toBe(true);

    const wCastle = controller.makeMove('e1', 'g1');
    expect(wCastle).not.toBeNull();
    expect(wCastle?.pieceId).toBe(whiteKing?.id);
    expect(wCastle?.san).toBe('O-O');
    expect(wCastle?.rookCastleMove).toEqual({
      rookId: whiteKRook?.id,
      from: 'h1',
      to: 'f1',
    });

    const bCastle = controller.makeMove('e8', 'c8');
    expect(bCastle).not.toBeNull();
    expect(bCastle?.pieceId).toBe(blackKing?.id);
    expect(bCastle?.san).toBe('O-O-O');
    expect(bCastle?.rookCastleMove).toEqual({
      rookId: blackQRook?.id,
      from: 'a8',
      to: 'd8',
    });

    const snap = controller.getSnapshot();
    expect(snap.pieces.find((p) => p.square === 'g1')?.id).toBe(whiteKing?.id);
    expect(snap.pieces.find((p) => p.square === 'f1')?.id).toBe(whiteKRook?.id);
    expect(snap.pieces.find((p) => p.square === 'c8')?.id).toBe(blackKing?.id);
    expect(snap.pieces.find((p) => p.square === 'd8')?.id).toBe(blackQRook?.id);

    // Undo black queenside castling and verify both king and rook return with original IDs.
    const undone = controller.undoMove();
    expect(undone?.pieces.find((p) => p.square === 'e8')?.id).toBe(blackKing?.id);
    expect(undone?.pieces.find((p) => p.square === 'a8')?.id).toBe(blackQRook?.id);

    // Also test white queenside and black kingside castling.
    controller.reset(castleFen);
    const snap2 = controller.getSnapshot();
    const wKing2 = snap2.pieces.find((p) => p.square === 'e1');
    const wQRook2 = snap2.pieces.find((p) => p.square === 'a1');
    const bKing2 = snap2.pieces.find((p) => p.square === 'e8');
    const bKRook2 = snap2.pieces.find((p) => p.square === 'h8');

    const wQCastle = controller.makeMove('e1', 'c1');
    expect(wQCastle?.san).toBe('O-O-O');
    expect(wQCastle?.rookCastleMove).toEqual({
      rookId: wQRook2?.id,
      from: 'a1',
      to: 'd1',
    });

    const bKCastle = controller.makeMove('e8', 'g8');
    expect(bKCastle?.san).toBe('O-O');
    expect(bKCastle?.rookCastleMove).toEqual({
      rookId: bKRook2?.id,
      from: 'h8',
      to: 'f8',
    });
    expect(controller.getSnapshot().pieces.find((p) => p.square === 'c1')?.id).toBe(
      wKing2?.id
    );
    expect(controller.getSnapshot().pieces.find((p) => p.square === 'g8')?.id).toBe(
      bKing2?.id
    );
  });

  it('handles en passant capture with accurate capturedSquare and capturedPieceId', () => {
    const controller = new ChessController();
    controller.makeMove('e2', 'e4');
    controller.makeMove('a7', 'a6');
    controller.makeMove('e4', 'e5');
    controller.makeMove('d7', 'd5');

    const whitePawn = controller.getSnapshot().pieces.find((p) => p.square === 'e5');
    const blackPawn = controller.getSnapshot().pieces.find((p) => p.square === 'd5');
    expect(whitePawn).toBeDefined();
    expect(blackPawn).toBeDefined();

    const epOption = controller.getLegalMoves('e5').find((m) => m.to === 'd6');
    expect(epOption).toBeDefined();
    expect(epOption?.isEnPassant).toBe(true);
    expect(epOption?.isCapture).toBe(true);

    const epResult = controller.makeMove('e5', 'd6');
    expect(epResult).not.toBeNull();
    expect(epResult?.pieceId).toBe(whitePawn?.id);
    expect(epResult?.capturedPieceId).toBe(blackPawn?.id);
    expect(epResult?.capturedPieceType).toBe('p');
    expect(epResult?.capturedSquare).toBe('d5');

    const snap = controller.getSnapshot();
    expect(snap.pieces.find((p) => p.square === 'd5')).toBeUndefined();
    expect(snap.pieces.find((p) => p.square === 'd6')?.id).toBe(whitePawn?.id);
    expect(snap.captured).toEqual({
      whiteCapturedByBlack: 0,
      blackCapturedByWhite: 1,
    });
  });

  it('handles pawn promotion (default queen, explicit underpromotion, and invalid promotion)', () => {
    const promoFen = '7k/4P3/8/8/8/8/8/4K3 w - - 0 1';
    const controller = new ChessController(promoFen);

    const pawn = controller.getSnapshot().pieces.find((p) => p.square === 'e7');
    const legal = controller.getLegalMoves('e7');
    expect(legal.filter((m) => m.to === 'e8')).toHaveLength(1);
    expect(legal.find((m) => m.to === 'e8')?.isPromotion).toBe(true);

    // Invalid promotion type must fail cleanly.
    expect(controller.makeMove('e7', 'e8', 'k' as PieceType)).toBeNull();

    // Explicit knight underpromotion.
    const knightPromo = controller.makeMove('e7', 'e8', 'n');
    expect(knightPromo).not.toBeNull();
    expect(knightPromo?.pieceId).toBe(pawn?.id);
    expect(knightPromo?.pieceType).toBe('p');
    expect(knightPromo?.promotedTo).toBe('n');
    expect(controller.getSnapshot().pieces.find((p) => p.square === 'e8')?.type).toBe('n');

    // Undo and default to queen promotion when omitted.
    controller.undoMove();
    const queenPromo = controller.makeMove('e7', 'e8');
    expect(queenPromo).not.toBeNull();
    expect(queenPromo?.promotedTo).toBe('q');
    expect(controller.getSnapshot().pieces.find((p) => p.square === 'e8')?.type).toBe('q');
  });

  it("detects Scholar's Mate checkmate, checkedKingSquare, and winner", () => {
    const controller = new ChessController();
    expect(controller.makeMove('e2', 'e4')).not.toBeNull();
    expect(controller.makeMove('e7', 'e5')).not.toBeNull();
    expect(controller.makeMove('d1', 'h5')).not.toBeNull();
    expect(controller.makeMove('b8', 'c6')).not.toBeNull();
    expect(controller.makeMove('f1', 'c4')).not.toBeNull();
    expect(controller.makeMove('g8', 'f6')).not.toBeNull();

    const mate = controller.makeMove('h5', 'f7');
    expect(mate).not.toBeNull();
    expect(mate?.isCheck).toBe(true);
    expect(mate?.isCheckmate).toBe(true);
    expect(mate?.isStalemate).toBe(false);
    expect(mate?.isDraw).toBe(false);
    expect(mate?.capturedPieceType).toBe('p');

    const snap = controller.getSnapshot();
    expect(snap.inCheck).toBe(true);
    expect(snap.checkedKingSquare).toBe('e8');
    expect(snap.isCheckmate).toBe(true);
    expect(snap.isGameOver).toBe(true);
    expect(snap.winner).toBe('w');
    expect(snap.moveHistory).toEqual(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']);
  });

  it('detects stalemate as a draw', () => {
    const stalemateFen = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';
    const controller = new ChessController(stalemateFen);
    const snap = controller.getSnapshot();

    expect(snap.inCheck).toBe(false);
    expect(snap.checkedKingSquare).toBeNull();
    expect(snap.isCheckmate).toBe(false);
    expect(snap.isStalemate).toBe(true);
    expect(snap.isDraw).toBe(true);
    expect(snap.isGameOver).toBe(true);
    expect(snap.winner).toBe('draw');
  });

  it('restores exact piece IDs and counts on undoMove', () => {
    const controller = new ChessController();
    expect(controller.undoMove()).toBeNull();

    const initialPieces = controller.getSnapshot().pieces;
    const initialBySquare = new Map(initialPieces.map((p) => [p.square, p.id]));

    controller.makeMove('e2', 'e4');
    controller.makeMove('d7', 'd5');
    const capture = controller.makeMove('e4', 'd5');
    expect(capture?.capturedPieceId).toBe(initialBySquare.get('d7'));
    expect(controller.getSnapshot().captured.blackCapturedByWhite).toBe(1);

    const afterUndo1 = controller.undoMove();
    expect(afterUndo1).not.toBeNull();
    expect(afterUndo1?.pieces).toHaveLength(32);
    expect(afterUndo1?.captured.blackCapturedByWhite).toBe(0);
    expect(afterUndo1?.pieces.find((p) => p.square === 'd5')?.id).toBe(
      initialBySquare.get('d7')
    );
    expect(afterUndo1?.pieces.find((p) => p.square === 'e4')?.id).toBe(
      initialBySquare.get('e2')
    );

    controller.undoMove();
    const afterUndoAll = controller.undoMove();
    expect(afterUndoAll?.pieces).toHaveLength(32);
    for (const p of afterUndoAll?.pieces ?? []) {
      expect(p.id).toBe(initialBySquare.get(p.square));
    }
    expect(controller.undoMove()).toBeNull();
  });

  it('generates new piece generation IDs on reset', () => {
    const controller = new ChessController();
    const firstId = controller.getSnapshot().pieces.find((p) => p.square === 'e2')?.id;
    const resetSnap = controller.reset();
    const secondId = resetSnap.pieces.find((p) => p.square === 'e2')?.id;
    expect(firstId).toBeDefined();
    expect(secondId).toBeDefined();
    expect(secondId).not.toBe(firstId);
  });
});

describe('ChessAI', () => {
  const ai = new ChessAI();

  it('returns valid legal moves for all three difficulty levels from starting position', async () => {
    const fen = new Chess().fen();
    const difficulties = ['novice', 'adept', 'grandmaster'] as const;

    for (const difficulty of difficulties) {
      const move = await ai.computeBestMove(fen, difficulty);
      expect(move).not.toBeNull();
      const verifier = new Chess(fen);
      const executed = verifier.move(move!);
      expect(executed).toBeDefined();
    }
  });

  it('detects immediate checkmate-in-1 across all difficulties', async () => {
    // White has Qh5 and Bc4 ready to deliver Qxf7#
    const mateIn1Fen =
      'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';

    for (const difficulty of ['novice', 'adept', 'grandmaster'] as const) {
      const move = await ai.computeBestMove(mateIn1Fen, difficulty);
      expect(move).not.toBeNull();
      const check = new Chess(mateIn1Fen);
      check.move(move!);
      expect(check.isCheckmate()).toBe(true);
    }
  });

  it('captures an undefended queen cleanly at adept and grandmaster levels', async () => {
    // Black queen on d5 is completely undefended and White knight on c3 can capture it.
    const freeQueenFen = '4k3/8/8/3q4/8/2N5/8/4K3 w - - 0 1';
    for (const difficulty of ['adept', 'grandmaster'] as const) {
      const move = await ai.computeBestMove(freeQueenFen, difficulty);
      expect(move).toEqual({ from: 'c3', to: 'd5' });
    }
  });

  it('handles pawn promotion moves cleanly and returns null when game is over', async () => {
    const promoFen = '7k/4P3/8/8/8/8/8/4K3 w - - 0 1';
    const move = await ai.computeBestMove(promoFen, 'adept');
    expect(move).not.toBeNull();
    const verifier = new Chess(promoFen);
    const executed = verifier.move(move!);
    expect(executed).toBeDefined();

    const mateFen =
      'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4';
    expect(await ai.computeBestMove(mateFen, 'grandmaster')).toBeNull();
  });

  it('completes grandmaster search in complex middlegame within reasonable time', async () => {
    const middlegameFen =
      'r2q1rk1/pp2bppp/2npbn2/2p1p3/4P3/1NN1BP2/PPPQ2PP/2KR1B1R w - - 0 10';
    const start = Date.now();
    const move = await ai.computeBestMove(middlegameFen, 'grandmaster');
    const elapsedMs = Date.now() - start;

    expect(move).not.toBeNull();
    expect(elapsedMs).toBeLessThan(3000);

    const verifier = new Chess(middlegameFen);
    expect(verifier.move(move!)).toBeDefined();
  });
});
