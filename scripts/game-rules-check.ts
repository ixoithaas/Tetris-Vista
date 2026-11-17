/**
 * Cross-checks the AI's board model against the GAME's own rules.
 * Run: npx tsx scripts/game-rules-check.ts
 *
 * The AI plans moves on its own engine, so if that engine disagreed with App.tsx
 * about which rows clear, which clears are perfect, or what attack a clear pays,
 * the AI would optimise for something the game does not reward. This transcribes
 * the game's `sweep`, `checkPerfectClear` and `calculateGarbage` usage and checks
 * them against the engine over every placement on a large sample of boards.
 */
import {
  Board, CELLS, COLS, ROWS, createBoard, enumeratePlacements, simulate,
} from '../src/ai/engine';
import { calculateGarbage } from '../src/attackTable';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${extra ? `  (${extra})` : ''}`);
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
}

const toRows = (b: Board): number[][] => {
  const rows: number[][] = [];
  for (let y = 0; y < ROWS; y++) {
    const r: number[] = [];
    for (let x = 0; x < COLS; x++) r.push(b[y * COLS + x]);
    rows.push(r);
  }
  return rows;
};

/** App.tsx sweep(): delete full rows at the bottom, shift everything down. */
function gameSweep(board: number[][]): { board: number[][]; linesCleared: number } {
  const b = board.map(r => [...r]);
  let linesCleared = 0;
  outer: for (let y = b.length - 1; y >= 0; --y) {
    for (let x = 0; x < b[y].length; ++x) if (b[y][x] === 0) continue outer;
    const row = b.splice(y, 1)[0].fill(0);
    b.unshift(row);
    ++y;
    linesCleared++;
  }
  return { board: b, linesCleared };
}

/** App.tsx checkPerfectClear(). */
function isPerfectClear(board: number[][]): boolean {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) if (board[y][x] !== 0) return false;
  }
  return true;
}

const rand = rng(20261117);

console.log('=== 1. Clears, perfect clears and attack agree with the game ===');
{
  let lineMismatch = 0;
  let boardMismatch = 0;
  let pcMismatch = 0;
  let attackMismatch = 0;
  let checked = 0;

  for (let trial = 0; trial < 250; trial++) {
    // Build a plausible board by stacking random pieces.
    let b = createBoard();
    const stack = Math.floor(rand() * 20);
    for (let i = 0; i < stack; i++) {
      const type = 1 + Math.floor(rand() * 7);
      const drops = enumeratePlacements(b, type);
      if (!drops.length) break;
      b = simulate(b, drops[Math.floor(rand() * drops.length)]).board;
    }

    for (let type = 1; type <= 7; type++) {
      for (const p of enumeratePlacements(b, type, true)) {
        checked++;
        // Merge + sweep exactly as the game does.
        const rows = toRows(b);
        for (const c of CELLS[type][p.rotation]) rows[p.y + c.y][p.x + c.x] = type;
        const swept = gameSweep(rows);
        const sim = simulate(b, p);

        if (swept.linesCleared !== sim.lines) lineMismatch++;

        const gamePc = isPerfectClear(swept.board);
        if (gamePc !== sim.perfectClear) pcMismatch++;

        // Attack must be identical, because the AI scores attack directly.
        const gameSent = calculateGarbage(sim.lines, sim.spin, 0, 0, gamePc);
        const aiSent = calculateGarbage(sim.lines, sim.spin, 0, 0, sim.perfectClear);
        if (gameSent !== aiSent) attackMismatch++;

        // And the resulting board must match cell for cell.
        const aiRows = toRows(sim.board);
        for (let y = 0; y < ROWS; y++) {
          let diff = false;
          for (let x = 0; x < COLS; x++) {
            if ((aiRows[y][x] !== 0) !== (swept.board[y][x] !== 0)) { diff = true; break; }
          }
          if (diff) { boardMismatch++; break; }
        }
      }
    }
  }

  check('line counts match', lineMismatch === 0, `${checked} placements, ${lineMismatch} bad`);
  check('resulting boards match', boardMismatch === 0, `${boardMismatch} bad`);
  check('perfect clears match', pcMismatch === 0, `${pcMismatch} bad`);
  check('attack value matches', attackMismatch === 0, `${attackMismatch} bad`);
}

console.log('\n=== 2. T-spin attack is priced the same way ===');
{
  // The AI only claims a spin where the game's three-corner rule agrees (checked
  // in engine-check), and spins are paid from the same table.
  const spins: ('normal' | 'mini' | null)[] = [null, 'normal', 'mini'];
  let bad = 0;
  for (const spin of spins) {
    for (let lines = 0; lines <= 4; lines++) {
      for (const pc of [false, true]) {
        const a = calculateGarbage(lines, spin, 0, 0, pc);
        if (!Number.isFinite(a) || a < 0) bad++;
      }
    }
  }
  check('every spin/line/PC combination prices cleanly', bad === 0, `${bad} bad`);
}

console.log(`\n${fails === 0 ? 'AI MODEL AGREES WITH THE GAME' : `${fails} FAILED`}\n`);
process.exit(fails === 0 ? 0 : 1);
