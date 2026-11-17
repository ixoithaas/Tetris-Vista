/**
 * AI evaluation, search and per-difficulty playing style.
 *
 * How the AI decides
 * ------------------
 * Every decision scores the board a candidate placement *produces* (never the
 * piece's journey there), so a placement is judged on the future it leaves
 * behind. That is what stops the AI from stacking itself out: a board it is
 * willing to accept is one it can keep playing on forever.
 *
 * The four levels differ in what they understand, not in how hard they cheat:
 *
 *   easy    1-ply, plain board quality, no well discipline, no spins, no hold,
 *           and a little human sloppiness (it will occasionally pick a merely
 *           good move instead of the best one).
 *   medium  1-ply with the full feature set: keeps an I-piece well open, values
 *           tetrises and T-spins, converts attack, uses hold.
 *   hard    2-ply beam search, named openers, T-spin setup and conversion,
 *           tetris well management, perfect-clear hunting, hold for reordering.
 *   expert  3-ply beam search, tighter well discipline, deeper all-clear search,
 *           T-spin triple building, eDPI-style endgame urgency.
 *
 * Attack is scored from the game's own attack table, so the AI values a clear by
 * the garbage it actually sends rather than by raw line count.
 */

import {
  Board,
  COLS,
  Placement,
  ROWS,
  SimResult,
  SpinType,
  attackFor,
  bestTSpinClear,
  boardFromRows,
  chooseWellColumn,
  cellsFor,
  clampDifficultySafe,
  computeFeatures,
  enumeratePlacements,
  hashBoard,
  isEmptyBoard,
  maxHeightOf,
  simulate,
  wellInfo,
} from './engine';
import { advancePlan, findPerfectClearPlan, findTetrisPerfectClear, Plan, validatePlan } from './planner';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
};

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

export interface Weights {
  /** covered empty cell */
  holes: number;
  /** extra penalty for holes buried deep */
  holeDepth: number;
  /** per row transition */
  rowTrans: number;
  /** per column transition */
  colTrans: number;
  /** per unit of summed open-well depth */
  wells: number;
  /** per row of total stack height */
  aggHeight: number;
  /** per unit of surface roughness */
  bump: number;
  /** linear penalty above 8 rows */
  maxHeight: number;
  /** quadratic penalty above 13 rows */
  danger: number;
  /** reward per cell of the placed piece that disappears with the clear */
  eroded: number;
  /** penalty for landing high up the board */
  landing: number;
  /** value of one line of garbage sent */
  attack: number;
  /** reward multiplier for a spin clear (on top of its attack) */
  spinClear: number;
  /** reward for a perfect clear */
  perfectClear: number;
  /** reward for holding a ready T-spin double/triple slot */
  tSlot: number;
  /** penalty per piece cell dropped into the designated I-well */
  wellKeep: number;
  /** reward for an open I-well of the right depth */
  tetrisWell: number;
  /** want all clears: reward boards that stay PC-viable */
  pcHunting: number;
  /** cost of letting garbage land unsent */
  incomingPressure: number;
  /** reward for filling rows that are nearly complete */
  rowFill: number;
}

export interface AiConfig {
  difficulty: Difficulty;
  weights: Weights;
  /** pieces of lookahead (1 = greedy) */
  lookahead: number;
  /** candidates kept per beam ply */
  beam: number;
  /** score noise added to the best candidates (human imperfection) */
  noise: number;
  /** chance of taking the runner-up move */
  blunder: number;
  /** consider rotation-kick (T-spin) placements */
  spins: boolean;
  /** how many queue pieces may be spent on a perfect-clear plan */
  pcDepth: number;
  /** use hold to reorder pieces */
  useHold: boolean;
  /** pieces the opener phase lasts */
  openerPieces: number;
  /** how hard the opener goal is chased */
  openerStrength: number;
  /** which I-well column this level prefers */
  wellColumn: number;
  /** stack height at which the AI stops building and digs */
  stackTarget: number;
}

const W = (over: Partial<Weights>): Weights => ({
  holes: 7.2,
  holeDepth: 0.4,
  rowTrans: 3.2,
  colTrans: 9.3,
  wells: 1.2,
  aggHeight: 0.5,
  bump: 0.5,
  maxHeight: 1.5,
  danger: 2,
  eroded: 3.4,
  landing: 0.6,
  attack: 1,
  spinClear: 2,
  perfectClear: 0,
  tSlot: 0,
  wellKeep: 0,
  tetrisWell: 1,
  pcHunting: 0,
  incomingPressure: 6,
  rowFill: 0,
  ...over,
});

