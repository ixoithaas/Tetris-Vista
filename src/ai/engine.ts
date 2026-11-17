/**
 * Pure, framework-free Tetris board engine used by the AI players.
 *
 * The board is a flat Uint8Array of COLS * ROWS cells so cloning it is a single
 * 200 byte memcpy. Values mirror the renderer: 0 = empty, 1..7 = piece colours,
 * 8 = garbage.
 *
 * Two things make this engine fast enough for real-time play:
 *
 *   - `columnTops` gives the first filled row of every column in one pass, so a
 *     straight-drop resting position is *computed* (4 comparisons) instead of
 *     found by simulating gravity (dozens of collision tests).
 *   - `evaluate` computes every board feature in one fused pass over the cells,
 *     without allocating anything.
 */

import { calculateGarbage } from '../attackTable';

export const COLS = 10;
export const ROWS = 20;

export type Board = Uint8Array;
export type SpinType = 'normal' | 'mini' | null;

/** Piece ids used by the game: 1 I, 2 J, 3 L, 4 O, 5 S, 6 T, 7 Z. */
export const SHAPES: number[][][] = [
  [],
  [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], // I
  [[2, 0, 0], [2, 2, 2], [0, 0, 0]], // J
  [[0, 0, 3], [3, 3, 3], [0, 0, 0]], // L
  [[4, 4], [4, 4]], // O
  [[0, 5, 5], [5, 5, 0], [0, 0, 0]], // S
  [[0, 6, 0], [6, 6, 6], [0, 0, 0]], // T
  [[7, 7, 0], [0, 7, 7], [0, 0, 0]], // Z
];

/** Matches the rotation helper used by the renderer / player controls. */
export const rotateMatrix = (matrix: number[][], dir: number): number[][] => {
  const N = matrix.length;
  if (dir === 1) {
    return matrix.map((row, i) => row.map((_val, j) => matrix[N - 1 - j][i]));
  } else if (dir === -1) {
    return matrix.map((row, i) => row.map((_val, j) => matrix[j][N - 1 - i]));
  } else if (dir === 2) {
    return matrix.map((row, i) => row.map((_val, j) => matrix[N - 1 - i][N - 1 - j]));
  }
  return matrix;
};

export interface CellOffset {
  x: number;
  y: number;
}

/** CELLS[type][rotation] -> offsets of the filled cells inside the piece matrix. */
export const CELLS: CellOffset[][][] = (() => {
  const out: CellOffset[][][] = [];
  for (let type = 0; type <= 7; type++) {
    const rotations: CellOffset[][] = [];
    let m = SHAPES[type] ?? [];
    for (let r = 0; r < 4; r++) {
      const cells: CellOffset[] = [];
      m.forEach((row, y) => row.forEach((value, x) => {
        if (value !== 0) cells.push({ x, y });
      }));
      rotations.push(cells);
      m = rotateMatrix(m, 1);
    }
    out.push(rotations);
  }
  return out;
})();

/** Rotations that actually change the shape (O -> 1, I/S/Z -> 2, rest -> 4). */
export const UNIQUE_ROTATIONS: number[][] = (() => {
  const out: number[][] = [];
  for (let type = 0; type <= 7; type++) {
    const seen = new Set<string>();
    const rotations: number[] = [];
    for (let r = 0; r < 4; r++) {
      const cells = CELLS[type][r];
      if (!cells.length) continue;
      const minX = Math.min(...cells.map(c => c.x));
      const minY = Math.min(...cells.map(c => c.y));
      const key = cells.map(c => `${c.x - minX},${c.y - minY}`).sort().join('|');
      if (!seen.has(key)) {
        seen.add(key);
        rotations.push(r);
      }
    }
    out.push(rotations);
  }
  return out;
})();

/** Per rotation: horizontal extent, used to keep drops inside the walls. */
const ROT_BOUNDS: { minX: number; maxX: number; maxY: number }[][] = (() => {
  const out: { minX: number; maxX: number; maxY: number }[][] = [];
  for (let type = 0; type <= 7; type++) {
    const perRot: { minX: number; maxX: number; maxY: number }[] = [];
    for (let r = 0; r < 4; r++) {
      const cells = CELLS[type][r];
      let minX = 9;
      let maxX = -9;
      let maxY = 0;
      for (const c of cells) {
        if (c.x < minX) minX = c.x;
        if (c.x > maxX) maxX = c.x;
        if (c.y > maxY) maxY = c.y;
      }
      perRot.push({ minX, maxX, maxY });
    }
    out.push(perRot);
  }
  return out;
})();

