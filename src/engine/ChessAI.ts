import { Chess, type Square as ChessSquare } from 'chess.js';
import type { AIDifficulty, PieceColor, PieceType, Square } from '../types';

const MATE_SCORE = 100_000;
const MATE_THRESHOLD = MATE_SCORE - 1_000;
const INFINITY_SCORE = 1_000_000;

const PIECE_PHASE: Record<PieceType, number> = {
  p: 0,
  n: 1,
  b: 1,
  r: 2,
  q: 4,
  k: 0,
};

const MG_VALUE: Record<PieceType, number> = {
  p: 82,
  n: 337,
  b: 365,
  r: 477,
  q: 1025,
  k: 0,
};

const EG_VALUE: Record<PieceType, number> = {
  p: 94,
  n: 281,
  b: 297,
  r: 512,
  q: 936,
  k: 0,
};

// PeSTO-inspired Piece-Square Tables oriented from White's perspective (row 0 = rank 8, row 7 = rank 1).
// prettier-ignore
const MG_PST: Record<PieceType, readonly number[]> = {
  p: [
      0,   0,   0,   0,   0,   0,   0,   0,
     98, 134,  61,  95,  68, 126,  34, -11,
     -6,   7,  26,  31,  65,  56,  25, -20,
    -14,  13,   6,  21,  23,  12,  17, -23,
    -27,  -2,  -5,  12,  17,   6,  10, -25,
    -26,  -4,  -4, -10,   3,   3,  33, -12,
    -35,  -1, -20, -23, -15,  24,  38, -22,
      0,   0,   0,   0,   0,   0,   0,   0,
  ],
  n: [
    -167, -89, -34, -49,  61, -97, -15, -107,
     -73, -41,  72,  36,  23,  62,   7,  -17,
     -47,  60,  37,  65,  84, 129,  73,   44,
      -9,  17,  19,  53,  37,  69,  18,   22,
     -13,   4,  16,  13,  28,  19,  21,   -8,
     -23,  -9,  12,  10,  19,  17,  25,  -16,
     -29, -53, -12,  -3,  -1,  18, -14,  -19,
    -105, -21, -58, -33, -17, -28, -19,  -23,
  ],
  b: [
    -29,   4, -82, -37, -25, -42,   7,  -8,
    -26,  16, -18, -13,  30,  59,  18, -47,
    -16,  37,  43,  40,  35,  50,  37,  -2,
     -4,   5,  19,  50,  37,  37,   7,  -2,
     -6,  13,  13,  26,  34,  12,  10,   4,
      0,  15,  15,  15,  14,  27,  18,  10,
      4,  15,  16,   0,   7,  21,  33,   1,
    -33,  -3, -14, -21, -13, -12, -39, -21,
  ],
  r: [
     32,  42,  32,  51, 63,  9,  31,  43,
     27,  32,  58,  62, 80, 67,  26,  44,
     -5,  19,  26,  36, 17, 45,  61,  16,
    -24, -11,   7,  26, 24, 35,  -8, -20,
    -36, -26, -12,  -1,  9, -7,   6, -23,
    -45, -25, -16, -17,  3,  0,  -5, -33,
    -44, -16, -20,  -9, -1, 11,  -6, -71,
    -19, -13,   1,  17, 16,  7, -37, -26,
  ],
  q: [
    -28,   0,  29,  12,  59,  44,  43,  45,
    -24, -39,  -5,   1, -16,  57,  28,  54,
    -13, -17,   7,   8,  29,  56,  47,  57,
    -27, -27, -16, -16,  -1,  17,  -2,   1,
     -9, -26,  -9, -10,  -2,  -4,   3,  -3,
    -14,   2, -11,  -2,  -5,   2,  14,   5,
    -35,  -8,  11,   2,   8,  15,  -3,   1,
     -1, -18,  -9,  10, -15, -25, -31, -50,
  ],
  k: [
    -65,  23,  16, -15, -56, -34,   2,  13,
     29,  -1, -20,  -7,  -8,  -4, -38, -29,
     -9,  24,   2, -16, -20,   6,  22, -22,
    -17, -20, -12, -27, -30, -25, -14, -36,
    -49,  -1, -27, -39, -46, -44, -33, -51,
    -14, -14, -22, -46, -44, -30, -15, -27,
      1,   7,  -8, -64, -43, -16,   9,   8,
    -15,  36,  12, -54,   8, -28,  24,  14,
  ],
};