export const CONFIG: Record<Difficulty, AiConfig> = {
  /**
   * Easy: a casual but *competent* player. It builds flat, keeps holes down and
   * plays real clears, but it does not manage a tetris well, so it grinds
   * singles and doubles instead of setting up quads. It also hesitates: every so
   * often it plays a good move rather than the best one.
   */
  easy: {
    difficulty: 'easy',
    weights: W({
      holes: 6.4,
      holeDepth: 0.2,
      rowTrans: 2.6,
      colTrans: 7.4,
      wells: 0.6,
      aggHeight: 0.46,
      bump: 0.46,
      maxHeight: 2.2,
      danger: 3,
      eroded: 2.6,
      landing: 0.35,
      attack: 0.5,
      spinClear: 0,
      tetrisWell: 0,
      wellKeep: 0,
    }),
    lookahead: 1,
    beam: 1,
    noise: 2,
    blunder: 0.05,
    spins: false,
    pcDepth: 0,
    useHold: false,
    openerPieces: 0,
    openerStrength: 0,
    wellColumn: -1,
    stackTarget: 9,
  },

  /**
   * Medium: clean, consistent, keeps a tetris well open and converts it. This is
   * the "solid ladder player" level: flat board, tetrises and doubles, occasional
   * T-spin when one falls into its lap.
   */
  medium: {
    difficulty: 'medium',
    weights: W({
      holes: 10.6,
      holeDepth: 0.6,
      rowTrans: 3.0,
      colTrans: 8.6,
      wells: 2.4,
      aggHeight: 0.5,
      bump: 0.5,
      maxHeight: 1.8,
      danger: 2.6,
      eroded: 3.2,
      landing: 0.5,
      attack: 1.6,
      spinClear: 8,
      tSlot: 10,
      wellKeep: 3.4,
      tetrisWell: 24,
      rowFill: 6,
    }),
    lookahead: 1,
    beam: 1,
    noise: 0.5,
    blunder: 0,
    spins: false,
    pcDepth: 0,
    useHold: true,
    openerPieces: 0,
    openerStrength: 0,
    wellColumn: 9,
    stackTarget: 8,
  },

  /**
   * Hard: opens with a set opener, builds and converts T-spins, keeps the well,
   * hunts all clears, and looks two pieces ahead.
   */
  hard: {
    difficulty: 'hard',
    weights: W({
      holes: 8.4,
      holeDepth: 0.8,
      rowTrans: 3.2,
      colTrans: 9.2,
      wells: 2.6,
      aggHeight: 0.46,
      bump: 0.5,
      maxHeight: 1.7,
      danger: 2.6,
      eroded: 3.5,
      landing: 0.55,
      attack: 2.6,
      spinClear: 26,
      perfectClear: 2600,
      tSlot: 26,
      wellKeep: 11,
      tetrisWell: 14,
      rowFill: 9,
      pcHunting: 2,
    }),
    lookahead: 2,
    beam: 5,
    noise: 0,
    blunder: 0,
    spins: true,
    pcDepth: 7,
    useHold: true,
    openerPieces: 7,
    openerStrength: 1,
    wellColumn: 9,
    stackTarget: 7,
  },

  /**
   * Expert: everything above, three pieces deep, tighter well and hole
   * discipline, deeper all-clear search and T-spin triple building.
   */
  expert: {
    difficulty: 'expert',
    weights: W({
      holes: 9.2,
      holeDepth: 1.2,
      rowTrans: 3.4,
      colTrans: 9.6,
      wells: 2.8,
      aggHeight: 0.44,
      bump: 0.48,
      maxHeight: 1.6,
      danger: 2.4,
      eroded: 3.8,
      landing: 0.55,
      attack: 3.4,
      spinClear: 34,
      perfectClear: 3800,
      tSlot: 38,
      wellKeep: 13,
      tetrisWell: 17,
      rowFill: 12,
      pcHunting: 3,
    }),
    lookahead: 3,
    beam: 7,
    noise: 0,
    blunder: 0,
    spins: true,
    pcDepth: 8,
    useHold: true,
    openerPieces: 10,
    openerStrength: 1.3,
    wellColumn: 9,
    stackTarget: 7,
  },
};

/* ------------------------------------------------------------------ */
/* Openers                                                             */
/* ------------------------------------------------------------------ */

/**
 * An opener is a *plan*, not a script: the AI knows which shapes it wants
 * (an open well here, a T-spin notch there, a rectangle it can all-clear) and
 * steers the next few pieces towards them whatever order they arrive in. That
 * way it never paints itself into a corner when the bag disagrees with it.
 */
export interface OpenerGoal {
  name: string;
  /** pieces the opener phase lasts */
  pieces: number;
  /** column to keep open for a tetris, -1 for none */
  wellColumn: number;
  /** height the rest of the stack should stay around */
  targetHeight: number;
  /** keep a T-spin double slot ready */
  wantTSpinDouble: boolean;
  /** try to build a T-spin triple notch */
  wantTSpinTriple: boolean;
  /** keep the surface flat and low enough to all-clear */
  wantPerfectClear: boolean;
  /** prefer a flat, rectangle-friendly surface (perfect clear opener) */
  wantRectangle: boolean;
}

