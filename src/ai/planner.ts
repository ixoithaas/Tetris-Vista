/**
 * Perfect clear (all clear) planning.
 *
 * Three facts make the search cheap enough to run online:
 *
 *   1. every piece adds exactly four cells and every cleared row removes ten, so
 *      after `k` pieces the board holds `filled + 4k` cells, and a cleared board
 *      holds a whole number of rows — the cell count must satisfy
 *      `(filled + 4k) % 10 === 0` for some k we still have pieces for. This one
 *      check prunes the overwhelming majority of branches;
 *   2. an all-clear never needs a tall board, so anything above ~4 rows per
 *      remaining piece is dead;
 *   3. identical boards reached with the same number of pieces left are
 *      interchangeable, so a memo on (board hash, pieces left) is exact.
 *
 * The planner returns the piece-by-piece placement sequence to execute. The
 * caller re-validates it against the live board before every use.
 */

import {
  Board,
  COLS,
  Placement,
  ROWS,
  countFilled,
  enumeratePlacements,
  hashBoard,
  isEmptyBoard,
  maxHeightOf,
  simulate,
} from './engine';

export interface PlanStep {
  type: number;
  placement: Placement;
}

export interface Plan {
  kind: 'perfect-clear';
  steps: PlanStep[];
  label: string;
  /** board the plan was computed for; used to detect a stale plan cheaply */
  fromHash: number;
}

export interface PlanRequest {
  board: Board;
  /** pieces in order, `queue[0]` first (the piece in play) */
  queue: number[];
  /** how many pieces the plan may use */
  maxPieces: number;
  /** search node cap */
  budget?: number;
  /** wall-clock cap in ms (checked periodically) */
  timeLimitMs?: number;
  /**
   * Require the plan's last clear to be a tetris (four lines with an I piece).
   *
   * This is the all-clear players actually go for: stack four rows high on nine
   * columns, then drop an I piece into the tenth for a tetris *and* a clear of
   * the board. The game pays a perfect clear bonus on top of the tetris attack,
   * so it is the single most valuable thing on the board.
   */
  finishWithTetris?: boolean;
}

const DEFAULT_BUDGET = 4000;
const DEFAULT_TIME = 8;

/**
 * True when the cell count allows the board to be emptied using exactly `k`
 * of the `remaining` pieces that follow (k in 1..remaining).
 */
function cellCountFeasible(filled: number, remaining: number): boolean {
  const max = Math.min(remaining, 12);
  for (let k = 1; k <= max; k++) {
    if ((filled + 4 * k) % COLS === 0) return true;
  }
  return false;
}

export function findPerfectClearPlan(req: PlanRequest): Plan | null {
  const { board, queue } = req;
  const limit = Math.min(req.maxPieces, queue.length);
  if (limit <= 0) return null;

  // A board this tall can never be all-cleared with a handful of pieces.
  if (maxHeightOf(board) > 12) return null;
  if (isEmptyBoard(board)) return null;
  if (!cellCountFeasible(countFilled(board), limit)) return null;

  let nodes = req.budget ?? DEFAULT_BUDGET;
  const deadline = performance.now() + (req.timeLimitMs ?? DEFAULT_TIME);
  const dead = new Set<string>();
  const path: PlanStep[] = [];
  let timedOut = false;

  const walk = (b: Board, index: number): boolean => {
    if (index >= limit || nodes <= 0 || timedOut) return false;
    const remaining = limit - index;
    const type = queue[index];
    if (type === undefined) return false;

    const key = `${hashBoard(b)}:${remaining}`;
    if (dead.has(key)) return false;
    nodes--;
    if ((nodes & 63) === 0 && performance.now() > deadline) {
      timedOut = true;
      return false;
    }

    const placements = enumeratePlacements(b, type, true);

    interface Option { step: PlanStep; board: Board; lines: number; holes: number }
    const options: Option[] = [];

    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      const sim = simulate(b, p);

      if (sim.perfectClear && sim.lines > 0) {
        if (req.finishWithTetris && sim.lines !== 4) continue;
        // Take the immediate all clear; nothing can beat it.
        path.push({ type, placement: p });
        return true;
      }

      const left = remaining - 1;
      if (left <= 0) continue;
      if (!cellCountFeasible(countFilled(sim.board), left)) continue;
      // Never leave the board taller than a few rows per remaining piece.
      if (maxHeightOf(sim.board) > Math.min(16, 4 * left)) continue;

      options.push({
        step: { type, placement: p },
        board: sim.board,
        lines: sim.lines,
        holes: countHoles(sim.board),
      });
    }

    // Fewest holes first, then the clears that finish most rows.
    options.sort((a, c) => a.holes - c.holes || c.lines - a.lines);

    for (const opt of options) {
      path.push(opt.step);
      if (isEmptyBoard(opt.board)) {
        // The board became empty without this being reported as a clear — treat
        // it as done anyway (defensive; sim.perfectClear should have caught it).
        return true;
      }
      if (walk(opt.board, index + 1)) return true;
      path.pop();
      if (nodes <= 0 || timedOut) break;
    }

    dead.add(key);
    return false;
  };

  const found = walk(board, 0);
  if (!found || path.length === 0) return null;

  const steps = path.map(s => ({ ...s }));
  return {
    kind: 'perfect-clear',
    steps,
    label: steps.length === 1 ? 'Perfect Clear' : `Perfect Clear in ${steps.length}`,
    fromHash: hashBoard(board),
  };
}

