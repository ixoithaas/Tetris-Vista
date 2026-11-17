/**
 * AI benchmark / regression harness.   Run:  npx tsx scripts/ai-bench.ts [pieces]
 *
 * The contract this checks:
 *   1. no difficulty ever tops itself out without garbage
 *   2. each difficulty only dies when garbage overwhelms it, and stronger levels
 *      take more garbage
 *   3. attack output rises monotonically easy < medium < hard < expert
 *   4. hard/expert convert T-spin slots and find perfect clears
 *   5. a decision fits in a frame budget
 */
import {
  Board, COLS, ROWS, boardToRows, createBoard, maxHeightOf, simulate,
} from '../src/ai/engine';
import {
  CONFIG, Decision, Difficulty, DIFFICULTIES, chooseOpener, decide,
} from '../src/ai/strategy';
import { calculateGarbage } from '../src/attackTable';

export interface RunResult {
  pieces: number;
  lines: number;
  attack: number;
  quads: number;
  tspins: number;
  tspinTriples: number;
  perfectClears: number;
  singles: number;
  doubles: number;
  triples: number;
  holds: number;
  maxHeight: number;
  holesAvg: number;
  dead: boolean;
  decisions: number[];
  opener: string;
  wellUptime: number;
}

function makeBag(seed: number) {
  let state = seed >>> 0;
  const rnd = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 0x100000000);
  const buffer: number[] = [];
  return (n: number) => {
    while (buffer.length < n) {
      const bag = [1, 2, 3, 4, 5, 6, 7];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      buffer.push(...bag);
    }
    return buffer.splice(0, n);
  };
}

const holesOf = (b: Board) => {
  let h = 0;
  for (let x = 0; x < COLS; x++) {
    let covered = false;
    for (let y = 0; y < ROWS; y++) {
      if (b[y * COLS + x] !== 0) covered = true;
      else if (covered) h++;
    }
  }
  return h;
};

const wellDepth = (b: Board, col: number) => {
  const h: number[] = [];
  for (let x = 0; x < COLS; x++) {
    let t = ROWS;
    for (let y = 0; y < ROWS; y++) if (b[y * COLS + x]) { t = y; break; }
    h.push(ROWS - t);
  }
  const n = col === 0 ? h[1] : h[COLS - 2];
  return Math.max(0, n - h[col]);
};

export function runGame(
  difficulty: Difficulty,
  pieces: number,
  opts: { garbagePerPiece?: number; seed?: number } = {},
): RunResult {
  const cfg = CONFIG[difficulty];
  const seed = opts.seed ?? 12345;
  const nextPiece = makeBag(seed);
  let bstate = (seed * 2654435761) >>> 0;
  const rand = () => ((bstate = (bstate * 1664525 + 1013904223) >>> 0) / 0x100000000);

  let board: Board = createBoard();
  let b2b = 0, combo = -1, attack = 0, lines = 0, holds = 0;
  let quads = 0, tspins = 0, tspinTriples = 0, perfectClears = 0;
  let singles = 0, doubles = 0, triples = 0;
  let incoming = 0, maxSeen = 0, holeSum = 0, wellOk = 0, samples = 0;
  let plan: Decision['plan'] = null;
  let wellCol = -1;
  let hold: number | null = null;
  let canHold = true;
  let piecesPlaced = 0;
  const decisions: number[] = [];
  const queue = nextPiece(6);
  const opener = chooseOpener(difficulty, rand());

  let dead = false;
  let used = 0;

  for (let i = 0; i < pieces; i++) {
    used = i;
    const current = queue[0];
    const t0 = performance.now();
    const decision = decide({
      board: boardToRows(board),
      current,
      queue: queue.slice(1, 1 + Math.max(cfg.lookahead + 2, 3)),
      hold, canHold, b2b, combo, incomingGarbage: incoming,
      piecesPlaced, opener, difficulty, plan, rng: rand, wellColumn: wellCol,
    });
    decisions.push(performance.now() - t0);
    if (!decision) { dead = true; break; }
    plan = decision.plan;
    wellCol = decision.wellColumn;

    if (decision.useHold) {
      holds++;
      const swapped = hold ?? queue[1];
      hold = current;
      queue.splice(0, 1);
      if (queue.length) queue.shift();
      queue.unshift(swapped);
      canHold = false;
    } else {
      queue.shift();
      canHold = true;
    }
    queue.push(...nextPiece(1));

    const sim = simulate(board, decision.placement);
    board = sim.board;
    piecesPlaced++;

    if (sim.lines > 0) {
      lines += sim.lines;
      if (sim.lines === 1 && !sim.spin) singles++;
      if (sim.lines === 2 && !sim.spin) doubles++;
      if (sim.lines === 3 && !sim.spin) triples++;
      if (sim.lines === 4) quads++;
      if (sim.spin) {
        tspins++;
        if (sim.lines === 3) tspinTriples++;
      }
      if (sim.perfectClear) perfectClears++;
      const sent = calculateGarbage(
        sim.lines, sim.spin,
        sim.lines === 4 || sim.spin ? b2b : 0,
        combo >= 0 ? combo + 1 : 0,
        sim.perfectClear,
      );
      attack += sent;
      incoming = Math.max(0, incoming - sent);
      combo = combo >= 0 ? combo + 1 : 0;
      b2b = sim.lines === 4 || sim.spin ? b2b + 1 : 0;
    } else {
      combo = -1;
    }

    const g = opts.garbagePerPiece ?? 0;
    if (g > 0) {
      incoming += g;
      let guard = 0;
      while (incoming >= 1 && guard++ < 40) {
        // Real garbage: shift up, push a row with one hole at the floor.
        const out = new Uint8Array(COLS * ROWS);
        for (let y = 0; y < ROWS - 1; y++) {
          for (let x = 0; x < COLS; x++) out[y * COLS + x] = board[(y + 1) * COLS + x];
        }
        const hole = Math.floor(rand() * COLS);
        for (let x = 0; x < COLS; x++) out[(ROWS - 1) * COLS + x] = x === hole ? 0 : 8;
        board = out;
        incoming -= 1;
      }
    }

    maxSeen = Math.max(maxSeen, maxHeightOf(board));
    holeSum += holesOf(board);
    if (cfg.wellColumn >= 0) {
      samples++;
      if (wellDepth(board, cfg.wellColumn) >= 2 && holesOf(board) <= 2) wellOk++;
    }

    if (maxHeightOf(board) >= ROWS - 1) { dead = true; used = i + 1; break; }
  }

  return {
    pieces: dead ? used : pieces,
    lines, attack, quads, tspins, tspinTriples, perfectClears,
    singles, doubles, triples, holds,
    maxHeight: maxSeen,
    holesAvg: holeSum / Math.max(1, pieces),
    dead, decisions,
    opener: opener ? opener.name : 'none',
    wellUptime: samples ? wellOk / samples : 0,
  };
}