export const OPENERS: Record<string, OpenerGoal> = {
  /** Classic 4-line all-clear attempt: L/J/O rectangle, T/S/Z trapezoid. */
  PC: {
    name: 'Perfect Clear Opener',
    pieces: 8,
    wellColumn: -1,
    targetHeight: 4,
    wantTSpinDouble: false,
    wantTSpinTriple: false,
    wantPerfectClear: true,
    wantRectangle: true,
  },
  /** TKI-style T-spin double opening with a follow-up TSD. */
  TKI: {
    name: 'T-Spin Double Opener',
    pieces: 7,
    wellColumn: -1,
    targetHeight: 4,
    wantTSpinDouble: true,
    wantTSpinTriple: false,
    wantPerfectClear: false,
    wantRectangle: true,
  },
  /** Stack a deep side well and open with a tetris. */
  TETRIS: {
    name: 'Tetris Well Opener',
    pieces: 9,
    wellColumn: 9,
    targetHeight: 5,
    wantTSpinDouble: true,
    wantTSpinTriple: false,
    wantPerfectClear: false,
    wantRectangle: false,
  },
  /** DT-Cannon style T-spin triple build. */
  TST: {
    name: 'T-Spin Triple Opener',
    pieces: 9,
    wellColumn: -1,
    targetHeight: 5,
    wantTSpinDouble: true,
    wantTSpinTriple: true,
    wantPerfectClear: false,
    wantRectangle: false,
  },
  /** Keep it low and rectangular, all-clear when the bag cooperates. */
  FREESTYLE_PC: {
    name: 'Low Stack (all-clear hunting)',
    pieces: 6,
    wellColumn: -1,
    targetHeight: 4,
    wantTSpinDouble: false,
    wantTSpinTriple: false,
    wantPerfectClear: true,
    wantRectangle: true,
  },
};

const HARD_OPENERS: (keyof typeof OPENERS)[] = ['PC', 'TKI', 'TETRIS'];
const EXPERT_OPENERS: (keyof typeof OPENERS)[] = ['PC', 'TKI', 'TETRIS', 'TST', 'FREESTYLE_PC'];

/**
 * Picks an opener. `seed` in [0,1) is supplied by the game's RNG so a given seed
 * always produces the same repertoire choice.
 */
export function chooseOpener(difficulty: Difficulty, seed = Math.random()): OpenerGoal | null {
  if (difficulty === 'easy' || difficulty === 'medium') return null;
  const list = difficulty === 'expert' ? EXPERT_OPENERS : HARD_OPENERS;
  const s = ((seed % 1) + 1) % 1;
  const idx = Math.min(list.length - 1, Math.floor(s * list.length));
  return { ...OPENERS[list[idx]] };
}

/** The openers each level knows, for display. */
export const OPENER_NAMES: Record<'hard' | 'expert', string[]> = {
  hard: HARD_OPENERS.map(k => OPENERS[k].name),
  expert: EXPERT_OPENERS.map(k => OPENERS[k].name),
};

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

export interface EvalContext {
  b2b: number;
  combo: number;
  /** garbage lines waiting to be added to this board */
  incomingGarbage: number;
  /** pieces this AI has placed (drives the opener phase) */
  piecesPlaced: number;
  opener: OpenerGoal | null;
  /** I-well column to build in right now, -1 for none */
  wellColumn: number;
  /** ply of the search this context belongs to (0 = the piece in play) */
  depth: number;
}

export const newContext = (over: Partial<EvalContext> = {}): EvalContext => ({
  b2b: 0,
  combo: -1,
  incomingGarbage: 0,
  piecesPlaced: 0,
  opener: null,
  wellColumn: 9,
  depth: 0,
  ...over,
});

export interface Candidate {
  placement: Placement;
  /** immediate + board quality (the greedy score) */
  score: number;
  /** what this placement earns right now */
  immediate: number;
  /** quality of the board it leaves behind */
  board: number;
  sim: SimResult;
  /** features of the resulting board, kept for diagnostics */
  features: ReturnType<typeof computeFeatures>;
}

/** b2b counter after a clear (matches calculateGarbage's expectation). */
const b2bAfter = (sim: SimResult, b2b: number): number => {
  if (sim.lines === 0) return b2b;
  if (sim.lines === 4 || sim.spin) return b2b + 1;
  return 0;
};

const comboAfter = (sim: SimResult, combo: number): number =>
  sim.lines > 0 ? (combo >= 0 ? combo + 1 : 0) : -1;

/**
 * Attack the game would send for this clear. Uses the real attack table so a
 * tetris and a T-spin double are valued by what they actually do.
 */
export function attackOf(sim: SimResult, b2b: number, combo: number): number {
  if (sim.lines === 0 && !sim.perfectClear) return 0;
  const nextB2b = sim.lines === 0 ? b2b : (sim.lines === 4 || sim.spin ? b2b : 0);
  const nextCombo = sim.lines > 0 ? (combo >= 0 ? combo + 1 : 0) : Math.max(0, combo + 1);
  return attackFor(sim.lines, sim.spin, nextB2b, nextCombo, sim.perfectClear);
}