// prettier-ignore
const EG_PST: Record<PieceType, readonly number[]> = {
  p: [
      0,   0,   0,   0,   0,   0,   0,   0,
    178, 173, 158, 134, 147, 132, 165, 187,
     94, 100,  85,  67,  56,  53,  82,  84,
     32,  24,  13,   5,  -2,   4,  17,  17,
     13,   9,  -3,  -7,  -7,  -8,   3,  -1,
      4,   7,  -6,   1,   0,  -5,  -1,  -8,
     13,   8,   8,  10,  13,   0,   2,  -7,
      0,   0,   0,   0,   0,   0,   0,   0,
  ],
  n: [
    -58, -38, -13, -28, -31, -27, -63, -99,
    -25,  -8, -25,  -2,  -9, -25, -24, -52,
    -24, -20,  10,   9,  -1,  -9, -19, -41,
    -17,   3,  22,  22,  22,  11,   8, -18,
    -18,  -6,  16,  25,  16,  17,   4, -18,
    -23,  -3,  -1,  15,  10,  -3, -20, -22,
    -42, -20, -10,  -5,  -2, -20, -23, -44,
    -29, -51, -23, -15, -22, -18, -50, -64,
  ],
  b: [
    -14, -21, -11,  -8, -7,  -9, -17, -24,
     -8,  -4,   7, -12, -3, -13,  -4, -14,
      2,  -8,   0,  -1, -2,   6,   0,   4,
     -3,   9,  12,   9, 14,  10,   3,   2,
     -6,   3,  13,  19,  7,  10,  -3,  -9,
    -12,  -3,   8,  10, 13,   3,  -7, -15,
    -14, -18,  -7,  -1,  4,  -9, -15, -27,
    -23,  -9, -23,  -5, -9, -16,  -5, -17,
  ],
  r: [
    13, 10, 18, 15, 12,  12,   8,   5,
    11, 13, 13, 11, -3,   3,   8,   3,
     7,  7,  7,  5,  4,  -3,  -5,  -3,
     4,  3, 13,  1,  2,   1,  -1,   2,
     3,  5,  8,  4, -5,  -6,  -8, -11,
    -4,  0, -5, -1, -7, -12,  -8, -16,
    -6, -6,  0,  2, -9,  -9, -11,  -3,
    -9,  2,  3, -1, -5, -13,   4, -20,
  ],
  q: [
     -9,  22,  22,  27,  27,  19,  10,  20,
    -17,  20,  32,  41,  58,  25,  30,   0,
    -20,   6,   9,  49,  47,  35,  19,   9,
      3,  22,  24,  45,  57,  40,  57,  36,
    -18,  28,  19,  47,  31,  34,  39,  23,
    -16, -27,  15,   6,   9,  17,  10,   5,
    -22, -23, -30, -16, -16, -23, -36, -32,
    -33, -28, -22, -43,  -5, -32, -20, -41,
  ],
  k: [
    -74, -35, -18, -18, -11,  15,   4, -17,
    -12,  17,  14,  17,  17,  38,  23,  11,
     10,  17,  23,  15,  20,  45,  44,  13,
     -8,  22,  24,  27,  26,  33,  26,   3,
    -18,  -4,  21,  24,  27,  23,   9, -11,
    -19,  -3,  11,  21,  23,  16,   7,  -9,
    -27, -11,   4,  13,  14,   4,  -5, -17,
    -53, -34, -21, -11, -28, -14, -24, -43,
  ],
};

type TTFlag = 'exact' | 'lower' | 'upper';

interface TTEntry {
  depth: number;
  score: number;
  flag: TTFlag;
  bestSan?: string;
}

