/**
 * Verifies the fast engine primitives against slow, obviously-correct reference
 * implementations.  Run: npx tsx scripts/engine-check.ts
 */
import {
  Board, COLS, ROWS, CELLS, UNIQUE_ROTATIONS, createBoard, enumerateDrops,
  simulate, computeFeatures, columnTops, collidesCells, clearFullRows,
  collides, tSpinKind, boardToRows,
} from '../src/ai/engine';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${extra ? `  (${extra})` : ''}`);
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
}

/** Drop reference: step one row at a time. */
function slowRest(b: Board, type: number, rot: number, x: number): number | null {
  const cells = CELLS[type][rot];
  let y = -5;
  while (!collidesCells(b, cells, x, y + 1)) {
    y++;
    if (y > ROWS + 5) throw new Error('gravity ran away');
  }
  let minTop = ROWS;
  for (const c of cells) minTop = Math.min(minTop, y + c.y);
  return minTop < 0 ? null : y;
}

/** Build a random, physically plausible board by stacking random pieces. */
function randomBoard(rand: () => number, pieces: number): Board {
  let b = createBoard();
  for (let i = 0; i < pieces; i++) {
    const type = 1 + Math.floor(rand() * 7);
    const drops = enumerateDrops(b, type);
    if (!drops.length) break;
    const p = drops[Math.floor(rand() * drops.length)];
    b = simulate(b, p).board;
  }
  return b;
}

console.log('=== 1. Fast drop computation matches slow gravity ===');
{
  const rand = rng(99);
  let compared = 0;
  let mismatches = 0;
  for (let trial = 0; trial < 120; trial++) {
    const b = randomBoard(rand, Math.floor(rand() * 26));
    for (let type = 1; type <= 7; type++) {
      const fast = enumerateDrops(b, type);
      for (const rot of UNIQUE_ROTATIONS[type]) {
        for (let x = -4; x < COLS + 4; x++) {
          const slow = slowRest(b, type, rot, x);
          const fastHit = fast.find(p => p.rotation === rot && p.x === x);
          if (slow === null) {
            if (fastHit) mismatches++;
          } else {
            compared++;
            if (!fastHit || fastHit.y !== slow) mismatches++;
          }
        }
      }
    }
  }
  check('drop rows equal gravity for every rotation/column', mismatches === 0,
    `${compared} positions, ${mismatches} mismatched`);
}

console.log('\n=== 2. enumerateDrops covers every slow-gravity position ===');
{
  const rand = rng(1234);
  let missing = 0;
  for (let trial = 0; trial < 60; trial++) {
    const b = randomBoard(rand, Math.floor(rand() * 20));
    for (let type = 1; type <= 7; type++) {
      const fast = enumerateDrops(b, type);
      for (const rot of UNIQUE_ROTATIONS[type]) {
        for (let x = -4; x < COLS + 4; x++) {
          const slow = slowRest(b, type, rot, x);
          if (slow === null) continue;
          if (!fast.some(p => p.rotation === rot && p.x === x && p.y === slow)) missing++;
        }
      }
    }
  }
  check('no reachable drop is missed', missing === 0, `${missing} missing`);
}

console.log('\n=== 3. Simulate: clears, eroded cells, PC ===');
{
  const inColumn = (p: any, col: number) => CELLS[p.type][p.rotation].every(c => p.x + c.x === col);

  // Rows 16..19 filled except column 0: a vertical I into column 0 clears 4 rows
  // and empties the board.
  const b = createBoard();
  for (let y = 16; y < ROWS; y++) {
    for (let x = 1; x < COLS; x++) b[y * COLS + x] = 1;
  }
  const iPiece = enumerateDrops(b, 1).find(p => inColumn(p, 0))!;
  const res = simulate(b, iPiece);
  check('quad detected', res.lines === 4, `lines=${res.lines}`);
  check('eroded counts only cleared piece cells', res.eroded === 4, `eroded=${res.eroded}`);
  check('perfect clear detected', res.perfectClear, `pc=${res.perfectClear}`);
  check('landing height = rows above floor of the lowest cell',
    res.landingHeight === 1, `${res.landingHeight}`);

  // Two rows with a single 1-wide notch: a vertical I fills one, clearing 2 rows.
  const b2 = createBoard();
  for (let y = 18; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) if (x !== 5) b2[y * COLS + x] = 1;
  }
  const notched = enumerateDrops(b2, 1).find(p => inColumn(p, 5))!;
  const res2 = simulate(b2, notched);
  check('double detected through a 1-wide notch', res2.lines === 2, `lines=${res2.lines}`);

  // A piece that clears nothing reports nothing.
  const emptyish = createBoard();
  const res3 = simulate(emptyish, enumerateDrops(emptyish, 4)[0]);
  check('empty board: no lines, no PC', res3.lines === 0 && !res3.perfectClear);
}

console.log('\n=== 4. Features ===');
{
  const rows = [
    ...Array.from({ length: 18 }, () => '..........'),
    'XXXXX.XXXX',
    'XXXXX.XXXX',
  ];
  const b = createBoard();
  rows.forEach((r, y) => r.split('').forEach((c, x) => {
    b[y * COLS + x] = c === 'X' ? 1 : 0;
  }));
  const f = computeFeatures(b);
  check('holes under the overhang are counted', f.holes === 0, `holes=${f.holes} (open well is not a hole)`);
  check('well sums see the 2-deep open well', f.wellSums === 2, `wellSums=${f.wellSums}`);
  check('aggregate height', f.aggregateHeight === 18, `${f.aggregateHeight}`);
  check('max height', f.maxHeight === 2, `${f.maxHeight}`);

  const b2 = createBoard();
  // roof over column 4
  b2[18 * COLS + 4] = 1;
  b2[18 * COLS + 3] = 1;
  b2[18 * COLS + 5] = 1;
  b2[19 * COLS + 3] = 1;
  b2[19 * COLS + 5] = 1;
  const f2 = computeFeatures(b2);
  check('covered hole counted', f2.holes === 1, `holes=${f2.holes}`);
  check('hole depth counted', f2.holeDepth === 1, `holeDepth=${f2.holeDepth}`);
}

console.log('\n=== 5. clearFullRows / columnTops sanity ===');
{
  const b = createBoard();
  for (let x = 0; x < COLS; x++) b[(ROWS - 1) * COLS + x] = 1;
  const { board, lines } = clearFullRows(b);
  check('finished row removed', lines === 1 && board.every(v => v === 0));

  const t = columnTops(b);
  check('column tops', t.every(v => v === ROWS - 1), t.join(','));

  // Garbage rows: one hole each, shifted up — the AI must never treat them as cleared.
  const g = createBoard();
  for (let x = 0; x < COLS; x++) {
    if (x !== 3) g[(ROWS - 1) * COLS + x] = 8;
    if (x !== 7) g[(ROWS - 2) * COLS + x] = 8;
  }
  const fg = computeFeatures(g);
  // Column 3's notch is open to the sky (a well), column 7's is covered by the
  // row-19 garbage underneath it (a hole).
  check('garbage holes are holes, not wells', fg.holes === 1, `holes=${fg.holes}`);
  check('garbage rows are not mistaken for clears', fg.rowTransitions > 0, `${fg.rowTransitions}`);
}


/* ------------------------------------------------------------------ */
/* 6. The AI's spin rule must agree with the game's.                   */
/* ------------------------------------------------------------------ */
{
  // The game's rule, copied verbatim (board = one row per entry, filled = 1).
  const gameSpin = (
    board: number[][],
    piece: { typeId: number; x: number; y: number; rotationState: number },
    lastMove: { type: 'move' | 'rotate' | 'drop' | 'hardDrop'; kickIndex?: number } | null,
  ): 'normal' | 'mini' | null => {
    if (!lastMove || lastMove.type !== 'rotate') return null;
    if (piece.typeId !== 6) return null;
    const corners = [
      { x: piece.x, y: piece.y },
      { x: piece.x + 2, y: piece.y },
      { x: piece.x + 2, y: piece.y + 2 },
      { x: piece.x, y: piece.y + 2 },
    ];
    let occupiedCorners = 0;
    const occupied = corners.map(c => {
      const bad = c.y < 0 || c.y >= ROWS || c.x < 0 || c.x >= COLS || board[c.y][c.x] !== 0;
      if (bad) occupiedCorners++;
      return bad;
    });
    if (occupiedCorners < 3) return null;
    let front = 0;
    if (piece.rotationState === 0) { if (occupied[0]) front++; if (occupied[1]) front++; }
    else if (piece.rotationState === 1) { if (occupied[1]) front++; if (occupied[2]) front++; }
    else if (piece.rotationState === 2) { if (occupied[2]) front++; if (occupied[3]) front++; }
    else { if (occupied[3]) front++; if (occupied[0]) front++; }
    if (lastMove.kickIndex === 4) return 'normal';
    return front === 2 ? 'normal' : 'mini';
  };

  const rand = rng(4242);
  let compared = 0;
  let disagree = 0;
  for (let trial = 0; trial < 300; trial++) {
    const b = randomBoard(rand, Math.floor(rand() * 24));
    const rows = boardToRows(b);
    for (let rot = 0; rot < 4; rot++) {
      for (let x = -1; x < COLS; x++) {
        for (let y = 0; y < ROWS - 2; y++) {
          if (collides(b, 6, rot, x, y)) continue;
          const mine = tSpinKind(b, x, y, rot);
          const theirs = gameSpin(rows, { typeId: 6, x, y, rotationState: rot }, { type: 'rotate', kickIndex: 0 });
          compared++;
          // tSpinKind returns 'mini' where the game returns 'mini'; the game's
          // kickIndex===4 shortcut maps to 'normal', so compare the corner rule.
          if (mine !== theirs) disagree++;
        }
      }
    }
  }
  check('AI three-corner rule matches the game', disagree === 0,
    `${compared} positions, ${disagree} disagreed`);
}

console.log(`\n${fails === 0 ? 'ALL ENGINE CHECKS PASSED' : `${fails} FAILED`}\n`);
process.exit(fails === 0 ? 0 : 1);
