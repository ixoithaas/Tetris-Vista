/**
 * Plays complete games and reports what the GAME would actually pay out, using
 * the real attack table and the real garbage/clear rules.  Run:
 *   npx tsx scripts/scorecard.ts [pieces] [garbage]
 */
import { Board, COLS, ROWS, boardToRows, createBoard, maxHeightOf, simulate } from '../src/ai/engine';
import { CONFIG, Decision, Difficulty, DIFFICULTIES, chooseOpener, decide } from '../src/ai/strategy';
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

export interface Card {
  pieces: number;
  lines: number;
  sent: number;
  quads: number;
  tspins: number;
  tst: number;
  pcs: number;
  tetrisPcs: number;
  singles: number;
  doubles: number;
  triples: number;
  holds: number;
  maxH: number;
  dead: boolean;
}

export function playOut(difficulty: Difficulty, pieces: number, garbage = 0, seed = 811): Card {
  const cfg = CONFIG[difficulty];
  const nextPiece = makeBag(seed);
  let st = (seed * 2654435761) >>> 0;
  const rand = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 0x100000000);

  let board: Board = createBoard();
  let b2b = 0, combo = -1, sent = 0, lines = 0, incoming = 0;
  let quads = 0, tspins = 0, tst = 0, pcs = 0, tetrisPcs = 0;
  let singles = 0, doubles = 0, triples = 0, holds = 0;
  let hold: number | null = null, canHold = true, piecesPlaced = 0, maxH = 0;
  let plan: Decision['plan'] = null;
  let wellCol = -1;
  let dead = false, used = 0;
  const queue = nextPiece(6);
  const opener = chooseOpener(difficulty, rand());

  for (let i = 0; i < pieces; i++) {
    used = i;
    const d = decide({
      board: boardToRows(board), current: queue[0],
      queue: queue.slice(1, 1 + Math.max(cfg.lookahead + 3, 4)),
      hold, canHold, b2b, combo, incomingGarbage: incoming,
      piecesPlaced, opener, difficulty, plan, rng: rand, wellColumn: wellCol,
    });
    if (!d) { dead = true; break; }
    plan = d.plan;
    wellCol = d.wellColumn;

    if (d.useHold) {
      holds++;
      const sw = hold ?? queue[1];
      hold = queue[0];
      queue.splice(0, 1);
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
      if (sim.spin) {
        tspins++;
        if (sim.lines === 3) tst++;
      } else if (sim.lines === 4) quads++;
      else if (sim.lines === 1) singles++;
      else if (sim.lines === 2) doubles++;
      else if (sim.lines === 3) triples++;
      if (sim.perfectClear) {
        pcs++;
        if (sim.lines === 4) tetrisPcs++;
      }
      const paid = calculateGarbage(
        sim.lines, sim.spin,
        sim.lines === 4 || sim.spin ? b2b : 0,
        combo >= 0 ? combo + 1 : 0,
        sim.perfectClear,
      );
      sent += paid;
      incoming = Math.max(0, incoming - paid);
      combo = combo >= 0 ? combo + 1 : 0;
      b2b = sim.lines === 4 || sim.spin ? b2b + 1 : 0;
    } else combo = -1;

    if (garbage > 0) {
      incoming += garbage;
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

    maxH = Math.max(maxH, maxHeightOf(board));
    if (maxHeightOf(board) >= ROWS - 1) { dead = true; used = i + 1; break; }
  }

  return {
    pieces: dead ? used : pieces, lines, sent, quads, tspins, tst, pcs, tetrisPcs,
    singles, doubles, triples, holds, maxH, dead,
  };
}

if (process.argv[1].endsWith('scorecard.ts')) {
  const N = Number(process.argv[2] ?? 400);
  const g = Number(process.argv[3] ?? 0);
  const seeds = [811, 997, 1231, 4242, 555];
  console.log(`\n=== ${N} pieces, ${g} garbage/piece, ${seeds.length} seeds ===`);
  for (const d of DIFFICULTIES) {
    let s = 0, l = 0, q = 0, ts = 0, tst = 0, pc = 0, tpc = 0, deaths = 0, mh = 0, hd = 0, pi = 0;
    for (const seed of seeds) {
      const c = playOut(d, N, g, seed);
      s += c.sent; l += c.lines; q += c.quads; ts += c.tspins; tst += c.tst;
      pc += c.pcs; tpc += c.tetrisPcs; hd += c.holds;
      if (c.dead) deaths++;
      mh = Math.max(mh, c.maxH);
      pi += c.pieces;
    }
    console.log(
      `${d.padEnd(7)} pieces=${Math.round(pi / seeds.length)} deaths=${deaths}/${seeds.length} ` +
      `lines=${l} sent=${s} (${(s / (seeds.length * N)).toFixed(2)}/pc) ` +
      `quad=${q} ts=${ts} tst=${tst} pc=${pc} tetrisPC=${tpc} holds=${hd} maxH=${mh}`,
    );
  }
  console.log();
}