/** The I-well: an open 1-wide notch that a vertical I piece can fill. */
export function wellDepthOf(heights: number[], column: number): number {
  if (column < 0) return 0;
  const neighbour = column === 0 ? heights[1] : heights[COLS - 2];
  return Math.max(0, neighbour - heights[column]);
}

/**
 * How much this placement helps complete rows that are nearly done.
 *
 * Real play is mostly this: you see a row with a gap and you fill it. It matters
 * most with garbage on the board, because every garbage row is one gap away from
 * disappearing — filling those gaps *is* the dig. Rows the piece completes are
 * already paid for by the clear bonus, so this only counts the partial progress,
 * weighted by how close the row already was.
 */
function nearRowFill(board: Board, sim: SimResult, p: Placement): number {
  const cells = cellsFor(p.type, p.rotation);
  const perRow = new Map<number, number>();
  for (const c of cells) {
    const y = p.y + c.y;
    perRow.set(y, (perRow.get(y) ?? 0) + 1);
  }
  let gain = 0;
  for (const [y, added] of perRow) {
    if (sim.clearRows.indexOf(y) >= 0) continue; // paid for by the clear
    const base = y * COLS;
    let beforeFilled = 0;
    for (let x = 0; x < COLS; x++) {
      if (board[base + x] !== 0) beforeFilled++;
    }
    if (beforeFilled < 6) continue;
    // A row that is 9/10 full is worth completing urgently.
    const closeness = (beforeFilled - 5) / 4;
    gain += added * closeness * closeness;
  }
  return gain;
}

/**
 * Scores one candidate placement, split into two parts:
 *
 *   `immediate`  what this placement earns right now (clear attack, eroded
 *                cells, opener progress, well fill);
 *   `board`      the quality of the board it leaves behind.
 *
 * The search needs them apart: board quality is a property of a *position*, so
 * it is counted once at the leaf, while immediate rewards accumulate along the
 * path. Counting the whole board at every ply would charge an investment (like
 * building a tetris well) once per piece instead of once, and the AI would never
 * build anything.
 */