interface ParsedSanMeta {
  san: string;
  isCapture: boolean;
  attacker: PieceType;
  victim: PieceType | null;
  promotion: PieceType | null;
  isCheck: boolean;
  isCastle: boolean;
  targetSquare: Square | null;
  orderScore: number;
}

interface SearchContext {
  tt: Map<string, TTEntry>;
  killers: string[][];
  deadlineMs: number;
  aborted: boolean;
  nodes: number;
}

const CENTER_FILES = new Set(['c', 'd', 'e', 'f']);
const CENTER_RANKS = new Set(['3', '4', '5', '6']);

function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 16));
}

function parsePromotionChar(ch: string): PieceType {
  switch (ch) {
    case 'Q':
      return 'q';
    case 'R':
      return 'r';
    case 'B':
      return 'b';
    case 'N':
      return 'n';
    default:
      return 'q';
  }
}

function parsePieceChar(ch: string): PieceType {
  switch (ch) {
    case 'N':
      return 'n';
    case 'B':
      return 'b';
    case 'R':
      return 'r';
    case 'Q':
      return 'q';
    case 'K':
      return 'k';
    default:
      return 'p';
  }
}

function toTTScore(score: number, ply: number): number {
  if (score > MATE_THRESHOLD) return score + ply;
  if (score < -MATE_THRESHOLD) return score - ply;
  return score;
}

function fromTTScore(score: number, ply: number): number {
  if (score > MATE_THRESHOLD) return score - ply;
  if (score < -MATE_THRESHOLD) return score + ply;
  return score;
}

/**
 * Alpha-beta chess engine with iterative deepening, transposition table,
 * MVV-LVA move ordering, tapered middlegame/endgame PSTs, and quiescence search.
 */
export class ChessAI {
  public async computeBestMove(
    fen: string,
    difficulty: AIDifficulty
  ): Promise<{ from: Square; to: Square; promotion?: PieceType } | null> {
    let chess: Chess;
    try {
      chess = new Chess(fen);
    } catch {
      return null;
    }

    // Yield one frame before starting search so UI indicators render immediately.
    await yieldToUI();

    const legalSans = chess.moves();
    if (legalSans.length === 0) {
      return null;
    }

    const config = this.getDifficultyConfig(difficulty);
    const fullmoveNumber = this.getFullmoveNumber(fen);
    const isOpening = fullmoveNumber <= 6;

    const ctx: SearchContext = {
      tt: new Map(),
      killers: Array.from({ length: 16 }, () => []),
      deadlineMs: Date.now() + 1800,
      aborted: false,
      nodes: 0,
    };

    let bestRootScores: { san: string; score: number; exact: boolean }[] = [];
    let pvSan: string | undefined;
    let lastYieldTime = Date.now();

    // Iterative deepening orders the best move first for much tighter alpha-beta cutoffs.
    for (let depth = 1; depth <= config.depth; depth++) {
      ctx.aborted = false;
      const orderedRoot = this.orderMoves(chess, legalSans, 0, ctx, pvSan);
      const iterScores: { san: string; score: number; exact: boolean }[] = [];
      let bestIterScore = -INFINITY_SCORE;
      const beta = INFINITY_SCORE;

      for (const meta of orderedRoot) {
        // Use full window for novice (needs true scores for noise) and a 25cp slack window
        // in the opening so near-equal candidate moves get exact scores instead of clamping.
        let searchAlpha = -INFINITY_SCORE;
        if (difficulty !== 'novice' && bestIterScore > -INFINITY_SCORE) {
          searchAlpha = isOpening
            ? Math.max(-INFINITY_SCORE, bestIterScore - 25)
            : bestIterScore;
        }

        chess.move(meta.san);
        const score = -this.alphaBeta(
          chess,
          depth - 1,
          -beta,
          -searchAlpha,
          1,
          config.qDepth,
          ctx
        );
        chess.undo();

        if (ctx.aborted && depth > 1) {
          break;
        }

        const isExact = score > searchAlpha;
        iterScores.push({ san: meta.san, score, exact: isExact });
        if (score > bestIterScore) {
          bestIterScore = score;
        }

        // Immediate mate-in-1 found: no deeper search needed.
        if (score >= MATE_SCORE - 1) {
          bestRootScores = iterScores;
          pvSan = meta.san;
          break;
        }

        const now = Date.now();
        if (now - lastYieldTime >= 24) {
          await yieldToUI();
          lastYieldTime = Date.now();
        }
      }

      if (!ctx.aborted && iterScores.length === orderedRoot.length) {
        bestRootScores = iterScores;
        iterScores.sort(
          (a, b) => b.score - a.score || Number(b.exact) - Number(a.exact)
        );
        pvSan = iterScores[0]?.san;
      }

      if (bestRootScores.some((m) => m.score >= MATE_SCORE - 1)) {
        break;
      }
      if (Date.now() >= ctx.deadlineMs) {
        break;
      }
    }

    const chosenSan = this.selectMoveFromScores(
      bestRootScores,
      difficulty,
      isOpening
    );
    if (!chosenSan) {
      return null;
    }

    const executed = chess.move(chosenSan);
    return {
      from: executed.from,
      to: executed.to,
      ...(executed.promotion
        ? { promotion: executed.promotion as PieceType }
        : {}),
    };
  }