export const cellsFor = (type: number, rotation: number): CellOffset[] => CELLS[type][rotation & 3];
export const boundsFor = (type: number, rotation: number) => ROT_BOUNDS[type][rotation & 3];

export const createBoard = (): Board => new Uint8Array(COLS * ROWS);

export function boardFromRows(rows: number[][]): Board {
  const b = new Uint8Array(COLS * ROWS);
  for (let y = 0; y < ROWS; y++) {
    const row = rows[y] ?? [];
    for (let x = 0; x < COLS; x++) b[y * COLS + x] = row[x] ? row[x] : 0;
  }
  return b;
}

export function boardToRows(b: Board): number[][] {
  const rows: number[][] = [];
  for (let y = 0; y < ROWS; y++) {
    const row: number[] = [];
    for (let x = 0; x < COLS; x++) row.push(b[y * COLS + x]);
    rows.push(row);
  }
  return rows;
}

export function isEmptyBoard(b: Board): boolean {
  for (let i = 0; i < b.length; i++) if (b[i] !== 0) return false;
  return true;
}

export function countFilled(b: Board): number {
  let n = 0;
  for (let i = 0; i < b.length; i++) if (b[i] !== 0) n++;
  return n;
}

/** FNV-1a hash — used to check that a multi-piece plan is still valid. */
export function hashBoard(b: Board): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) {
    h ^= b[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * First filled row of every column (ROWS when the column is empty).
 * Written into `out` when given so callers can reuse the buffer.
 */
export function columnTops(b: Board, out?: Uint8Array): Uint8Array {
  const tops = out ?? new Uint8Array(COLS);
  for (let x = 0; x < COLS; x++) {
    let y = 0;
    for (; y < ROWS; y++) {
      if (b[y * COLS + x] !== 0) break;
    }
    tops[x] = y;
  }
  return tops;
}

/** Height of every column, measured up from the floor. */
export function columnHeights(b: Board, out?: number[]): number[] {
  const tops = columnTops(b);
  const heights = out ?? new Array<number>(COLS).fill(0);
  for (let x = 0; x < COLS; x++) heights[x] = ROWS - tops[x];
  return heights;
}

export function maxHeightOf(b: Board): number {
  let max = 0;
  for (let x = 0; x < COLS; x++) {
    for (let y = max; y < ROWS; y++) {
      if (b[y * COLS + x] !== 0) {
        max = ROWS - y;
        break;
      }
    }
  }
  return max;
}

export interface Placement {
  type: number;
  rotation: number;
  /** matrix top-left column */
  x: number;
  /** matrix top-left row */
  y: number;
  spin: SpinType;
  /** true when the placement needs a rotation under an overhang to reach */
  kick: boolean;
}

export function collidesCells(b: Board, cells: CellOffset[], x: number, y: number): boolean {
  for (let i = 0; i < cells.length; i++) {
    const bx = x + cells[i].x;
    const by = y + cells[i].y;
    if (bx < 0 || bx >= COLS || by >= ROWS) return true;
    if (by >= 0 && b[by * COLS + bx] !== 0) return true;
  }
  return false;
}

export function collides(b: Board, type: number, rotation: number, x: number, y: number): boolean {
  return collidesCells(b, CELLS[type][rotation & 3], x, y);
}

/**
 * Mirrors the game's T-spin corner rule (see getSpinType in App.tsx). Returns
 * null when the piece is not in a T-spin cavity at all.
 */
export function tSpinKind(b: Board, x: number, y: number, rotation: number): SpinType {
  const corners = [
    { x, y },
    { x: x + 2, y },
    { x: x + 2, y: y + 2 },
    { x, y: y + 2 },
  ];
  let occupiedCorners = 0;
  const occupied: boolean[] = [];
  for (const c of corners) {
    const isOccupied =
      c.y < 0 || c.y >= ROWS || c.x < 0 || c.x >= COLS || b[c.y * COLS + c.x] !== 0;
    if (isOccupied) occupiedCorners++;
    occupied.push(isOccupied);
  }
  if (occupiedCorners < 3) return null;

  let front = 0;
  if (rotation === 0) {
    if (occupied[0]) front++;
    if (occupied[1]) front++;
  } else if (rotation === 1) {
    if (occupied[1]) front++;
    if (occupied[2]) front++;
  } else if (rotation === 2) {
    if (occupied[2]) front++;
    if (occupied[3]) front++;
  } else {
    if (occupied[3]) front++;
    if (occupied[0]) front++;
  }
  return front === 2 ? 'normal' : 'mini';
}

/* ------------------------------------------------------------------ */
/* Placement enumeration                                               */
/* ------------------------------------------------------------------ */

let topsScratch = new Uint8Array(COLS);

/**
 * Every position a piece can reach by dropping straight down in each rotation.
 *
 * The resting row is computed from `columnTops` rather than found by stepping
 * gravity: a piece cell at (x+dx, y+dy) stops when it reaches the first filled
 * cell of column x+dx, so `y = min(tops[x+dx] - 1 - dy)` over the piece cells.
 */
export function enumerateDrops(b: Board, type: number, out?: Placement[]): Placement[] {
  const res = out ?? [];
  res.length = 0;
  topsScratch = columnTops(b, topsScratch);
  const rotations = UNIQUE_ROTATIONS[type];

  for (let i = 0; i < rotations.length; i++) {
    const rotation = rotations[i];
    const cells = CELLS[type][rotation];
    const bounds = ROT_BOUNDS[type][rotation];
    const xMin = -bounds.minX;
    const xMax = COLS - 1 - bounds.maxX;

    for (let x = xMin; x <= xMax; x++) {
      let rest = ROWS;
      for (let c = 0; c < cells.length; c++) {
        const stop = topsScratch[x + cells[c].x] - 1 - cells[c].y;
        if (stop < rest) rest = stop;
      }
      // `rest` is the matrix origin, which may be negative (the piece can rest
      // against the very top row); only the actual cells have to be on-board.
      let minTop = ROWS;
      for (let c = 0; c < cells.length; c++) {
        const cellTop = rest + cells[c].y;
        if (cellTop < minTop) minTop = cellTop;
      }
      if (minTop < 0) continue;

      const spin = type === 6 ? tSpinKind(b, x, rest, rotation) : null;
      res.push({ type, rotation, x, y: rest, spin, kick: false });
    }
  }
  return res;
}

/**
 * Positions a piece can only reach by rotating underneath an overhang ("tucks").
 *
 * The model matches how a player actually does it and how the game's rotator
 * works: the piece descends in an upright orientation (A), then rotates into a
 * different orientation (B). If A cannot be reached by dropping at B's column
 * but A *can* be dropped somewhere near it, a real player performs a move +
 * rotate, so B is reachable. This is what makes T-spins and T-spin triples
 * playable as well as reachable.
 */
export function enumerateTucks(b: Board, type: number, drops: Placement[]): Placement[] {
  const out: Placement[] = [];
  // Only T pieces are spun into place in practice, and only T-spin clears carry
  // bonus attack in this game's table, so this is where the extra enumeration
  // earns its keep.
  if (type !== 6) return out;
  const rotations = UNIQUE_ROTATIONS[type];

  // Occupied cells after the piece is placed are still "empty" for reachability,
  // so tuck checks run against a board with the piece's own cells cleared.
  const scratch = new Uint8Array(b);
  const tops = new Uint8Array(COLS);
  const seen = new Set<number>();
  const dropKeys = new Set<number>();
  for (const d of drops) dropKeys.add(((d.rotation * 32) + (d.x + 8)) * 32 + d.y);

  for (let i = 0; i < rotations.length; i++) {
    const rotB = rotations[i];
    const cellsB = CELLS[type][rotB];
    const boundsB = ROT_BOUNDS[type][rotB];
    const xMin = -boundsB.minX;
    const xMax = COLS - 1 - boundsB.maxX;

    for (let xB = xMin; xB <= xMax; xB++) {
      // yB = resting row of the piece in rotation B (from the drop list, so any
      // position the piece can simply fall into is already handled).
      // We look for positions *below* the plain drop line, i.e. inside a notch.
      for (let yB = 0; yB < ROWS; yB++) {
        if (collidesCells(b, cellsB, xB, yB)) continue;
        if (!collidesCells(b, cellsB, xB, yB + 1)) continue; // must rest here
        let minY = ROWS;
        for (const c of cellsB) if (yB + c.y < minY) minY = yB + c.y;
        if (minY < 0) continue;

        const key = ((rotB * 32) + (xB + 8)) * 32 + yB;
        if (seen.has(key)) continue;

        // Is this reachable by a plain drop? If so it is not a tuck.
        if (dropKeys.has(key)) continue;

        // Build the board without the piece, then look for an upright drop of the
        // piece near this column that could rotate into place.
        scratch.set(b);
        for (const c of cellsB) {
          const by = yB + c.y;
          const bx = xB + c.x;
          scratch[by * COLS + bx] = 0;
        }
        columnTops(scratch, tops);

        let reachable = false;
        for (let j = 0; j < rotations.length && !reachable; j++) {
          const rotA = rotations[j];
          if (rotA === rotB) continue;
          const cellsA = CELLS[type][rotA];
          const boundsA = ROT_BOUNDS[type][rotA];
          for (let xA = xB - 2; xA <= xB + 2 && !reachable; xA++) {
            if (xA + boundsA.minX < 0 || xA + boundsA.maxX >= COLS) continue;
            let rest = ROWS;
            for (let c = 0; c < cellsA.length; c++) {
              const stop = tops[xA + cellsA[c].x] - 1 - cellsA[c].y;
              if (stop < rest) rest = stop;
            }
            if (rest < 0) continue;
            // The upright piece must be able to sit at or above this height.
            if (rest > yB + boundsB.maxY) continue;
            if (Math.abs(rest - yB) > 4) continue;
            reachable = true;
          }
        }
        if (!reachable) continue;

        seen.add(key);
        const spin = type === 6 ? tSpinKind(b, xB, yB, rotB) : null;
        out.push({ type, rotation: rotB, x: xB, y: yB, spin, kick: true });
      }
    }
  }
  return out;
}

/**
 * Every resting placement for `type`. Pass `spins` to also get the tuck
 * positions that require a rotation kick (T-spin slots).
 */
export function enumeratePlacements(b: Board, type: number, spins = false): Placement[] {
  const drops = enumerateDrops(b, type);
  if (!spins) return drops;
  const tucks = enumerateTucks(b, type, drops);
  for (let i = 0; i < tucks.length; i++) drops.push(tucks[i]);
  return drops;
}

/* ------------------------------------------------------------------ */
/* Simulation                                                          */
/* ------------------------------------------------------------------ */

export interface SimResult {
  board: Board;
  lines: number;
  clearRows: number[];
  perfectClear: boolean;
  spin: SpinType;
  /** piece cells that were removed by the clear */
  eroded: number;
  /** height the piece landed at (rows above the floor) */
  landingHeight: number;
}

export function simulate(b: Board, p: Placement): SimResult {
  const cells = CELLS[p.type][p.rotation & 3];
  const nb = new Uint8Array(b);
  let lowest = 0;
  let highest = ROWS;
  for (let i = 0; i < cells.length; i++) {
    const by = p.y + cells[i].y;
    const bx = p.x + cells[i].x;
    nb[by * COLS + bx] = p.type;
    if (by > lowest) lowest = by;
    if (by < highest) highest = by;
  }

  const clearRows: number[] = [];
  for (let y = highest; y <= lowest; y++) {
    const base = y * COLS;
    let full = true;
    for (let x = 0; x < COLS; x++) {
      if (nb[base + x] === 0) {
        full = false;
        break;
      }
    }
    if (full) clearRows.push(y);
  }

  // Rows above the floor of the piece's lowest cell (1 = resting on the floor).
  const landingHeight = ROWS - lowest;

  if (clearRows.length === 0) {
    let empty = true;
    for (let i = 0; i < nb.length; i++) {
      if (nb[i] !== 0) {
        empty = false;
        break;
      }
    }
    return {
      board: nb,
      lines: 0,
      clearRows,
      perfectClear: empty,
      spin: p.spin,
      eroded: 0,
      landingHeight,
    };
  }

  let eroded = 0;
  for (let i = 0; i < cells.length; i++) {
    const by = p.y + cells[i].y;
    if (clearRows.indexOf(by) >= 0) eroded++;
  }

  const out = new Uint8Array(COLS * ROWS);
  let write = ROWS - 1;
  let fullMask = 0;
  for (const y of clearRows) fullMask |= 1 << y;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (fullMask & (1 << y)) continue;
    const src = y * COLS;
    const dst = write * COLS;
    for (let x = 0; x < COLS; x++) out[dst + x] = nb[src + x];
    write--;
  }

  let empty = true;
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== 0) {
      empty = false;
      break;
    }
  }

  return {
    board: out,
    lines: clearRows.length,
    clearRows,
    perfectClear: empty,
    spin: p.spin,
    eroded,
    landingHeight,
  };
}