function scoreCandidate(
  board: Board,
  p: Placement,
  cfg: AiConfig,
  ctx: EvalContext,
  level: number,
  heightNow: number,
  holesBefore: number,
  garbageOnBoard: boolean,
): Candidate {
  const w = cfg.weights;
  const sim = simulate(board, p);
  const f = computeFeatures(sim.board);

  /* ---- position quality ------------------------------------------------
   * A hole is (almost) permanent, so it is charged on the board it appears on.
   * The search scores board quality once, at the leaf, so this is charged once.
   */
  let b = 0;
  b -= w.holes * f.holes;
  b -= w.holeDepth * Math.max(0, f.holeDepth - f.holes);
  b -= w.rowTrans * f.rowTransitions;
  b -= w.colTrans * f.colTransitions;
  b -= w.aggHeight * f.aggregateHeight;
  b -= w.bump * f.bumpiness;
  if (level >= 1) b -= w.wells * f.wellSums;

  // Keeping the stack down is the single most important thing a player does, so
  // this is deliberately inescapable: a linear term from the target upwards,
  // then a wall that no clear bonus can outbid.
  if (f.maxHeight > 5) b -= w.maxHeight * (f.maxHeight - 5);
  if (f.maxHeight > 11) {
    const over = f.maxHeight - 11;
    b -= w.danger * over * over * 6;
  }
  if (f.maxHeight >= 18) b -= 5e5;

  /* ---- immediate reward ------------------------------------------------ */
  let s = 0;
  // Making a hole also invalidates any nice future the search can see past it,
  // so it carries a small extra charge on top of the standing penalty.
  const newHoles = f.holes - holesBefore;
  if (newHoles > 0) s -= w.holes * 0.6 * newHoles;
  if (sim.lines > 0) {
    const attack = attackOf(sim, ctx.b2b, ctx.combo);
    s += w.attack * attack;
    s += w.eroded * sim.eroded;
    if (sim.spin) s += w.spinClear * Math.max(1, sim.lines);
    if (sim.perfectClear) s += w.perfectClear;
  } else if (ctx.incomingGarbage > 0) {
    // Garbage is landing: not clearing costs real stock.
    s -= w.incomingPressure * Math.min(ctx.incomingGarbage, 8);
  }
  if (level >= 1) {
    // Landing high up the board is worth less than landing on the floor, and
    // finishing nearly-complete rows is worth a lot (see nearRowFill).
    s -= w.landing * sim.landingHeight * 0.2;
    s += w.rowFill * nearRowFill(board, sim, p);
  }

  /* ---- the tetris well -------------------------------------------------
   * A well is not decoration: everything the player stacks around it is aimed at
   * completing the four rows an I piece will clear. So the well is scored on how
   * *ready* it is — for every row of the I-piece window already complete except
   * for the well column, the tetris is closer. This is also what digs garbage
   * out: garbage rows are complete except for one hole, so filling those rows
   * around an open well is literally the shortest path to clearing them.
   */
  const wellCol = level >= 1 ? ctx.wellColumn : -1;
  if (wellCol >= 0) {
    const info = wellInfo(sim.board, wellCol);
    // Abandon the well once the stack is high, and discount it heavily while
    // there is garbage to dig: garbage rows can only be removed by completing
    // them, which means spending pieces on short clears rather than saving an I.
    const heightCare = Math.max(0, Math.min(1, (cfg.stackTarget + 4 - heightNow) / 3));
    const care = heightCare * (garbageOnBoard ? 0.3 : 1);
    if (p.type !== 1) {
      const filledWell = countColumnCells(sim, wellCol, p);
      // Dropping into the well destroys the tetris, so it costs real value; only
      // an emergency (a clean clear somewhere else) can justify it.
      if (filledWell > 0) {
        const allowed = sim.lines > 0 && newHoles <= 0 ? 0.25 : 1;
        s -= w.wellKeep * filledWell * Math.max(care, 0.3) * allowed;
      }
    }
    if (care > 0) {
      // Every complete row above the well is a quarter of a tetris, and it also
      // removes garbage immediately.
      s += w.tetrisWell * info.rowsReady * care;
    }
    if (info.depth > 4) b -= 3 * (info.depth - 4);
  }

  /* ---- T-spin setup ----------------------------------------------------
   * `bestTSpinClear` is a full board scan, so it only runs for the shallow
   * levels; deeper searches would otherwise be dominated by it.
   */
  if (level >= 1 && w.tSlot > 0 && ctx.depth <= 1) {
    const ready = bestTSpinClear(sim.board);
    // A slot is only worth having if the board around it is clean; burying holes
    // to build one is exactly what weak players do.
    const penalty = newHoles > 0 ? 0.15 : 1;
    if (ready >= 2) s += w.tSlot * (ready >= 3 ? 2.2 : 1) * penalty;
  }

  /* ---- all clears ------------------------------------------------------
   * All clears need a hole-free, low, tidy board (see pcPlausible), so reward
   * staying inside that zone while the stack is small enough to build from.
   */
  if (level >= 2 && w.pcHunting > 0 && !sim.perfectClear) {
    if (f.holes === 0 && f.maxHeight <= 6) {
      s += w.pcHunting * (1 + (6 - f.maxHeight) * 0.5);
    }
  }

  /* ---- opener ---------------------------------------------------------- */
  if (level >= 2 && ctx.opener && ctx.piecesPlaced < ctx.opener.pieces) {
    s += openerScore(sim.board, f, ctx.opener, cfg.openerStrength, heightNow);
  }

  /* ---- pressure --------------------------------------------------------
   * A tall stack must clear, whatever else is going on.
   */
  if (heightNow >= 11) {
    s += sim.lines * (heightNow - 10) * 30;
  }

  return { placement: p, score: s + b, immediate: s, board: b, sim, features: f };
}

function countColumnCells(sim: SimResult, column: number, p: Placement): number {
  let n = 0;
  for (const c of cellsFor(p.type, p.rotation)) {
    if (p.x + c.x === column) n++;
  }
  return n;
}

/** Shape bonus while an opener is running. */
function openerScore(
  board: Board,
  f: ReturnType<typeof computeFeatures>,
  goal: OpenerGoal,
  strength: number,
  heightNow: number,
): number {
  let s = 0;

  // Tall stacks abort openers: surviving beats being pretty.
  const abort = heightNow >= 12;

  if (goal.wantRectangle || goal.wantPerfectClear) {
    s -= f.holes * 14 * strength;
    s -= Math.max(0, f.maxHeight - goal.targetHeight) * 40 * strength;
    s -= f.bumpiness * 1.5 * strength;
  } else {
    for (let x = 0; x < COLS; x++) {
      const diff = f.heights[x] - goal.targetHeight;
      if (diff > 0) s -= diff * 16 * strength;
    }
  }

  if (goal.wellColumn >= 0) {
    const depth = wellDepthOf(f.heights, goal.wellColumn);
    if (depth >= 1 && depth <= 4) s += depth * 10 * strength;
    s -= f.heights[goal.wellColumn] * 22 * strength;
  }

  if (goal.wantTSpinDouble) {
    const ready = bestTSpinClear(board);
    if (ready >= 2) s += 120 * strength;
  }
  if (goal.wantTSpinTriple) {
    const ready = bestTSpinClear(board);
    if (ready >= 3) s += 260 * strength;
  }

  // An opener that has made the board horrible is not worth finishing.
  if (abort) s *= 0.1;
  return s;
}