/**
 * Searches for a *tetris all-clear*: build four rows on nine columns while the
 * tenth stays an open well, then drop the I piece in for a tetris that also
 * empties the board. This is the all clear players actually aim for, because the
 * game pays the perfect-clear bonus on top of the tetris attack.
 *
 * The search is depth-first with three prunes that make it affordable:
 *
 *   1. never make a hole — a holed board cannot be all-cleared (any cell that is
 *      cleared takes its whole row with it, so a hole survives to the end);
 *   2. never block the well, and never let the well fill above the I-piece slot;
 *   3. once a piece is done, the board may not be taller than 4 rows per piece
 *      left, and the cell count must still be able to reach a whole row count.
 */
export interface TetrisPcRequest {
  board: Board;
  queue: number[];
  maxPieces: number;
  /** only try I pieces in this column (-1 = any column) */
  wellColumn?: number;
  budget?: number;
  timeLimitMs?: number;
}

export function findTetrisPerfectClear(req: TetrisPcRequest): Plan | null {
  const { board, queue } = req;
  const limit = Math.min(req.maxPieces, queue.length);
  if (limit <= 0) return null;
  if (maxHeightOf(board) > 6) return null;

  // The I piece has to arrive *last*: the other pieces block the well shut, and
  // then the I opens it for a tetris that empties the board. Finding the I early
  // in the window is a waste of search, so look for an I at the back.
  let iSlot = -1;
  for (let i = limit - 1; i >= 0; i--) {
    if (queue[i] === 1) { iSlot = i; break; }
  }
  if (iSlot < 0) return null;

  let nodes = req.budget ?? 8000;
  const deadline = performance.now() + (req.timeLimitMs ?? 6);
  const path: PlanStep[] = [];
  const dead = new Set<string>();
  const wellPreferred = req.wellColumn ?? -1;

  const walk = (b: Board, index: number): boolean => {
    if (index > iSlot || nodes <= 0) return false;
    if (performance.now() > deadline) return false;
    const type = queue[index];
    if (type === undefined) return false;

    const key = `${hashBoard(b)}:${iSlot - index}`;
    if (dead.has(key)) return false;
    nodes--;

    interface Opt { step: PlanStep; board: Board; score: number }
    const options: Opt[] = [];

    for (const p of enumeratePlacements(b, type, true)) {
      const sim = simulate(b, p);

      if (index === iSlot) {
        // The finish: a tetris with the I piece that also empties the board.
        if (sim.perfectClear && sim.lines === 4) {
          path.push({ type, placement: p });
          return true;
        }
        continue;
      }

      // Building pieces must not clear anything: a clear would take the rows this
      // whole plan depends on, and it would let the stack drift.
      if (sim.lines > 0) continue;
      // No holes: a holed board can never be all-cleared, because a hole is only
      // removed by the clear of its own row, which needs every other cell in it.
      if (countHoles(sim.board) > 0) continue;
      // Stay inside the 4-row target the final tetris has to clear.
      if (maxHeightOf(sim.board) > 4) continue;

      const score = wellScore(sim.board, wellPreferred);
      if (score < 0) continue;
      options.push({ step: { type, placement: p }, board: sim.board, score });
    }

    // Tidiest, most well-ready boards first; then the I piece finishes the job.
    options.sort((a, c) => c.score - a.score);

    for (const opt of options) {
      path.push(opt.step);
      if (walk(opt.board, index + 1)) return true;
      path.pop();
      if (nodes <= 0) break;
    }
    dead.add(key);
    return false;
  };

  if (!walk(board, 0)) return null;
  const steps = path.map(s => ({ ...s }));
  return {
    kind: 'perfect-clear',
    steps,
    label: `Tetris Perfect Clear in ${steps.length}`,
    fromHash: hashBoard(board),
  };
}

