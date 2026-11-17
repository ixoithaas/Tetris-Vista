/**
 * Weight sweep for one difficulty.   Run: npx tsx scripts/sweep.ts <difficulty>
 *
 * Prints survival, attack, tetris/T-spin counts and hole rate for a set of weight
 * variants, on clean boards and under garbage, so changes can be compared on
 * evidence instead of intuition.
 */
import { AiConfig, CONFIG, Difficulty } from '../src/ai/strategy';
import { play } from './tune';

const SEEDS = [811, 997, 1231, 4242, 555, 6161];

export interface Metrics {
  deaths: number;
  maxH: number;
  atk: number;
  holes: number;
  quads: number;
  tspins: number;
  pieces: number;
}

export function measure(cfg: AiConfig, opts: { pieces?: number; garbage?: number } = {}): Metrics {
  let deaths = 0;
  let maxH = 0;
  let atk = 0;
  let holes = 0;
  let quads = 0;
  let tspins = 0;
  let pieces = 0;
  for (const seed of SEEDS) {
    const r = play(cfg, { ...opts, seed });
    if (r.dead) deaths++;
    maxH = Math.max(maxH, r.maxHeight);
    atk += r.attackPerPiece / SEEDS.length;
    holes += r.holesAvg / SEEDS.length;
    quads += r.quads / SEEDS.length;
    tspins += r.tspins / SEEDS.length;
    pieces += r.pieces / SEEDS.length;
  }
  return { deaths, maxH, atk, holes, quads, tspins, pieces };
}

export function fmt(name: string, m: Metrics): string {
  return `${name.padEnd(30)} dead=${m.deaths} maxH=${String(m.maxH).padStart(2)} ` +
    `atk=${m.atk.toFixed(3)} q=${m.quads.toFixed(1).padStart(5)} ts=${m.tspins.toFixed(1).padStart(5)} ` +
    `holes=${m.holes.toFixed(2)}`;
}

if (process.argv[1].endsWith('sweep.ts')) {
  const d = (process.argv[2] as Difficulty) ?? 'medium';
  const base = CONFIG[d];
  const w = base.weights;
  const variants: [string, Partial<AiConfig['weights']>][] = [
    ['baseline', {}],
    ['wellKeep 0.5x', { wellKeep: w.wellKeep * 0.5 }],
    ['wellKeep 0.2x', { wellKeep: w.wellKeep * 0.2 }],
    ['tetrisWell 2x', { tetrisWell: w.tetrisWell * 2 }],
    ['wellKeep 0.3x tetrisWell 2x', { wellKeep: w.wellKeep * 0.3, tetrisWell: w.tetrisWell * 2 }],
    ['rowFill 0', { rowFill: 0 }],
    ['rowFill 2x', { rowFill: w.rowFill * 2 }],
    ['holes 1.5x', { holes: w.holes * 1.5 }],
    ['attack 2x', { attack: w.attack * 2 }],
  ];
  console.log(`\n== ${d}: clean boards (500 pieces) ==`);
  for (const [name, over] of variants) {
    const cfg: AiConfig = { ...base, weights: { ...base.weights, ...over } };
    console.log(fmt(name, measure(cfg, { pieces: 500 })));
  }
  console.log(`\n== ${d}: 0.1 garbage/piece ==`);
  for (const [name, over] of variants) {
    const cfg: AiConfig = { ...base, weights: { ...base.weights, ...over } };
    console.log(fmt(name, measure(cfg, { pieces: 300, garbage: 0.1 })));
  }
}