/** Removes any complete rows (used after garbage is added). */
export function clearFullRows(b: Board): { board: Board; lines: number } {
  const nb = new Uint8Array(b);
  let lines = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    let full = true;
    for (let x = 0; x < COLS; x++) {
      if (nb[y * COLS + x] === 0) {
        full = false;
        break;
      }
    }
    if (!full) continue;
    lines++;
    for (let yy = y; yy > 0; yy--) {
      const dst = yy * COLS;
      const src = (yy - 1) * COLS;
      for (let x = 0; x < COLS; x++) nb[dst + x] = nb[src + x];
    }
    for (let x = 0; x < COLS; x++) nb[x] = 0;
    y++;
  }
  return { board: nb, lines };
}

/** Rows a placement would clear, without building the resulting board. */
export function linesClearedBy(b: Board, p: Placement): number {
  const cells = CELLS[p.type][p.rotation & 3];
  const rowMask = new Map<number, number>();
  for (let i = 0; i < cells.length; i++) {
    const by = p.y + cells[i].y;
    if (by < 0 || by >= ROWS) continue;
    rowMask.set(by, (rowMask.get(by) ?? 0) | (1 << (p.x + cells[i].x)));
  }
  let lines = 0;
  for (const [row, mask] of rowMask) {
    const base = row * COLS;
    let full = true;
    for (let x = 0; x < COLS; x++) {
      if (mask & (1 << x)) continue;
      if (b[base + x] === 0) {
        full = false;
        break;
      }
    }
    if (full) lines++;
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* Board features                                                      */
/* ------------------------------------------------------------------ */

export interface Features {
  heights: number[];
  aggregateHeight: number;
  maxHeight: number;
  bumpiness: number;
  holes: number;
  holeDepth: number;
  rowTransitions: number;
  colTransitions: number;
  /** cumulative depth of every 1-wide well (Dellacherie "well sums") */
  wellSums: number;
  rowHoles: number;
  /** rows that are completely empty */
  emptyRows: number;
  /** filled cells beside/reachable: use for PC readiness checks */
  filled: number;
}

/**
 * Every board feature in one fused pass. This is the inner loop of the whole AI,
 * so it allocates only the heights array (reusable via `heightsOut`).
 */
export function computeFeatures(b: Board, heightsOut?: number[]): Features {
  const heights = heightsOut ?? new Array<number>(COLS).fill(0);

  let aggregateHeight = 0;
  let maxHeight = 0;
  let bumpiness = 0;
  let holes = 0;
  let holeDepth = 0;
  let filled = 0;
  let emptyRows = 0;
  let rowHoles = 0;

  for (let x = 0; x < COLS; x++) {
    let top = ROWS;
    let covered = false;
    let depth = 0;
    for (let y = 0; y < ROWS; y++) {
      const v = b[y * COLS + x];
      if (v !== 0) {
        if (top === ROWS) top = y;
        covered = true;
        depth = 0;
        filled++;
      } else if (covered) {
        holes++;
        depth++;
        holeDepth += depth;
      }
    }
    heights[x] = ROWS - top;
    aggregateHeight += heights[x];
    if (heights[x] > maxHeight) maxHeight = heights[x];
  }

  for (let x = 0; x < COLS - 1; x++) {
    bumpiness += Math.abs(heights[x] - heights[x + 1]);
  }

  // Row transitions walk each row including the walls as filled.
  let rowTransitions = 0;
  for (let y = 0; y < ROWS; y++) {
    const base = y * COLS;
    let prev = 1;
    let rowFilled = 0;
    let rowHasHole = false;
    for (let x = 0; x < COLS; x++) {
      const cur = b[base + x] !== 0 ? 1 : 0;
      if (cur !== prev) rowTransitions++;
      prev = cur;
      if (cur) rowFilled++;
    }
    if (prev !== 1) rowTransitions++;
    if (rowFilled === 0) emptyRows++;
    // A hole in this row is an empty cell with something above it.
    if (rowFilled > 0 && rowFilled < COLS) {
      for (let x = 0; x < COLS; x++) {
        if (b[base + x] === 0 && heights[x] > ROWS - y) {
          rowHasHole = true;
          break;
        }
      }
    }
    if (rowHasHole) rowHoles++;
  }

  // Column transitions walk each column including the floor as filled.
  let colTransitions = 0;
  for (let x = 0; x < COLS; x++) {
    let prev = 0;
    for (let y = 0; y < ROWS; y++) {
      const cur = b[y * COLS + x] !== 0 ? 1 : 0;
      if (cur !== prev) colTransitions++;
      prev = cur;
    }
    if (prev !== 1) colTransitions++;
  }

  // Wells: empty cells with both horizontal neighbours filled (walls count).
  // Only "covered" wells count, because an open notch is a useful tetris well.
  let wellSums = 0;
  for (let x = 0; x < COLS; x++) {
    if (heights[x] >= ROWS) continue;
    const leftH = x === 0 ? ROWS : heights[x - 1];
    const rightH = x === COLS - 1 ? ROWS : heights[x + 1];
    const sideMin = Math.min(leftH, rightH);
    if (sideMin <= heights[x]) continue;
    wellSums += sideMin - heights[x];
  }

  return {
    heights,
    aggregateHeight,
    maxHeight,
    bumpiness,
    holes,
    holeDepth,
    rowTransitions,
    colTransitions,
    wellSums,
    rowHoles,
    emptyRows,
    filled,
  };
}

/**
 * Best number of lines a T piece could clear right now with a spin. Used to
 * reward boards that hold a ready T-spin double / triple slot. Works on row
 * bitmasks, so the scan allocates nothing.
 */
const ROW_MASKS = new Int32Array(ROWS);
const FULL_ROW = (1 << COLS) - 1;

export function bestTSpinClear(b: Board): number {
  const rows = ROW_MASKS;
  for (let y = 0; y < ROWS; y++) {
    let mask = 0;
    const base = y * COLS;
    for (let x = 0; x < COLS; x++) if (b[base + x] !== 0) mask |= 1 << x;
    rows[y] = mask;
  }
  const rotations = UNIQUE_ROTATIONS[6];
  let best = 0;
  const limit = Math.min(ROWS, maxHeightOf(b) + 3);
  for (let i = 0; i < rotations.length; i++) {
    const rotation = rotations[i];
    const cells = CELLS[6][rotation];
    // A T never spans more than three rows, so only those are interesting.
    for (let x = -1; x < COLS + 1; x++) {
      for (let y = Math.max(0, limit - 6); y < limit; y++) {
        if (collidesCells(b, cells, x, y)) continue;
        if (!collidesCells(b, cells, x, y + 1)) continue;
        if (!tSpinKind(b, x, y, rotation)) continue;
        let m0 = 0, m1 = 0, m2 = 0;
        for (let c = 0; c < cells.length; c++) {
          const bit = 1 << (x + cells[c].x);
          const cy = cells[c].y;
          if (cy === 0) m0 |= bit;
          else if (cy === 1) m1 |= bit;
          else m2 |= bit;
        }
        let lines = 0;
        if (y < ROWS && (rows[y] | m0) === FULL_ROW) lines++;
        if (y + 1 < ROWS && (rows[y + 1] | m1) === FULL_ROW) lines++;
        if (y + 2 < ROWS && (rows[y + 2] | m2) === FULL_ROW) lines++;
        if (lines > best) best = lines;
        if (best >= 3) return best;
      }
    }
  }
  return best;
}

/**
 * How usable a tetris well is right now.
 *
 * An I piece dropped into `column` comes to rest in the four empty cells directly
 * above the first filled cell of that column, so it can only make a tetris if
 * *those four rows* are complete everywhere except the well. That is the whole
 * point of a well: everything the player does around it is filling those rows.
 *
 * `rowsReady` counts the rows in that window that are already complete except
 * for the well column, i.e. exactly how close the next I piece is to a tetris.
 */
export interface WellInfo {
  /** depth of the notch relative to its neighbours */
  depth: number;
  /** rows of the I-piece window already complete except for the well column */
  rowsReady: number;
  /** rows in the I-piece window (4 normally, fewer at the very top) */
  rowsInWindow: number;
  /** first filled row of the column (ROWS when empty) */
  top: number;
}

export function wellInfo(b: Board, column: number, tops?: Uint8Array): WellInfo {
  const t = tops ?? columnTops(b);
  const top = t[column];
  const heights = new Array<number>(COLS);
  for (let x = 0; x < COLS; x++) heights[x] = ROWS - t[x];
  const neighbour = column === 0 ? heights[1] : heights[COLS - 2];
  const depth = Math.max(0, neighbour - heights[column]);

  const windowTop = Math.max(0, top - 4);
  let rowsReady = 0;
  for (let y = windowTop; y < top; y++) {
    const base = y * COLS;
    let full = true;
    for (let x = 0; x < COLS; x++) {
      if (x === column) continue;
      if (b[base + x] === 0) {
        full = false;
        break;
      }
    }
    if (full) rowsReady++;
  }
  return { depth, rowsReady, rowsInWindow: top - windowTop, top };
}

/**
 * The column this AI should keep its well in.
 *
 * Players do not keep a fixed well for ever, but they do not move it every piece
 * either: moving it wastes everything already built around it. So the current
 * well is kept while it is still usable (it is a low spot next to the stack), and
 * a new one is only chosen when the old one has been buried or the stack has
 * become so uneven that finishing rows elsewhere is far easier.
 */
export interface WellChoice {
  column: number;
  /** true when the choice moved away from `current` */
  switched: boolean;
}

export function chooseWellColumn(
  b: Board,
  preferred: number,
  current = -1,
): WellChoice {
  const heights = columnHeights(b);
  const neighbourOf = (x: number) =>
    x === 0 ? heights[1] : x === COLS - 1 ? heights[COLS - 2] : Math.max(heights[x - 1], heights[x + 1]);
  const usable = (x: number) => heights[x] <= 3 && heights[x] <= neighbourOf(x);

  // Keep the well we already have whenever it is still a well.
  if (current >= 0 && usable(current)) return { column: current, switched: false };

  // A tetris well lives on an edge: an I piece cannot fill a middle column
  // without splitting the stack in two, so the choice is only ever left or right.
  const candidates = [preferred, COLS - 1 - preferred].filter(
    (x, i, a) => x >= 0 && x < COLS && a.indexOf(x) === i && usable(x),
  );
  if (!candidates.length) return { column: -1, switched: current !== -1 };

  const score = (x: number) => {
    const info = wellInfo(b, x);
    const habitual = x === preferred ? 6 : 0;
    const empty = heights[x] === 0 ? 4 : 0;
    return info.rowsReady * 10 + Math.min(info.depth, 4) + habitual + empty;
  };
  let best = candidates[0];
  for (const x of candidates) if (score(x) > score(best)) best = x;
  return { column: best, switched: best !== current };
}

/** Attack (garbage lines) the game would send for this clear. */
export function attackFor(
  lines: number,
  spin: SpinType,
  b2b: number,
  combo: number,
  perfectClear: boolean,
): number {
  return calculateGarbage(lines, spin, b2b, Math.max(0, combo), perfectClear);
}

/** Difficulty strings are user-editable, so normalise defensively. */
export function clampDifficultySafe(d: string): 'easy' | 'medium' | 'hard' | 'expert' {
  return d === 'easy' || d === 'medium' || d === 'hard' || d === 'expert' ? d : 'medium';
}


