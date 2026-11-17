/**
 * Verifies the perfect-clear planner against exhaustive brute force.
 * Run: npx tsx scripts/planner-check.ts
 *
 * For small boards and 2-4 piece queues the complete search space is tiny, so we
 * can check that the planner finds a plan whenever one exists (completeness) and
 * that every plan it returns really empties the board (soundness).
 */
import {
  Board, COLS, ROWS, countFilled, createBoard, enumeratePlacements, isEmptyBoard,
  maxHeightOf, simulate,
} from '../src/ai/engine';
import { findPerfectClearPlan } from '../src/ai/planner';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${extra ? `  (${extra})` : ''}`);
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
}

/** Exhaustive: is there ANY sequence of the queue that empties the board? */
function bruteForce(board: Board, queue: number[], limit: number): boolean {
  const walk = (b: Board, i: number): boolean => {
    if (i >= limit) return false;
    const type = queue[i];
    for (const p of enumeratePlacements(b, type, true)) {
      const sim = simulate(b, p);
      if (isEmptyBoard(sim.board)) return true;
      if (walk(sim.board, i + 1)) return true;
    }
    return false;
  };
  return walk(board, 0);
}

/** Plays a plan out from the board it was made for. */
function planEmpties(board: Board, steps: { placement: any }[]): boolean {
  let b = board;
  for (const s of steps) b = simulate(b, s.placement).board;
  return isEmptyBoard(b);
}

console.log('=== 1. Soundness: returned plans always empty the board ===');
{
  const rand = rng(7);
  let plans = 0;
  let broken = 0;
  for (let trial = 0; trial < 400; trial++) {
    const b = createBoard();
    // Random low board: 0..3 rows of random blocks, occasionally nearly full.
    const rows = Math.floor(rand() * 4);
    for (let r = 0; r < rows; r++) {
      const y = ROWS - 1 - r;
      const density = 0.5 + rand() * 0.5;
      for (let x = 0; x < COLS; x++) {
        if (rand() < density) b[y * COLS + x] = 1;
      }
    }
    const queue = Array.from({ length: 4 }, () => 1 + Math.floor(rand() * 7));
    const plan = findPerfectClearPlan({ board: b, queue, maxPieces: 4, budget: 20000, timeLimitMs: 50 });
    if (plan) {
      plans++;
      if (!planEmpties(b, plan.steps)) broken++;
    }
  }
  check('no plan ever fails to clear', broken === 0, `${plans} plans, ${broken} broken`);
  check('plans are actually found on low random boards', plans > 0, `${plans}/400`);
}

console.log('\n=== 2. Completeness: brute force never disagrees ===');
{
  const rand = rng(11);
  let missed = 0;
  let falsePositives = 0;
  let cases = 0;
  let pcs = 0;
  for (let trial = 0; trial < 250; trial++) {
    const b = createBoard();
    // Boards with 2-3 filled rows and a few gaps: the PC-friendly zone.
    const rows = 2 + Math.floor(rand() * 2);
    for (let r = 0; r < rows; r++) {
      const y = ROWS - 1 - r;
      for (let x = 0; x < COLS; x++) if (rand() < 0.75) b[y * COLS + x] = 1;
    }
    const depth = 2 + Math.floor(rand() * 3);
    const queue = Array.from({ length: depth }, () => 1 + Math.floor(rand() * 7));
    cases++;
    const truth = bruteForce(b, queue, depth);
    const plan = findPerfectClearPlan({ board: b, queue, maxPieces: depth, budget: 100000, timeLimitMs: 200 });
    if (truth) pcs++;
    if (truth && !plan) missed++;
    if (!truth && plan) falsePositives++;
  }
  console.log(`  ${cases} boards, ${pcs} had a perfect clear available`);
  check('planner never misses an available perfect clear', missed === 0, `${missed} missed`);
  check('planner never invents one', falsePositives === 0, `${falsePositives} false`);
}

console.log('\n=== 3. Known positions ===');
{
  // 4 rows with a single 1-wide notch: one vertical I empties the board.
  const b = createBoard();
  for (let y = ROWS - 4; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) if (x !== 3) b[y * COLS + x] = 1;
  }
  const plan = findPerfectClearPlan({ board: b, queue: [1], maxPieces: 1 });
  check('one-I perfect clear found', !!plan && planEmpties(b, plan.steps));

  // 2 rows with a 2-wide notch in the same place: one O empties exactly.
  const b2 = createBoard();
  for (let y = ROWS - 2; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) if (x !== 4 && x !== 5) b2[y * COLS + x] = 1;
  }
  const plan2 = findPerfectClearPlan({ board: b2, queue: [4], maxPieces: 1 });
  check('one-O perfect clear found', !!plan2 && planEmpties(b2, plan2.steps));

  // Nothing to clear.
  const plan3 = findPerfectClearPlan({ board: createBoard(), queue: [1, 2, 3, 4], maxPieces: 4 });
  check('empty board yields no plan', plan3 === null);

  // A board that cannot be emptied: 1 filled row plus 1 stray cell is 11 cells,
  // so no number of pieces (4 each) can ever empty it without a clear.
  const b4 = createBoard();
  for (let x = 0; x < COLS; x++) b4[(ROWS - 1) * COLS + x] = 1;
  b4[(ROWS - 2) * COLS] = 1;
  const plan4 = findPerfectClearPlan({ board: b4, queue: [1, 1], maxPieces: 2, budget: 50000 });
  const truth4 = bruteForce(b4, [1, 1], 2);
  check('impossible board handled consistently', (plan4 !== null) === truth4, `plan=${!!plan4} truth=${truth4}`);
}

console.log(`\n${fails === 0 ? 'ALL PLANNER CHECKS PASSED' : `${fails} FAILED`}\n`);
process.exit(fails === 0 ? 0 : 1);