  private getDifficultyConfig(difficulty: AIDifficulty): {
    depth: number;
    qDepth: number;
  } {
    switch (difficulty) {
      case 'novice':
        return { depth: 1, qDepth: 1 };
      case 'adept':
        return { depth: 2, qDepth: 2 };
      case 'grandmaster':
        return { depth: 3, qDepth: 3 };
    }
  }

  private getFullmoveNumber(fen: string): number {
    const parts = fen.trim().split(/\s+/);
    const num = parseInt(parts[5] ?? '1', 10);
    return Number.isFinite(num) ? num : 1;
  }

  private selectMoveFromScores(
    scoredMoves: { san: string; score: number; exact: boolean }[],
    difficulty: AIDifficulty,
    isOpening: boolean
  ): string | null {
    if (scoredMoves.length === 0) {
      return null;
    }

    const sorted = [...scoredMoves].sort(
      (a, b) => b.score - a.score || Number(b.exact) - Number(a.exact)
    );
    const topScore = sorted[0].score;

    // Never let noise hide an immediate or forced checkmate.
    if (topScore >= MATE_THRESHOLD) {
      return sorted[0].san;
    }

    if (difficulty === 'novice') {
      const noisy = scoredMoves
        .map((m) => ({
          san: m.san,
          score: m.score + (Math.random() * 150 - 75),
        }))
        .sort((a, b) => b.score - a.score);
      return noisy[0].san;
    }

    if (isOpening) {
      const candidates = sorted.filter(
        (m) => m.exact && topScore - m.score <= 15
      );
      if (candidates.length > 1) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        return pick.san;
      }
    }