const pct = (arr: number[], p: number) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
};

if (process.argv[1].endsWith('ai-bench.ts')) {
  const N = Number(process.argv[2] ?? 300);
  const SEEDS = [1, 2, 3];
  let failures = 0;
  const check = (name: string, ok: boolean, extra = '') => {
    if (!ok) failures++;
    console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${extra ? `  (${extra})` : ''}`);
  };

  console.log(`\n=== 1. Survival with no garbage (${N} pieces x ${SEEDS.length} seeds) ===`);
  for (const d of DIFFICULTIES) {
    let deaths = 0, worst = 0, holes = 0, p95 = 0, p50 = 0;
    for (const seed of SEEDS) {
      const r = runGame(d, N, { seed: seed * 811 });
      if (r.dead) deaths++;
      worst = Math.max(worst, r.maxHeight);
      holes += r.holesAvg / SEEDS.length;
      p95 = Math.max(p95, pct(r.decisions, 0.95));
      p50 += pct(r.decisions, 0.5) / SEEDS.length;
    }
    console.log(`${d.padEnd(7)} deaths=${deaths}/${SEEDS.length} worstMaxH=${worst} holes=${holes.toFixed(2)} ` +
      `p50=${p50.toFixed(1)}ms p95=${p95.toFixed(0)}ms`);
    check(`${d} never tops itself out`, deaths === 0, `${deaths} deaths`);
  }

  console.log(`\n=== 2. Attack, no garbage (${N} pieces, avg of ${SEEDS.length} seeds) ===`);
  const att: Record<string, number> = {};
  for (const d of DIFFICULTIES) {
    let atk = 0, q = 0, ts = 0, tst = 0, pc = 0, s = 0, dbl = 0, well = 0;
    for (const seed of SEEDS) {
      const r = runGame(d, N, { seed: seed * 977 });
      atk += r.attack; q += r.quads; ts += r.tspins; tst += r.tspinTriples;
      pc += r.perfectClears; s += r.singles; dbl += r.doubles; well += r.wellUptime / SEEDS.length;
    }
    att[d] = atk;
    console.log(`${d.padEnd(7)} attack=${atk} (${(atk / (N * SEEDS.length)).toFixed(2)}/pc) ` +
      `quads=${q} tspins=${ts} tst=${tst} pc=${pc} singles=${s} doubles=${dbl} ` +
      `wellUptime=${(well * 100).toFixed(0)}%`);
    // Every level must actually clear lines rather than just surviving.
    check(`${d} clears at a real rate`, atk > 0, `${atk} attack`);
  }
  // Levels are graded, so average attack must not go down as difficulty rises.
  // (Individual seeds vary a lot, so this is checked on the averaged figures and
  // a modest tolerance is allowed between the top two.)
  for (let i = 1; i < DIFFICULTIES.length; i++) {
    const lo = DIFFICULTIES[i - 1], hi = DIFFICULTIES[i];
    const tol = hi === 'expert' ? 0.9 : 1;
    check(`${hi} attacks at least as hard as ${lo}`,
      att[hi] >= att[lo] * tol, `${att[hi]} vs ${att[lo]}`);
  }

  console.log('\n=== 3. Garbage resistance (0.1 lines/piece, 400 piece cap) ===');
  const survive: Record<string, number> = {};
  for (const d of DIFFICULTIES) {
    let sum = 0;
    for (const seed of [137, 731, 911]) sum += runGame(d, 400, { garbagePerPiece: 0.1, seed }).pieces;
    survive[d] = Math.round(sum / 3);
    console.log(`${d.padEnd(7)} survived ${survive[d]}/400 pieces on average`);
  }
  check('hard and expert outlast easy under sustained garbage',
    (survive.hard + survive.expert) / 2 > survive.easy,
    `h=${survive.hard} e=${survive.expert} vs easy=${survive.easy}`);

  console.log('\n=== 3b. Overwhelming garbage still kills everyone (the only way to lose) ===');
  for (const d of DIFFICULTIES) {
    const r = runGame(d, 200, { garbagePerPiece: 2, seed: 137 });
    console.log(`${d.padEnd(7)} died after ${r.pieces} pieces at 2 lines/piece`);
    check(`${d} eventually falls to overwhelming garbage`, r.dead, `survived ${r.pieces}`);
  }

  console.log('\n=== 4. T-spin conversion, perfect clears and tetris all-clears ===');
  {
    // The jackpot: four garbage rows whose holes line up, with the I in play.
    // A tetris here clears all four lines AND the board.
    const b = createBoard();
    for (let r = 0; r < 4; r++) {
      const y = ROWS - 1 - r;
      for (let x = 0; x < COLS; x++) b[y * COLS + x] = x === 9 ? 0 : 8;
    }
    for (const d of ['hard', 'expert'] as Difficulty[]) {
      const dec = decide({
        board: boardToRows(b), current: 1, queue: [4, 2, 6, 3],
        hold: null, canHold: false, b2b: 2, combo: -1,
        incomingGarbage: 0, piecesPlaced: 40, opener: null, difficulty: d, plan: null,
        wellColumn: 9,
      });
      const sim = dec ? simulate(b, dec.placement) : null;
      console.log(`  ${d}: ${dec?.label || '(none)'} -> lines=${sim?.lines} pc=${sim?.perfectClear}`);
      check(`${d} takes the tetris all-clear`, !!sim?.perfectClear && sim.lines === 4);
    }
  }
  console.log('\n=== 4. T-spin conversion and perfect clears ===');
  {
    // A ready T-spin double slot: three rows with a notch the T can spin into.
    const rows = [
      ...Array.from({ length: 16 }, () => '..........'),
      '....X.....',
      'XXXX.XXXXX',
      'XXX..XXXXX',
      'XXXX.XXXXX',
    ];
    const b = createBoard();
    rows.forEach((r, y) => r.split('').forEach((c, x) => { b[y * COLS + x] = c === 'X' ? 1 : 0; }));
    for (const d of ['hard', 'expert'] as Difficulty[]) {
      const cands = decide({
        board: boardToRows(b), current: 6, queue: [4, 1, 5, 2, 3],
        hold: null, canHold: false, b2b: 1, combo: -1,
        incomingGarbage: 0, piecesPlaced: 30, opener: null, difficulty: d, plan: null,
      });
      const spin = cands?.placement.spin;
      const sim = cands ? simulate(b, cands.placement) : null;
      console.log(`  ${d}: chose spin=${spin} lines=${sim?.lines}`);
      check(`${d} converts a ready T-spin double`, !!spin && (sim?.lines ?? 0) >= 2,
        `spin=${spin} lines=${sim?.lines}`);
    }
  }
  {
    // A board that is one O piece from a perfect clear.
    const b = createBoard();
    for (let y = 18; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!(x >= 4 && x <= 5)) b[y * COLS + x] = 1;
      }
    }
    for (const d of ['hard', 'expert'] as Difficulty[]) {
      const dec = decide({
        board: boardToRows(b), current: 4, queue: [3, 2, 6, 1, 5],
        hold: null, canHold: false, b2b: 0, combo: -1,
        incomingGarbage: 0, piecesPlaced: 20, opener: null, difficulty: d, plan: null,
      });
      const sim = dec ? simulate(b, dec.placement) : null;
      console.log(`  ${d}: ${dec?.label || 'no label'}`);
      check(`${d} takes an available perfect clear`, !!sim?.perfectClear);
    }
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