/** Scores every resting placement of `type`, best first. */
export function scorePlacements(
  board: Board,
  type: number,
  cfg: AiConfig,
  ctx: EvalContext,
  level = 2,
): Candidate[] {
  const placements = enumeratePlacements(board, type, cfg.spins);
  const before = computeFeatures(board);
  const heightNow = before.maxHeight;
  const holesBefore = before.holes;
  let garbageOnBoard = false;
  for (let i = 0; i < board.length; i++) {
    if (board[i] === 8) { garbageOnBoard = true; break; }
  }
  const out: Candidate[] = new Array(placements.length);
  for (let i = 0; i < placements.length; i++) {
    out[i] = scoreCandidate(board, placements[i], cfg, ctx, level, heightNow, holesBefore, garbageOnBoard);
  }
  return out;
}

const byScore = (a: Candidate, b: Candidate) => b.score - a.score;

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export interface SearchResult {
  best: Candidate | null;
  total: number;
}

/**
 * Beam search over the visible queue. The beam keeps the `cfg.beam` best
 * placements of the current piece and, for each, recurses into the next piece,
 * scoring `placement + best continuation`.
 */
export function beamSearch(
  board: Board,
  queue: number[],
  cfg: AiConfig,
  ctx: EvalContext,
  level = 2,
): SearchResult {
  const depth = Math.max(1, Math.min(cfg.lookahead, queue.length));

  // Immediate rewards add up along the path; board quality is scored once, at
  // the leaf, because it already describes the whole position.
  const recurse = (b: Board, idx: number, left: number, c: EvalContext, carried: number): SearchResult => {
    const cands = scorePlacements(b, queue[idx], cfg, c, level);
    if (!cands.length) return { best: null, total: -Infinity };
    cands.sort(byScore);
    if (left <= 1 || idx + 1 >= queue.length) {
      let best = cands[0];
      let bestTotal = carried + cands[0].immediate + cands[0].board;
      for (let i = 1; i < cands.length; i++) {
        const t = carried + cands[i].immediate + cands[i].board;
        if (t > bestTotal) { bestTotal = t; best = cands[i]; }
      }
      return { best, total: bestTotal };
    }

    const keep = Math.min(cfg.beam, cands.length);
    let best: Candidate | null = null;
    let bestTotal = -Infinity;
    for (let i = 0; i < keep; i++) {
      const cand = cands[i];
      const child = recurse(
        cand.sim.board,
        idx + 1,
        left - 1,
        {
          ...c,
          b2b: b2bAfter(cand.sim, c.b2b),
          combo: comboAfter(cand.sim, c.combo),
          piecesPlaced: c.piecesPlaced + 1,
          depth: c.depth + 1,
        },
        carried + cand.immediate,
      );
      if (child.best && child.total > bestTotal) {
        bestTotal = child.total;
        best = cand;
      }
    }
    return { best, total: bestTotal };
  };

  return recurse(board, 0, depth, ctx, 0);
}

/* ------------------------------------------------------------------ */
/* Decision                                                            */
/* ------------------------------------------------------------------ */

export interface DecideInput {
  board: number[][];
  current: number;
  queue: number[];
  hold: number | null;
  canHold: boolean;
  b2b: number;
  combo: number;
  incomingGarbage: number;
  piecesPlaced: number;
  opener: OpenerGoal | null;
  difficulty: string;
  plan: Plan | null;
  /** the well column this AI was using last piece (-1 = not chosen yet) */
  wellColumn?: number;
  /** test/tuning override */
  config?: AiConfig;
  /** injectable randomness so games are reproducible in tests */
  rng?: () => number;
  /**
   * Soft wall-clock budget for this decision in ms. The renderer derives it from
   * the AI's speed, so a fast AI gets a thinner search instead of stuttering.
   */
  timeBudgetMs?: number;
}

export interface Decision {
  placement: Placement;
  useHold: boolean;
  score: number;
  plan: Plan | null;
  label: string;
  /** what the AI is currently trying to do, for the UI */
  intent: string;
  /** the well column to remember for the next piece */
  wellColumn: number;
}

/** Level of understanding per difficulty (see scoreCandidate). */
const LEVEL: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2, expert: 2 };

/**
 * Adds human-like imperfection to a scored candidate list.
 *
 * The imperfection has to be *safe*, otherwise a "slightly sloppy" player is just
 * a player that kills itself for no reason. Two rules make it safe:
 *
 *   1. never pick a placement that makes a hole when a better-scoring placement
 *      does not — burying a hole is the one mistake nothing recovers from;
 *   2. only pick among placements whose resulting board is within a tight window
 *      of the best one.
 *
 * Inside that window the noise decides, which is exactly how a human hesitates:
 * they pick the second-nicest slot, not the one that ruins the stack.
 */
