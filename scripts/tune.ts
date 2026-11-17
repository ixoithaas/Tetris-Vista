/**
 * Weight tuning harness.   Run: npx tsx scripts/tune.ts
 *
 * Plays fast games with a given config override and reports the numbers that
 * matter: survival, holes, attack per piece, and tetris/T-spin counts.
 */
import { Board, COLS, ROWS, boardToRows, createBoard, maxHeightOf, simulate } from '../src/ai/engine';
import { AiConfig, CONFIG, chooseOpener, decide, Difficulty } from '../src/ai/strategy';
import { calculateGarbage } from '../src/attackTable';

function makeBag(seed: number) {
  let s = seed >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
  const b: number[] = [];
  return (n: number) => {
    while (b.length < n) {
      const bag = [1, 2, 3, 4, 5, 6, 7];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      b.push(...bag);
    }
    return b.splice(0, n);
  };
}

function holesOf(b: Board) {
  let h = 0;
  for (let x = 0; x < COLS; x++) {
    let covered = false;
    for (let y = 0; y < ROWS; y++) {
      if (b[y * COLS + x]) covered = true;
      else if (covered) h++;
    }
  }
  return h;
}

export interface TuneResult {
  decisions: number[];
  pieces: number;
  attack: number;
  attackPerPiece: number;
  holesAvg: number;
  maxHeight: number;
  quads: number;
  tspins: number;
  lines: number;
  dead: boolean;
}

export function play(
  cfg: AiConfig,
  opts: { pieces?: number; seed?: number; garbage?: number; noPc?: boolean; noOpener?: boolean; onHigh?: (b: Board, i: number, info: any) => void } = {},
): TuneResult {
  const pieces = opts.pieces ?? 200;
  const seed = opts.seed ?? 811;
  const g = opts.garbage ?? 0;
  const config: AiConfig = opts.noPc ? { ...cfg, pcDepth: 0 } : cfg;
  const nextPiece = makeBag(seed);
  let st = (seed * 2654435761) >>> 0;
  const rand = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 0x100000000);

  let board: Board = createBoard();
  let b2b = 0, combo = -1, attack = 0, lines = 0, quads = 0, tspins = 0;
  let hold: number | null = null, canHold = true, piecesPlaced = 0, incoming = 0;
  let wellCol = -1;
  let plan: any = null, holeSum = 0, maxSeen = 0, dead = false, used = 0;
  const decisions: number[] = [];
  const queue = nextPiece(6);
  const levelOpener = opts.noOpener ? null : chooseOpener(config.difficulty, rand());

  for (let i = 0; i < pieces; i++) {
    used = i;
    const cur = queue[0];
    const t0 = performance.now();
    const d = decide({
      board: boardToRows(board), current: cur, queue: queue.slice(1, 1 + Math.max(cfg.lookahead + 2, 3)),
      hold, canHold, b2b, combo, incomingGarbage: incoming, piecesPlaced,
      opener: levelOpener, difficulty: cfg.difficulty, plan, config, rng: rand, wellColumn: wellCol,
    });
    decisions.push(performance.now() - t0);
    if (!d) { dead = true; break; }
    plan = d.plan;
    wellCol = d.wellColumn;
    if (d.useHold) {
      const sw = hold ?? queue[1];
      hold = cur; queue.splice(0, 1);
      if (queue.length) queue.shift();
      queue.unshift(sw);
      canHold = false;
    } else { queue.shift(); canHold = true; }
    queue.push(...nextPiece(1));

    const sim = simulate(board, d.placement);
    board = sim.board;
    piecesPlaced++;
    if (sim.lines > 0) {
      lines += sim.lines;
      if (sim.lines === 4) quads++;
      if (sim.spin) tspins++;
      const sent = calculateGarbage(sim.lines, sim.spin,
        sim.lines === 4 || sim.spin ? b2b : 0, combo >= 0 ? combo + 1 : 0, sim.perfectClear);
      attack += sent;
      incoming = Math.max(0, incoming - sent);
      combo = combo >= 0 ? combo + 1 : 0;
      b2b = sim.lines === 4 || sim.spin ? b2b + 1 : 0;
    } else combo = -1;

    if (g > 0) {
      incoming += g;
      let guard = 0;
      while (incoming >= 1 && guard++ < 40) {
        const out = new Uint8Array(COLS * ROWS);
        for (let y = 0; y < ROWS - 1; y++) for (let x = 0; x < COLS; x++) out[y * COLS + x] = board[(y + 1) * COLS + x];
        const hole = Math.floor(rand() * COLS);
        for (let x = 0; x < COLS; x++) out[(ROWS - 1) * COLS + x] = x === hole ? 0 : 8;
        board = out;
        incoming -= 1;
      }
    }

    holeSum += holesOf(board);
    const mh = maxHeightOf(board);
    if (mh >= 14 && opts.onHigh) opts.onHigh(board, i, { decision: d, sim, piecesPlaced });
    maxSeen = Math.max(maxSeen, mh);
    if (maxHeightOf(board) >= ROWS - 1) { dead = true; used = i + 1; break; }
  }

  return {
    decisions,
    pieces: dead ? used : pieces,
    attack,
    attackPerPiece: attack / Math.max(1, dead ? used : pieces),
    holesAvg: holeSum / Math.max(1, pieces),
    maxHeight: maxSeen,
    quads, tspins, lines, dead,
  };
}

/** Average of several seeds. */
export function suite(cfg: AiConfig, opts: Parameters<typeof play>[1] & { seeds?: number[] } = {}) {
  const seeds = opts.seeds ?? [811, 997, 1231];
  let atk = 0, holes = 0, quads = 0, ts = 0, deaths = 0, maxH = 0, pcs = 0;
  for (const seed of seeds) {
    const r = play(cfg, { ...opts, seed });
    if (r.dead) deaths++;
    atk += r.attackPerPiece / seeds.length;
    holes += r.holesAvg / seeds.length;
    quads += r.quads / seeds.length;
    ts += r.tspins / seeds.length;
    maxH = Math.max(maxH, r.maxHeight);
  }
  return { atk, holes, quads, ts, deaths, maxH, seeds: seeds.length };
}

const fmt = (label: string, r: ReturnType<typeof suite>) =>
  `${label.padEnd(34)} atk/pc=${r.atk.toFixed(3)} holes=${r.holes.toFixed(2)} ` +
  `quads=${r.quads.toFixed(1)} ts=${r.ts.toFixed(1)} maxH=${r.maxH} deaths=${r.deaths}`;

if (process.argv[1].endsWith('tune.ts')) {
  const base = CONFIG[(process.argv[2] as Difficulty) ?? 'hard'];
  console.log('baseline (no garbage):');
  console.log(' ', fmt('as configured', suite(base, { pieces: 200, noPc: true })));
  console.log('baseline (0.5 garbage/piece):');
  console.log(' ', fmt('as configured', suite(base, { pieces: 150, garbage: 0.5, noPc: true })));
}