/**
 * How close a board is to the tetris all-clear shape, or -1 when the shape is
 * broken. Rewards an open one-wide edge well plus the rows filling around it.
 */
function wellScore(b: Board, preferred: number): number {
  let best = -1;
  const columns = preferred >= 0 ? [preferred, COLS - 1 - preferred] : [0, COLS - 1];
  for (const col of columns) {
    if (col < 0 || col >= COLS) continue;
    const heights = new Array<number>(COLS).fill(0);
    const tops = new Int32Array(COLS).fill(ROWS);
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        if (b[y * COLS + x] !== 0) { tops[x] = y; break; }
      }
      heights[x] = ROWS - tops[x];
    }
    // The well must be open and at least as deep as its neighbour is tall.
    const neighbour = col === 0 ? heights[1] : heights[COLS - 2];
    if (heights[col] > 0 && heights[col] >= neighbour) continue;
    // Count complete rows around the well: each one is a quarter of the tetris.
    let rowsReady = 0;
    for (let y = Math.max(0, tops[col] - 4); y < tops[col]; y++) {
      let full = true;
      for (let x = 0; x < COLS; x++) {
        if (x === col) continue;
        if (b[y * COLS + x] === 0) { full = false; break; }
      }
      if (full) rowsReady++;
    }
    best = Math.max(best, rowsReady * 10 - heights[col]);
  }
  return best;
}

function countHoles(b: Board): number {
  let holes = 0;
  for (let x = 0; x < COLS; x++) {
    let covered = false;
    for (let y = 0; y < ROWS; y++) {
      if (b[y * COLS + x] !== 0) covered = true;
      else if (covered) holes++;
    }
  }
  return holes;
}

/**
 * Re-checks a plan against the live board. Returns the plan and the remainder to
 * execute after the piece in play, or null when the plan is no longer executable
 * (a garbage line arrived, the queue changed, ...).
 */
export function validatePlan(
  plan: Plan | null,
  board: Board,
  currentType: number,
): { plan: Plan; next: Plan | null } | null {
  if (!plan || !plan.steps.length) return null;
  if (plan.steps[0].type !== currentType) return null;
  if (plan.fromHash !== hashBoard(board)) return null;

  let b = board;
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    if (step.type !== plan.steps[i].type) return null;
    const sim = simulate(b, step.placement);
    // Every step except the last must actually clear, otherwise the board is
    // drifting away from what was planned.
    if (i < plan.steps.length - 1 && sim.lines === 0) return null;
    b = sim.board;
  }
  if (!isEmptyBoard(b)) return null;

  const rest = plan.steps.slice(1);
  const next: Plan | null = rest.length
    ? { ...plan, steps: rest, fromHash: hashBoard(simulate(board, plan.steps[0].placement).board) }
    : null;
  return { plan, next };
}

/** Drops the first step once it has been played. */
export function advancePlan(plan: Plan, boardAfter: Board): Plan | null {
  const rest = plan.steps.slice(1);
  if (!rest.length) return null;
  return { ...plan, steps: rest, fromHash: hashBoard(boardAfter) };
}