    return sorted[0].san;
  }

  private alphaBeta(
    chess: Chess,
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    qDepth: number,
    ctx: SearchContext
  ): number {
    ctx.nodes += 1;
    if ((ctx.nodes & 255) === 0 && Date.now() >= ctx.deadlineMs) {
      ctx.aborted = true;
      return 0;
    }

    // Fast O(1)/O(64) draw checks without generating moves.
    if (
      ply > 0 &&
      (chess.isThreefoldRepetition() ||
        chess.isDrawByFiftyMoves() ||
        chess.isInsufficientMaterial())
    ) {
      return 0;
    }

    if (depth <= 0) {
      return this.quiescence(chess, alpha, beta, qDepth, ply, ctx);
    }

    const originalAlpha = alpha;
    const hash = chess.hash();
    const ttEntry = ctx.tt.get(hash);
    if (ttEntry && ttEntry.depth >= depth) {
      const ttScore = fromTTScore(ttEntry.score, ply);
      if (ttEntry.flag === 'exact') return ttScore;
      if (ttEntry.flag === 'lower' && ttScore > alpha) alpha = ttScore;
      else if (ttEntry.flag === 'upper' && ttScore < beta) beta = ttScore;
      if (alpha >= beta) return ttScore;
    }

    const sans = chess.moves();
    if (sans.length === 0) {
      return chess.inCheck() ? -MATE_SCORE + ply : 0;
    }

    const ordered = this.orderMoves(chess, sans, ply, ctx, ttEntry?.bestSan);
    let best = -INFINITY_SCORE;
    let bestSan = ordered[0].san;

    for (const meta of ordered) {
      chess.move(meta.san);
      const score = -this.alphaBeta(
        chess,
        depth - 1,
        -beta,
        -alpha,
        ply + 1,
        qDepth,
        ctx
      );
      chess.undo();

      if (ctx.aborted) {
        return 0;
      }

      if (score > best) {
        best = score;
        bestSan = meta.san;
      }
      if (score > alpha) {
        alpha = score;
      }
      if (alpha >= beta) {
        if (!meta.isCapture && !meta.promotion && ply < ctx.killers.length) {
          const row = ctx.killers[ply];
          if (row[0] !== meta.san) {
            row[1] = row[0];
            row[0] = meta.san;
          }
        }
        break;
      }
    }

    if (ctx.tt.size > 60_000) {
      ctx.tt.clear();
    }
    const flag: TTFlag =
      best <= originalAlpha ? 'upper' : best >= beta ? 'lower' : 'exact';
    ctx.tt.set(hash, {
      depth,
      score: toTTScore(best, ply),
      flag,
      bestSan,
    });

    return best;
  }

  private quiescence(
    chess: Chess,
    alpha: number,
    beta: number,
    qDepth: number,
    ply: number,
    ctx: SearchContext
  ): number {
    ctx.nodes += 1;
    if ((ctx.nodes & 255) === 0 && Date.now() >= ctx.deadlineMs) {
      ctx.aborted = true;
      return 0;
    }

    const standPat = this.evaluate(chess);
    if (qDepth <= 0) {
      return standPat;
    }

    if (standPat >= beta) {
      return beta;
    }
    if (standPat > alpha) {
      alpha = standPat;
    }

    const sans = chess.moves();
    if (sans.length === 0) {
      return chess.inCheck() ? -MATE_SCORE + ply : 0;
    }

    const tacticalSans = sans.filter(
      (san) => san.includes('x') || san.includes('=')
    );
    if (tacticalSans.length === 0) {
      return alpha;
    }

    const ordered = this.orderMoves(chess, tacticalSans, ply, ctx);
    for (const meta of ordered) {
      if (!meta.promotion && meta.victim) {
        const gain = MG_VALUE[meta.victim];
        if (standPat + gain + 200 < alpha) {
          continue;
        }
      }

      chess.move(meta.san);
      const score = -this.quiescence(
        chess,
        -beta,
        -alpha,
        qDepth - 1,
        ply + 1,
        ctx
      );
      chess.undo();

      if (ctx.aborted) {
        return 0;
      }

      if (score >= beta) {
        return beta;
      }
      if (score > alpha) {
        alpha = score;
      }
    }

    return alpha;
  }

  private orderMoves(
    chess: Chess,
    sans: string[],
    ply: number,
    ctx: SearchContext,
    ttBestSan?: string
  ): ParsedSanMeta[] {
    const killers = ply < ctx.killers.length ? ctx.killers[ply] : [];
    const parsed: ParsedSanMeta[] = new Array(sans.length);
    for (let i = 0; i < sans.length; i++) {
      parsed[i] = this.parseSanMeta(chess, sans[i], killers, ttBestSan);
    }
    parsed.sort((a, b) => b.orderScore - a.orderScore);
    return parsed;
  }

  private parseSanMeta(
    chess: Chess,
    san: string,
    killers: string[],
    ttBestSan?: string
  ): ParsedSanMeta {
    const isCheck = san.endsWith('+') || san.endsWith('#');
    const clean = isCheck ? san.slice(0, -1) : san;
    const isCastle = clean.startsWith('O-O');
    const isCapture = clean.includes('x');

    let promotion: PieceType | null = null;
    let body = clean;
    const eqIndex = clean.indexOf('=');
    if (eqIndex !== -1) {
      promotion = parsePromotionChar(clean[eqIndex + 1] ?? 'Q');
      body = clean.slice(0, eqIndex);
    }

    const attacker = isCastle ? 'k' : parsePieceChar(body[0] ?? '');
    const targetSquare =
      !isCastle && body.length >= 2 ? body.slice(-2) : null;

    let victim: PieceType | null = null;
    if (isCapture && targetSquare) {
      const pieceOnTarget = chess.get(targetSquare as ChessSquare);
      victim = pieceOnTarget ? (pieceOnTarget.type as PieceType) : 'p';
    }

    let orderScore = 0;
    if (ttBestSan && san === ttBestSan) {
      orderScore += 1_000_000;
    }
    if (san.endsWith('#')) {
      orderScore += 200_000;
    }
    if (promotion) {
      orderScore += promotion === 'q' ? 9_500 : 8_200;
    }
    if (isCapture && victim) {
      // MVV-LVA: prefer capturing high-value victims with low-value attackers.
      orderScore += 10_000 + MG_VALUE[victim] * 10 - MG_VALUE[attacker];
    } else if (killers[0] === san) {
      orderScore += 6_500;
    } else if (killers[1] === san) {
      orderScore += 6_000;
    }
    if (isCheck) {
      orderScore += 450;
    }
    if (isCastle) {
      orderScore += 250;
    }
    if (targetSquare) {
      if (
        CENTER_FILES.has(targetSquare[0]) &&
        CENTER_RANKS.has(targetSquare[1])
      ) {
        orderScore += 45;
      }
      if (
        targetSquare === 'd4' ||
        targetSquare === 'e4' ||
        targetSquare === 'd5' ||
        targetSquare === 'e5'
      ) {
        orderScore += 30;
      }
    }

    return {
      san,
      isCapture,
      attacker,
      victim,
      promotion,
      isCheck,
      isCastle,
      targetSquare,
      orderScore,
    };
  }

  private evaluate(chess: Chess): number {
    const board = chess.board();
    let mgWhite = 0;
    let egWhite = 0;
    let mgBlack = 0;
    let egBlack = 0;
    let phase = 0;
    let whiteBishops = 0;
    let blackBishops = 0;

    for (let row = 0; row < 8; row++) {
      const boardRow = board[row];
      for (let col = 0; col < 8; col++) {
        const piece = boardRow[col];
        if (!piece) continue;

        const type = piece.type as PieceType;
        const color = piece.color as PieceColor;
        phase += PIECE_PHASE[type];

        if (color === 'w') {
          const idx = row * 8 + col;
          mgWhite += MG_VALUE[type] + MG_PST[type][idx];
          egWhite += EG_VALUE[type] + EG_PST[type][idx];
          if (type === 'b') whiteBishops += 1;
        } else {
          const idx = (7 - row) * 8 + col;
          mgBlack += MG_VALUE[type] + MG_PST[type][idx];
          egBlack += EG_VALUE[type] + EG_PST[type][idx];
          if (type === 'b') blackBishops += 1;
        }
      }
    }

    if (whiteBishops >= 2) {
      mgWhite += 30;
      egWhite += 45;
    }
    if (blackBishops >= 2) {
      mgBlack += 30;
      egBlack += 45;
    }

    const mgPhase = Math.min(24, phase);
    const egPhase = 24 - mgPhase;

    const mgDiff = mgWhite - mgBlack;
    const egDiff = egWhite - egBlack;
    const whitePerspectiveScore = Math.round(
      (mgDiff * mgPhase + egDiff * egPhase) / 24
    );

    const turn: PieceColor = chess.turn() as PieceColor;
    const tempo = 10;
    return (turn === 'w' ? whitePerspectiveScore : -whitePerspectiveScore) + tempo;
  }
}