function pickWithNoise(cands: Candidate[], cfg: AiConfig, rng: () => number): Candidate {
  cands.sort(byScore);
  if (cands.length === 1) return cands[0];

  const best = cands[0];
  const bestHoles = best.features?.holes ?? 0;
  const bestBoard = best.board;
  const slack = 12;

  const pool = cands.filter(c =>
    (c.features?.holes ?? 0) <= bestHoles &&
    c.board >= bestBoard - slack,
  ).slice(0, 8);

  const options = pool.length ? pool : [best];

  if (cfg.noise > 0) {
    let pick = options[0];
    let pickV = -Infinity;
    for (const c of options) {
      const v = c.score + (rng() - 0.5) * cfg.noise;
      if (v > pickV) { pickV = v; pick = c; }
    }
    if (cfg.blunder > 0 && options.length > 1 && rng() < cfg.blunder) {
      // Take the runner-up inside the safe pool.
      const runnerUp = options.find(c => c !== pick);
      if (runnerUp) return runnerUp;
    }
    return pick;
  }
  if (cfg.blunder > 0 && options.length > 1 && rng() < cfg.blunder) {
    return options.find(c => c !== best) ?? best;
  }
  return best;
}

/**
 * Cheap test for whether an all-clear is even worth searching for: the board has
 * to be low, hole-free, and hold a cell count that some number of pieces can
 * bring to a whole number of rows.
 */
export function pcPlausible(board: Board): boolean {
  if (maxHeightOf(board) > 8) return false;
  const f = computeFeatures(board);
  if (f.holes > 0) return false;
  // Total cells must be able to reach a multiple of COLS after adding 4k cells.
  for (let k = 1; k <= 7; k++) {
    if ((f.filled + 4 * k) % COLS === 0) return true;
  }
  return false;
}

/** Human-readable label for a clear. */
export function describe(sim: SimResult): string {
  if (sim.perfectClear) return 'PERFECT CLEAR';
  if (sim.lines === 0) return '';
  if (sim.spin === 'normal') return `T-Spin ${['', 'Single', 'Double', 'Triple'][sim.lines] ?? sim.lines}`;
  if (sim.spin === 'mini') return 'T-Spin Mini';
  return ['', 'Single', 'Double', 'Triple', 'Quad'][sim.lines] ?? `${sim.lines} lines`;
}

export function decide(input: DecideInput): Decision | null {
  const difficulty = clampDifficultySafe(input.difficulty);
  const baseCfg = input.config ?? CONFIG[difficulty];
  const cfg = adaptToBudget(baseCfg, input.timeBudgetMs);
  const level = LEVEL[difficulty];
  // Leave the rest of the frame for rendering; the planner gets the smaller share.
  const plannerMs = input.timeBudgetMs ? Math.max(1, input.timeBudgetMs * 0.4) : 8;
  const board = boardFromRows(input.board);
  const queue = [input.current, ...input.queue];
  const rng = input.rng ?? Math.random;

  // The well is re-checked every piece but only *moves* when it has been buried:
  // hopping around would throw away the work already done around it.
  const heightsNow = computeFeatures(board).heights;
  const wellChoice = cfg.wellColumn >= 0
    ? chooseWellColumn(board, pickPreferredWell(cfg, heightsNow), input.wellColumn ?? -1)
    : { column: -1, switched: false };
  const wellColumn = wellChoice.column;

  const ctx = newContext({
    b2b: input.b2b,
    combo: input.combo,
    incomingGarbage: input.incomingGarbage,
    piecesPlaced: input.piecesPlaced,
    opener: level >= 2 ? input.opener : null,
    wellColumn,
    depth: 0,
  });

  const intent = () => {
    if (ctx.opener && ctx.piecesPlaced < ctx.opener.pieces) return ctx.opener.name;
    if (cfg.wellColumn >= 0 && wellDepthOf(computeFeatures(board).heights, cfg.wellColumn) >= 2) return 'building for a tetris';
    return 'stacking clean';
  };

  // 1. Follow a live plan: it is worth more than anything else on the board.
  if (cfg.pcDepth > 0 && input.plan) {
    const live = validatePlan(input.plan, board, input.current);
    if (live) {
      return {
        placement: live.plan.steps[0].placement,
        useHold: false,
        score: 0,
        plan: live.next,
        label: live.plan.label,
        intent: live.plan.label,
        wellColumn,
      };
    }
  }

  // 2. The jackpot: a tetris that also empties the board.
  //
  //    This is the all-clear a real player actually chases. It needs four rows on
  //    nine columns with the tenth left open, the I piece arriving last, and no
  //    holes anywhere — a shape that cannot be built from scratch inside the four
  //    pieces on screen, but which garbage rows hand you for free: garbage is
  //    already complete rows minus one cell each. So this fires when the holes
  //    line up, and the AI takes it immediately.
  if (cfg.pcDepth > 0 && level >= 2) {
    const tetrisPc = findTetrisPerfectClear({
      board,
      queue,
      maxPieces: Math.min(cfg.pcDepth, queue.length),
      wellColumn: cfg.wellColumn,
      budget: 5000,
      timeLimitMs: plannerMs,
    });
    if (tetrisPc) {
      const live = validatePlan(tetrisPc, board, input.current);
      if (live) {
        return {
          placement: live.plan.steps[0].placement,
          useHold: false,
          score: 0,
          plan: live.next,
          label: live.plan.label,
          intent: live.plan.label,
          wellColumn,
        };
      }
    }
  }

  // 3. Look for a general all-clear plan.
  //
  //    All-clears are not a matter of searching harder: after `k` pieces the board
  //    holds `filled + 4k` cells and a cleared board holds whole rows, so a clear
  //    is only even arithmetically possible for particular cell counts. That check
  //    is what keeps this affordable, and it is why the hunt is gated on a tidy,
  //    low board (a messy board can never be all-cleared anyway).
  if (cfg.pcDepth > 0 && queue.length > 1 && pcPlausible(board)) {
    const found = findPerfectClearPlan({
      board,
      queue,
      maxPieces: cfg.pcDepth,
      budget: difficulty === 'expert' ? 6000 : 3000,
      timeLimitMs: plannerMs,
    });
    if (found) {
      const live = validatePlan(found, board, input.current);
      if (live) {
        return {
          placement: live.plan.steps[0].placement,
          useHold: false,
          score: 0,
          plan: live.next,
          label: live.plan.label,
          intent: live.plan.label,
          wellColumn,
        };
      }
    }
  }

  // 4. Ordinary play. Consider the held piece as an alternative to the piece in
  //    play; hold costs the piece in play, so it must clearly be better.
  const normal = beamSearch(board, queue, cfg, ctx, level);
  let chosen = normal.best;
  let useHold = false;

  if (cfg.useHold && input.canHold) {
    const swap = input.hold ?? input.queue[0];
    if (swap !== undefined && swap !== input.current) {
      const swapQueue = [swap, input.current, ...input.queue.slice(1)];
      const swapped = beamSearch(board, swapQueue, cfg, ctx, level);
      // 60 points ≈ a small but real improvement, so the AI does not flap.
      if (swapped.best && (!normal.best || swapped.total > normal.total + 60)) {
        chosen = swapped.best;
        useHold = true;
      }
    }
  }

  if (!chosen) return null;

  // 5. Human imperfection, applied after search so it survives lookahead.
  if (cfg.noise > 0 || cfg.blunder > 0) {
    const pieceType = useHold ? (input.hold ?? input.queue[0]) : input.current;
    const all = scorePlacements(board, pieceType, cfg, ctx, level);
    if (all.length) chosen = pickWithNoise(all, cfg, rng);
  }

  // 6. Pre-plan the next all clear, so the following piece already knows where
  //    it must go.
  let plan: Plan | null = null;
  if (cfg.pcDepth > 0) {
    const after = chosen.sim.board;
    const nextQueue = queue.slice(useHold ? 2 : 1);
    if (nextQueue.length > 1 && maxHeightOf(after) <= 12) {
      const found = findPerfectClearPlan({
        board: after,
        queue: nextQueue,
        maxPieces: Math.max(1, cfg.pcDepth - 1),
        budget: 1500,
        timeLimitMs: plannerMs * 0.5,
      });
      if (found && found.steps[0].type === nextQueue[0]) plan = found;
    }
  }

  return {
    placement: chosen.placement,
    useHold,
    score: chosen.score,
    plan,
    label: describe(chosen.sim),
    intent: intent(),
    wellColumn,
  };
}

/**
 * Where this level *wants* its well. Medium and hard keep to the right edge;
 * expert will switch sides if one edge has become unusable.
 */
function pickPreferredWell(cfg: AiConfig, heights: number[]): number {
  const right = cfg.wellColumn;
  const left = COLS - 1 - right;
  if (cfg.difficulty === 'expert' && left >= 0 && left < COLS) {
    return heights[left] < heights[right] - 3 ? left : right;
  }
  return right;
}

/**
 * Shrinks the search when the AI has little time per piece.
 *
 * The renderer asks for a decision between two placements, so on a fast setting a
 * 30 ms search would blow the frame. Rather than stutter, the AI plays a thinner
 * beam — the same way a person plays faster and thinks less when the speed rises.
 */
export function adaptToBudget(cfg: AiConfig, budgetMs?: number): AiConfig {
  if (!budgetMs || cfg.lookahead <= 1) return cfg;
  // Calibrated against measured cost: a 3-ply beam-7 expert decision takes about
  // 16 ms typical / 38 ms worst case, i.e. roughly 0.7 ms per beam node.
  const cost = (beam: number, depth: number) => 4 + 0.7 * Math.pow(beam, depth - 1);
  if (cost(cfg.beam, cfg.lookahead) <= budgetMs) return cfg;
  for (let depth = cfg.lookahead - 1; depth >= 1; depth--) {
    for (const beam of [cfg.beam, 5, 4, 3, 2]) {
      if (cost(beam, depth) <= budgetMs) return { ...cfg, lookahead: depth, beam };
    }
  }
  return { ...cfg, lookahead: 1, beam: 1 };
}
