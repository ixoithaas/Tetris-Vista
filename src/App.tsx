import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, RotateCcw, Settings, X, Download, Upload } from 'lucide-react';
import { calculateGarbage } from './attackTable';

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;

const SHAPES = [
  [],
  [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]], // I
  [[2,0,0], [2,2,2], [0,0,0]], // J
  [[0,0,3], [3,3,3], [0,0,0]], // L
  [[4,4], [4,4]], // O
  [[0,5,5], [5,5,0], [0,0,0]], // S
  [[0,6,0], [6,6,6], [0,0,0]], // T
  [[7,7,0], [0,7,7], [0,0,0]]  // Z
];

const COLORS = [
  'transparent',
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#f97316', // orange-500
  '#eab308', // yellow-500
  '#22c55e', // green-500
  '#a855f7', // purple-500
  '#ef4444', // red-500
  '#64748b'  // slate-500 (garbage)
];

const DEFAULT_KEYBINDINGS = {
  moveLeft: 'ArrowLeft',
  moveRight: 'ArrowRight',
  softDrop: 'ArrowDown',
  hardDrop: ' ',
  rotate: 'ArrowUp',
  rotateAntiClockwise: 'z',
  rotate180: 'a',
  hold: 'c'
};

const DEFAULT_GAMEPAD_BINDINGS = {
  moveLeft: 14, // D-pad Left
  moveRight: 15, // D-pad Right
  softDrop: 13, // D-pad Down
  hardDrop: 12, // D-pad Up
  rotate: 0,    // A / Cross
  rotateAntiClockwise: 2, // X / Square
  rotate180: 3, // Y / Triangle
  hold: 4       // L1 / LB
};

const DEFAULT_HANDLING = {
  das: 150,
  arr: 20,
  dcd: 0,
  sdf: 20,
  randomizer: '7-bag'
};

const KICK_DATA_JLSTZ: Record<string, {x: number, y: number}[]> = {
  '0->1': [{x:0,y:0}, {x:-1,y:0}, {x:-1,y:-1}, {x:0,y:2}, {x:-1,y:2}],
  '1->0': [{x:0,y:0}, {x:1,y:0}, {x:1,y:1}, {x:0,y:-2}, {x:1,y:-2}],
  '1->2': [{x:0,y:0}, {x:1,y:0}, {x:1,y:1}, {x:0,y:-2}, {x:1,y:-2}],
  '2->1': [{x:0,y:0}, {x:-1,y:0}, {x:-1,y:-1}, {x:0,y:2}, {x:-1,y:2}],
  '2->3': [{x:0,y:0}, {x:1,y:0}, {x:1,y:-1}, {x:0,y:2}, {x:1,y:2}],
  '3->2': [{x:0,y:0}, {x:-1,y:0}, {x:-1,y:1}, {x:0,y:-2}, {x:-1,y:-2}],
  '3->0': [{x:0,y:0}, {x:-1,y:0}, {x:-1,y:1}, {x:0,y:-2}, {x:-1,y:-2}],
  '0->3': [{x:0,y:0}, {x:1,y:0}, {x:1,y:-1}, {x:0,y:2}, {x:1,y:2}],
};

const KICK_DATA_I: Record<string, {x: number, y: number}[]> = {
  '0->1': [{x:0,y:0}, {x:-2,y:0}, {x:1,y:0}, {x:-2,y:1}, {x:1,y:-2}],
  '1->0': [{x:0,y:0}, {x:2,y:0}, {x:-1,y:0}, {x:2,y:-1}, {x:-1,y:2}],
  '1->2': [{x:0,y:0}, {x:-1,y:0}, {x:2,y:0}, {x:-1,y:-2}, {x:2,y:1}],
  '2->1': [{x:0,y:0}, {x:1,y:0}, {x:-2,y:0}, {x:1,y:2}, {x:-2,y:-1}],
  '2->3': [{x:0,y:0}, {x:2,y:0}, {x:-1,y:0}, {x:2,y:-1}, {x:-1,y:2}],
  '3->2': [{x:0,y:0}, {x:-2,y:0}, {x:1,y:0}, {x:-2,y:1}, {x:1,y:-2}],
  '3->0': [{x:0,y:0}, {x:1,y:0}, {x:-2,y:0}, {x:1,y:2}, {x:-2,y:-1}],
  '0->3': [{x:0,y:0}, {x:-1,y:0}, {x:2,y:0}, {x:-1,y:-2}, {x:2,y:1}],
};

const KICK_DATA_180: Record<string, {x: number, y: number}[]> = {
  '0->2': [{x:0,y:0}, {x:0,y:1}, {x:1,y:1}, {x:-1,y:1}, {x:1,y:0}, {x:-1,y:0}],
  '1->3': [{x:0,y:0}, {x:1,y:0}, {x:1,y:2}, {x:1,y:1}, {x:0,y:2}, {x:0,y:1}],
  '2->0': [{x:0,y:0}, {x:0,y:-1}, {x:-1,y:-1}, {x:1,y:-1}, {x:-1,y:0}, {x:1,y:0}],
  '3->1': [{x:0,y:0}, {x:-1,y:0}, {x:-1,y:2}, {x:-1,y:1}, {x:0,y:2}, {x:0,y:1}],
};

const rotateMatrix = (matrix: number[][], dir: number) => {
  const N = matrix.length;
  if (dir === 1) {
    return matrix.map((row, i) =>
      row.map((val, j) => matrix[N - 1 - j][i])
    );
  } else if (dir === -1) {
    return matrix.map((row, i) =>
      row.map((val, j) => matrix[j][N - 1 - i])
    );
  } else if (dir === 2) {
    return matrix.map((row, i) =>
      row.map((val, j) => matrix[N - 1 - i][N - 1 - j])
    );
  }
  return matrix;
};

function evaluateBoard(board: number[][], difficulty: 'easy' | 'medium' | 'hard') {
  let aggregateHeight = 0;
  let holes = 0;
  let bumpiness = 0;
  let maxHeight = 0;
  let coveredCells = 0;
  
  const heights = new Array(COLS).fill(0);
  
  for (let x = 0; x < COLS; x++) {
    let blockSeen = false;
    let colHoles = 0;
    for (let y = 0; y < ROWS; y++) {
      if (board[y][x] !== 0) {
        if (!blockSeen) {
          heights[x] = ROWS - y;
          maxHeight = Math.max(maxHeight, heights[x]);
          blockSeen = true;
        }
      } else {
        if (blockSeen) {
          colHoles++;
          holes++;
        }
      }
    }
    if (colHoles > 0) {
      // The number of blocks covering the holes in this column
      let blocksAboveHoles = heights[x] - colHoles;
      coveredCells += blocksAboveHoles;
    }
  }

  let highestWellDepth = 0;
  
  for (let x = 0; x < COLS; x++) {
    aggregateHeight += heights[x];
    
    if (x < COLS - 1) {
      bumpiness += Math.abs(heights[x] - heights[x + 1]);
    }
  }
  
  if (difficulty === 'easy') {
    return -0.8 * aggregateHeight - 0.1 * holes;
  }
  
  if (difficulty === 'medium') {
    return -0.510066 * aggregateHeight - 0.35663 * holes - 0.184483 * bumpiness;
  }
  
  // 'hard' difficulty
  
  let score = 0;
  score -= aggregateHeight * 5;
  score -= holes * 3500; // Increased penalization for bad building causing holes
  score -= coveredCells * 400; // Increased penalization for placing things over holes making them inaccessible
  score -= bumpiness * 20;
  
  let maxH = 0;
  let minH = ROWS;
  for (let x = 0; x < COLS; x++) {
      if (heights[x] > maxH) maxH = heights[x];
      // Exclude edge wells from minH calculation if they are intentionally deep
      if ((x === 0 || x === COLS - 1) && heights[x] < minH) {
          // Check if it's a valid well
          let isWell = true;
          if (x===0 && heights[1] <= heights[0]) isWell = false;
          if (x===COLS-1 && heights[COLS-2] <= heights[COLS-1]) isWell = false;
          if (!isWell) minH = Math.min(minH, heights[x]);
      } else {
          minH = Math.min(minH, heights[x]);
      }
      
      let leftHeight = x === 0 ? ROWS : heights[x - 1];
      let rightHeight = x === COLS - 1 ? ROWS : heights[x + 1];
      if (leftHeight > heights[x] && rightHeight > heights[x]) {
         let depth = Math.min(leftHeight, rightHeight) - heights[x];
         if (x === 0 || x === COLS - 1) {
            // Only reward edge wells for tetrises
            highestWellDepth = Math.max(highestWellDepth, depth);
         } else {
            if (depth >= 3) {
               // Highly penalize I-dependencies / 2-wide dependencies in the middle of the board
               score -= depth * 800; // Drastic penalty for deep internal dependencies
            } else {
               // Normal bumpiness penalty for middle holes
               score -= depth * 40;
            }
         }
      }
  }

  // Punish an uneven board (discounting intentional edge well)
  if (maxH - minH > 4) {
      score -= (maxH - minH) * 15 * (maxH / 10);
  }
  
  if (maxHeight > 12) {
     score -= Math.pow(maxHeight - 12, 2) * 50; 
  }

  if (highestWellDepth >= 3) {
     score += highestWellDepth * 60; // Strongly reward deep well for Tetrises
  }

  return score;
}

let audioCtx: AudioContext | null = null;
const getAudioCtx = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

const playTone = (frequency: number, type: OscillatorType, duration: number, vol = 0.1) => {
  try {
    const ctx = getAudioCtx();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    
    gainNode.gain.setValueAtTime(vol, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
  } catch (e) {
    console.error("Audio play failed", e);
  }
};

const playRotateSound = () => playTone(600, 'sine', 0.1, 0.05);
const playClearSound = () => {
  playTone(523.25, 'triangle', 0.1, 0.1);
  setTimeout(() => playTone(659.25, 'triangle', 0.1, 0.1), 100);
  setTimeout(() => playTone(783.99, 'triangle', 0.2, 0.1), 200);
};
const playGameOverSound = () => {
  playTone(300, 'sawtooth', 0.3, 0.1);
  setTimeout(() => playTone(280, 'sawtooth', 0.3, 0.1), 250);
  setTimeout(() => playTone(260, 'sawtooth', 0.5, 0.1), 500);
};

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function MiniPiece({ typeId, disabled = false }: { typeId: number, disabled?: boolean }) {
  if (!typeId) return null;
  const matrix = SHAPES[typeId];
  const color = COLORS[typeId];
  
  // Trim empty rows and columns for better centering
  let minX = matrix[0].length;
  let maxX = 0;
  let minY = matrix.length;
  let maxY = 0;
  
  matrix.forEach((row, y) => {
    row.forEach((val, x) => {
      if (val) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    });
  });

  const trimmedMatrix = [];
  for (let y = minY; y <= maxY; y++) {
    const row = [];
    for (let x = minX; x <= maxX; x++) {
      row.push(matrix[y][x]);
    }
    trimmedMatrix.push(row);
  }

  return (
    <div className={`flex flex-col ${disabled ? 'opacity-50 grayscale' : ''}`}>
      {trimmedMatrix.map((row, y) => (
        <div key={y} className="flex">
          {row.map((val, x) => (
            <div 
              key={x} 
              className="w-5 h-5 relative"
              style={{
                backgroundColor: val ? color : 'transparent',
                border: val ? '1px solid rgba(0,0,0,0.5)' : 'none',
              }}
            >
              {val ? (
                <>
                  <div className="absolute top-0 left-0 right-0 h-1/4 bg-white/20" />
                  <div className="absolute top-0 left-0 bottom-0 w-1/4 bg-white/20" />
                </>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const checkPerfectClear = (board: number[][]) => {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (board[y][x] !== 0) return false;
    }
  }
  return true;
};

const getSpinType = (
  board: number[][],
  piece: { typeId: number, x: number, y: number, rotationState: number },
  lastMove: { type: 'move' | 'rotate' | 'drop' | 'hardDrop', kickIndex?: number } | null
): 'normal' | 'mini' | null => {
  if (!lastMove || lastMove.type !== 'rotate') return null;

  if (piece.typeId === 6) { // T piece
    const corners = [
      { x: piece.x, y: piece.y },         // Top-left
      { x: piece.x + 2, y: piece.y },     // Top-right
      { x: piece.x + 2, y: piece.y + 2 }, // Bottom-right
      { x: piece.x, y: piece.y + 2 }      // Bottom-left
    ];

    let occupiedCorners = 0;
    const occupied = corners.map(c => {
      const isOccupied = c.y < 0 || c.y >= ROWS || c.x < 0 || c.x >= COLS || board[c.y][c.x] !== 0;
      if (isOccupied) occupiedCorners++;
      return isOccupied;
    });

    if (occupiedCorners < 3) return null;

    let frontCornersOccupied = 0;
    if (piece.rotationState === 0) {
      if (occupied[0]) frontCornersOccupied++;
      if (occupied[1]) frontCornersOccupied++;
    } else if (piece.rotationState === 1) {
      if (occupied[1]) frontCornersOccupied++;
      if (occupied[2]) frontCornersOccupied++;
    } else if (piece.rotationState === 2) {
      if (occupied[2]) frontCornersOccupied++;
      if (occupied[3]) frontCornersOccupied++;
    } else if (piece.rotationState === 3) {
      if (occupied[3]) frontCornersOccupied++;
      if (occupied[0]) frontCornersOccupied++;
    }

    if (lastMove.kickIndex === 4) return 'normal';
    if (frontCornersOccupied === 2) return 'normal';
    return 'mini';
  } else if ([1, 2, 3, 5, 7].includes(piece.typeId)) { // I, J, L, S, Z pieces
    if (lastMove.kickIndex && lastMove.kickIndex > 0) {
      return 'normal';
    }
  }
  return null;
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [score, setScore] = useState(0);
  const [p1Garbage, setP1Garbage] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'keyboard' | 'gamepad' | 'handling'>('keyboard');
  
  const [isAiEnabled, setIsAiEnabled] = useState(false);
  const isAiEnabledRef = useRef(isAiEnabled);
  useEffect(() => { isAiEnabledRef.current = isAiEnabled; }, [isAiEnabled]);
  
  const [aiPps, setAiPps] = useState(2); // Pieces per second
  const aiPpsRef = useRef(aiPps);
  useEffect(() => { aiPpsRef.current = aiPps; }, [aiPps]);
  
  const [aiDifficulty, setAiDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const aiDifficultyRef = useRef(aiDifficulty);
  useEffect(() => { aiDifficultyRef.current = aiDifficulty; }, [aiDifficulty]);
  
  const p1AiTargetRef = useRef<{x: number, y: number, rotation: number, lastMove: any} | null>(null);
  const p1AiTimerRef = useRef(0);

  const [keybindings, setKeybindings] = useState(DEFAULT_KEYBINDINGS);
  const [listeningKey, setListeningKey] = useState<string | null>(null);
  
  const [gamepadBindings, setGamepadBindings] = useState(DEFAULT_GAMEPAD_BINDINGS);
  const [listeningGamepadKey, setListeningGamepadKey] = useState<string | null>(null);
  
  const [handling, setHandling] = useState(DEFAULT_HANDLING);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pieceSequenceRef = useRef<number[]>([]);
  const p1PieceIndexRef = useRef<number>(0);
  const aiPieceIndexRef = useRef<number>(0);

  const nextPiecesRef = useRef<number[]>([]);
  const [nextPieces, setNextPieces] = useState<number[]>([]);
  
  const aiCanvasRef = useRef<HTMLCanvasElement>(null);
  const aiBoardRef = useRef<number[][]>(createEmptyBoard());
  const aiPieceRef = useRef<any>(null);
  const [aiScore, setAiScore] = useState(0);
  const [aiGarbage, setAiGarbage] = useState(0);
  const [aiGameOver, setAiGameOver] = useState(false);
  const aiGameOverRef = useRef(false);
  const aiNextPiecesRef = useRef<number[]>([]);
  const [aiNextPieces, setAiNextPieces] = useState<number[]>([]);
  
  const p1GarbageQueueRef = useRef<number>(0);
  const aiGarbageQueueRef = useRef<number>(0);
  
  const p1ComboRef = useRef<number>(-1);
  const p1B2bCounterRef = useRef<number>(0);
  const p1LastMoveRef = useRef<{ type: 'move' | 'rotate' | 'drop' | 'hardDrop', kickIndex?: number } | null>(null);
  
  const aiComboRef = useRef<number>(-1);
  const aiB2bCounterRef = useRef<number>(0);
  const aiLastMoveRef = useRef<{ type: 'move' | 'rotate' | 'drop' | 'hardDrop', kickIndex?: number } | null>(null);
  
  const p1ClearingLinesRef = useRef<{ y: number, blocks: number[], timer: number }[]>([]);
  const aiClearingLinesRef = useRef<{ y: number, blocks: number[], timer: number }[]>([]);
  
  const aiDropCounterRef = useRef<number>(0);
  const aiTargetRef = useRef<{x: number, y: number, rotation: number, lastMove: any} | null>(null);
  const aiTimerRef = useRef(0);
  
  const [heldPiece, setHeldPiece] = useState<number | null>(null);
  const [hasHeld, setHasHeld] = useState(false);
  const hasHeldRef = useRef(false);

  const setHasHeldBoth = useCallback((val: boolean) => {
    hasHeldRef.current = val;
    setHasHeld(val);
  }, []);
  
  const boardRef = useRef(createEmptyBoard());
  const pieceRef = useRef<{matrix: number[][], x: number, y: number, typeId: number, rotationState: number} | null>(null);
  const dropCounterRef = useRef(0);
  const lastTimeRef = useRef(0);
  const requestRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const dragOffsetXRef = useRef(0);
  const dragOffsetYRef = useRef(0);
  const lastGamepadStateRef = useRef<{ [key: string]: boolean }>({});
  
  const keysRef = useRef({ left: false, right: false, down: false });
  const activeDirRef = useRef<1 | -1 | 0>(0);
  const dasTimerRef = useRef(0);
  const arrTimerRef = useRef(0);
  const dcdTimerRef = useRef(0);
  
  const lockTimerRef = useRef(0);
  const lockResetsRef = useRef(0);
  const lowestYRef = useRef(0);

  const isPlayingRef = useRef(isPlaying);
  const gameOverRef = useRef(gameOver);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);

  const collide = useCallback((board: number[][], piece: {matrix: number[][], x: number, y: number}) => {
    const m = piece.matrix;
    for (let y = 0; y < m.length; ++y) {
      for (let x = 0; x < m[y].length; ++x) {
        if (m[y][x] !== 0 &&
           (board[y + piece.y] && board[y + piece.y][x + piece.x]) !== 0) {
          return true;
        }
      }
    }
    return false;
  }, []);

  const merge = useCallback((board: number[][], piece: {matrix: number[][], x: number, y: number}) => {
    piece.matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          if (board[y + piece.y]) {
            board[y + piece.y][x + piece.x] = value;
          }
        }
      });
    });
  }, []);

  const calculateBestMove = useCallback((board: number[][], piece: any, nextPieceTypeId: number, difficulty: 'easy' | 'medium' | 'hard', currentB2B: number = 0, currentCombo: number = -1) => {
    let bestScore = -Infinity;
    let bestMove = null;

    interface State {
      x: number;
      y: number;
      r: number;
      lastMove: { type: 'move' | 'rotate' | 'drop' | 'hardDrop', kickIndex?: number } | null;
    }

    const getValidPlacements = (simBoard: number[][], pieceTypeId: number, startX: number, startY: number, startR: number) => {
      const queue: State[] = [{ x: startX, y: startY, r: startR, lastMove: null }];
      const visited = new Set<string>();
      visited.add(`${startX},${startY},${startR}`);
      const placements: State[] = [];

      const checkCollision = (x: number, y: number, r: number) => {
        let matrix = SHAPES[pieceTypeId];
        for (let i = 0; i < r; i++) matrix = rotateMatrix(matrix, 1);
        return collide(simBoard, { matrix, x, y });
      };

      if (checkCollision(startX, startY, startR)) return [];

      let head = 0;
      while (head < queue.length) {
        const curr = queue[head++];

        if (checkCollision(curr.x, curr.y + 1, curr.r)) {
          placements.push(curr);
        }

        // Down
        if (!checkCollision(curr.x, curr.y + 1, curr.r)) {
          const key = `${curr.x},${curr.y + 1},${curr.r}`;
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ x: curr.x, y: curr.y + 1, r: curr.r, lastMove: { type: 'drop' } });
          }
        }
        // Left
        if (!checkCollision(curr.x - 1, curr.y, curr.r)) {
          const key = `${curr.x - 1},${curr.y},${curr.r}`;
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ x: curr.x - 1, y: curr.y, r: curr.r, lastMove: { type: 'move' } });
          }
        }
        // Right
        if (!checkCollision(curr.x + 1, curr.y, curr.r)) {
          const key = `${curr.x + 1},${curr.y},${curr.r}`;
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ x: curr.x + 1, y: curr.y, r: curr.r, lastMove: { type: 'move' } });
          }
        }
        // Rotate CW & CCW
        if (pieceTypeId !== 4) {
          for (const dir of [1, -1]) {
            const nextR = (curr.r + (dir === 1 ? 1 : 3)) % 4;
            const transition = `${curr.r}->${nextR}`;
            const kickData = pieceTypeId === 1 ? KICK_DATA_I[transition] : KICK_DATA_JLSTZ[transition];
            
            for (let i = 0; i < kickData.length; i++) {
              const kick = kickData[i];
              const nx = curr.x + kick.x;
              const ny = curr.y - kick.y;
              if (!checkCollision(nx, ny, nextR)) {
                const key = `${nx},${ny},${nextR}`;
                if (!visited.has(key)) {
                  visited.add(key);
                  queue.push({ x: nx, y: ny, r: nextR, lastMove: { type: 'rotate', kickIndex: i } });
                }
                break;
              }
            }
          }
        }
      }
      return placements;
    };

    const placements = getValidPlacements(board, piece.typeId, piece.x, piece.y, piece.rotationState);

    for (const p of placements) {
      let matrix = SHAPES[piece.typeId];
      for(let i=0; i<p.r; i++) matrix = rotateMatrix(matrix, 1);
      const testPiece = { matrix, x: p.x, y: p.y, typeId: piece.typeId, rotationState: p.r };
      
      const newBoard = board.map(row => [...row]);
      testPiece.matrix.forEach((row: number[], y: number) => {
        row.forEach((value: number, px: number) => {
          if (value !== 0 && newBoard[y + testPiece.y]) {
            newBoard[y + testPiece.y][px + testPiece.x] = value;
          }
        });
      });

      let linesCleared = 0;
      const simBoard = newBoard.map(row => [...row]);
      for (let y = ROWS - 1; y >= 0; y--) {
        if (simBoard[y].every(cell => cell !== 0)) {
          simBoard.splice(y, 1);
          simBoard.unshift(new Array(COLS).fill(0));
          linesCleared++;
          y++;
        }
      }

      const spinType = getSpinType(board, testPiece, p.lastMove);
      const isPerfectClear = checkPerfectClear(simBoard);
      
      let nextB2B = currentB2B;
      let nextCombo = linesCleared > 0 ? (currentCombo >= 0 ? currentCombo + 1 : 0) : -1;
      
      if (linesCleared === 4 || spinType !== null) {
        nextB2B++;
      } else if (linesCleared > 0) {
        nextB2B = 0;
      }
      
      const garbage = calculateGarbage(linesCleared, spinType, nextB2B > 1 ? nextB2B : 0, Math.max(0, nextCombo), isPerfectClear);

      let maxSimHeight = 0;
      for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
          if (simBoard[y][x] !== 0) {
            maxSimHeight = Math.max(maxSimHeight, ROWS - y);
            break;
          }
        }
      }

      let score = evaluateBoard(simBoard, difficulty);
      
      if (difficulty === 'hard') {
        let moveValue = garbage * 1000;
        if (isPerfectClear) moveValue += 100000;
        
        if (linesCleared > 0 && garbage <= 1 && spinType === null && linesCleared < 4) {
           // Weak clears (single/double without spin)
           let penalty = linesCleared * 1000;
           if (maxSimHeight >= 14) {
              penalty = 0; // Panic mode: allow any clears for survival when high
           } else if (maxSimHeight >= 10) {
              penalty *= 0.5; // Reduced penalty when moderately high
           }
           moveValue -= penalty; // Penalize weak clears to promote setups
        }
        if (spinType && linesCleared === 0) {
           moveValue += 1000; // Reward achieving a spin placement for setups strongly
        }
        
        score += moveValue;
      }

      if (difficulty === 'hard' && nextPieceTypeId) {
        const nextStartX = Math.floor(COLS / 2) - Math.floor(SHAPES[nextPieceTypeId][0].length / 2);
        const nextPlacements = getValidPlacements(simBoard, nextPieceTypeId, nextStartX, 0, 0);
        
        let bestNextScore = -Infinity;
        for (const np of nextPlacements) {
          let nMatrix = SHAPES[nextPieceTypeId];
          for(let i=0; i<np.r; i++) nMatrix = rotateMatrix(nMatrix, 1);
          const nTestPiece = { matrix: nMatrix, x: np.x, y: np.y, typeId: nextPieceTypeId, rotationState: np.r };
          
          const nBoard = simBoard.map(row => [...row]);
          nTestPiece.matrix.forEach((row: number[], y: number) => {
            row.forEach((value: number, px: number) => {
              if (value !== 0 && nBoard[y + nTestPiece.y]) {
                nBoard[y + nTestPiece.y][px + nTestPiece.x] = value;
              }
            });
          });

          let nLinesCleared = 0;
          const nSimBoard = nBoard.map(row => [...row]);
          for (let y = ROWS - 1; y >= 0; y--) {
            if (nSimBoard[y].every(cell => cell !== 0)) {
              nSimBoard.splice(y, 1);
              nSimBoard.unshift(new Array(COLS).fill(0));
              nLinesCleared++;
              y++;
            }
          }

          const nSpinType = getSpinType(simBoard, nTestPiece, np.lastMove);
          const nIsPerfectClear = checkPerfectClear(nSimBoard);
          
          let finalB2B = nextB2B;
          let finalCombo = nLinesCleared > 0 ? (nextCombo >= 0 ? nextCombo + 1 : 0) : -1;
          
          if (nLinesCleared === 4 || nSpinType !== null) {
            finalB2B++;
          } else if (nLinesCleared > 0) {
            finalB2B = 0;
          }
          
          const nGarbage = calculateGarbage(nLinesCleared, nSpinType, finalB2B > 1 ? finalB2B : 0, Math.max(0, finalCombo), nIsPerfectClear);

          let nMaxSimHeight = 0;
          for (let x = 0; x < COLS; x++) {
            for (let y = 0; y < ROWS; y++) {
              if (nSimBoard[y][x] !== 0) {
                nMaxSimHeight = Math.max(nMaxSimHeight, ROWS - y);
                break;
              }
            }
          }

          let nScore = evaluateBoard(nSimBoard, difficulty);
          
          if (difficulty === 'hard') {
             let nMoveValue = nGarbage * 1000;
             if (nIsPerfectClear) nMoveValue += 100000;
             if (nLinesCleared > 0 && nGarbage <= 1 && nSpinType === null && nLinesCleared < 4) {
                let penalty = nLinesCleared * 1000;
                if (nMaxSimHeight >= 14) {
                   penalty = 0; // Panic mode
                } else if (nMaxSimHeight >= 10) {
                   penalty *= 0.5;
                }
                nMoveValue -= penalty;
             }
             if (nSpinType && nLinesCleared === 0) nMoveValue += 1000;
             if (nIsPerfectClear) nMoveValue += 100000;
             
             nScore += nMoveValue;
          }

          if (nScore > bestNextScore) bestNextScore = nScore;
        }
        score = bestNextScore !== -Infinity ? score + bestNextScore * 0.5 : score;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMove = { x: p.x, y: p.y, rotation: p.r, lastMove: p.lastMove };
      }
    }
    return bestMove;
  }, [collide]);

  useEffect(() => {
    if (isAiEnabled && isPlaying && pieceRef.current) {
      p1AiTargetRef.current = calculateBestMove(boardRef.current, pieceRef.current, nextPieces[0], aiDifficulty, p1B2bCounterRef.current, p1ComboRef.current);
    } else {
      p1AiTargetRef.current = null;
    }
  }, [isAiEnabled, isPlaying, calculateBestMove, nextPieces, aiDifficulty]);

  const drawMatrix = useCallback((matrix: number[][], offset: {x: number, y: number}, ctx: CanvasRenderingContext2D, isGhost: boolean | 'ai' = false) => {
    matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          if (isGhost === 'ai') {
            ctx.fillStyle = COLORS[value] + '20'; // 12.5% opacity
            ctx.fillRect((x + offset.x) * BLOCK_SIZE, (y + offset.y) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
            ctx.strokeStyle = '#06b6d4'; // cyan-500
            ctx.lineWidth = 2;
            ctx.strokeRect((x + offset.x) * BLOCK_SIZE, (y + offset.y) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
          } else if (isGhost) {
            ctx.fillStyle = COLORS[value] + '40'; // 25% opacity
            ctx.fillRect((x + offset.x) * BLOCK_SIZE, (y + offset.y) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
            ctx.strokeStyle = COLORS[value] + '80'; // 50% opacity border
            ctx.lineWidth = 2;
            ctx.strokeRect((x + offset.x) * BLOCK_SIZE, (y + offset.y) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
          } else {
            ctx.fillStyle = COLORS[value];
            ctx.fillRect((x + offset.x) * BLOCK_SIZE, (y + offset.y) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
            
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.fillRect((x + offset.x) * BLOCK_SIZE, (y + offset.y) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE / 4);
            ctx.fillRect((x + offset.x) * BLOCK_SIZE, (y + offset.y) * BLOCK_SIZE, BLOCK_SIZE / 4, BLOCK_SIZE);
            
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect((x + offset.x) * BLOCK_SIZE, (y + offset.y) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
          }
        }
      });
    });
  }, []);

  const draw = useCallback(() => {
    // Draw Player 1
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        for (let i = 0; i <= COLS; i++) {
          ctx.beginPath();
          ctx.moveTo(i * BLOCK_SIZE, 0);
          ctx.lineTo(i * BLOCK_SIZE, canvas.height);
          ctx.stroke();
        }
        for (let i = 0; i <= ROWS; i++) {
          ctx.beginPath();
          ctx.moveTo(0, i * BLOCK_SIZE);
          ctx.lineTo(canvas.width, i * BLOCK_SIZE);
          ctx.stroke();
        }
        
        drawMatrix(boardRef.current, {x: 0, y: 0}, ctx);
        
        // Draw clearing lines animation
        p1ClearingLinesRef.current.forEach(line => {
          const progress = line.timer / 150;
          ctx.save();
          ctx.globalAlpha = progress;
          const scale = 1 + (1 - progress) * 0.2;
          
          line.blocks.forEach((value, x) => {
            if (value !== 0) {
              ctx.fillStyle = COLORS[value];
              
              // Scale from center of block
              const cx = (x + 0.5) * BLOCK_SIZE;
              const cy = (line.y + 0.5) * BLOCK_SIZE;
              
              ctx.translate(cx, cy);
              ctx.scale(scale, scale);
              ctx.fillRect(-BLOCK_SIZE/2, -BLOCK_SIZE/2, BLOCK_SIZE, BLOCK_SIZE);
              
              ctx.strokeStyle = 'rgba(255,255,255,0.5)';
              ctx.lineWidth = 2;
              ctx.strokeRect(-BLOCK_SIZE/2, -BLOCK_SIZE/2, BLOCK_SIZE, BLOCK_SIZE);
              
              ctx.scale(1/scale, 1/scale);
              ctx.translate(-cx, -cy);
            }
          });
          ctx.restore();
        });
        
        if (pieceRef.current) {
          // Draw AI target piece
          if (isAiEnabledRef.current && p1AiTargetRef.current) {
            const target = p1AiTargetRef.current;
            let matrix = SHAPES[pieceRef.current.typeId];
            for(let i=0; i<target.rotation; i++) matrix = rotateMatrix(matrix, 1);
            
            const aiGhost = { ...pieceRef.current, matrix, x: target.x, y: target.y };
            drawMatrix(aiGhost.matrix, aiGhost, ctx, 'ai');
          }

          // Draw ghost piece
          const ghost = { ...pieceRef.current, matrix: pieceRef.current.matrix };
          while (!collide(boardRef.current, ghost)) {
            ghost.y++;
          }
          ghost.y--;
          drawMatrix(ghost.matrix, ghost, ctx, true);

          // Draw actual piece
          drawMatrix(pieceRef.current.matrix, pieceRef.current, ctx);
        }
      }
    }

    // Draw AI
    const aiCanvas = aiCanvasRef.current;
    if (aiCanvas) {
      const ctx = aiCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, aiCanvas.width, aiCanvas.height);
        
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        for (let i = 0; i <= COLS; i++) {
          ctx.beginPath();
          ctx.moveTo(i * BLOCK_SIZE, 0);
          ctx.lineTo(i * BLOCK_SIZE, aiCanvas.height);
          ctx.stroke();
        }
        for (let i = 0; i <= ROWS; i++) {
          ctx.beginPath();
          ctx.moveTo(0, i * BLOCK_SIZE);
          ctx.lineTo(aiCanvas.width, i * BLOCK_SIZE);
          ctx.stroke();
        }
        
        drawMatrix(aiBoardRef.current, {x: 0, y: 0}, ctx);
        
        // Draw AI clearing lines animation
        aiClearingLinesRef.current.forEach(line => {
          const progress = line.timer / 150;
          ctx.save();
          ctx.globalAlpha = progress;
          const scale = 1 + (1 - progress) * 0.2;
          
          line.blocks.forEach((value, x) => {
            if (value !== 0) {
              ctx.fillStyle = COLORS[value];
              
              // Scale from center of block
              const cx = (x + 0.5) * BLOCK_SIZE;
              const cy = (line.y + 0.5) * BLOCK_SIZE;
              
              ctx.translate(cx, cy);
              ctx.scale(scale, scale);
              ctx.fillRect(-BLOCK_SIZE/2, -BLOCK_SIZE/2, BLOCK_SIZE, BLOCK_SIZE);
              
              ctx.strokeStyle = 'rgba(255,255,255,0.5)';
              ctx.lineWidth = 2;
              ctx.strokeRect(-BLOCK_SIZE/2, -BLOCK_SIZE/2, BLOCK_SIZE, BLOCK_SIZE);
              
              ctx.scale(1/scale, 1/scale);
              ctx.translate(-cx, -cy);
            }
          });
          ctx.restore();
        });
        
        if (aiPieceRef.current) {
          if (aiTargetRef.current) {
            const target = aiTargetRef.current;
            let matrix = SHAPES[aiPieceRef.current.typeId];
            for(let i=0; i<target.rotation; i++) matrix = rotateMatrix(matrix, 1);
            
            const aiGhost = { ...aiPieceRef.current, matrix, x: target.x, y: target.y };
            drawMatrix(aiGhost.matrix, aiGhost, ctx, 'ai');
          }

          const ghost = { ...aiPieceRef.current, matrix: aiPieceRef.current.matrix };
          while (!collide(aiBoardRef.current, ghost)) {
            ghost.y++;
          }
          ghost.y--;
          drawMatrix(ghost.matrix, ghost, ctx, true);

          drawMatrix(aiPieceRef.current.matrix, aiPieceRef.current, ctx);
        }
      }
    }
  }, [drawMatrix, collide]);

  const applyGarbage = (board: number[][], lines: number) => {
    const newBoard = board.map(row => [...row]);
    for (let i = 0; i < lines; i++) {
      newBoard.shift();
      const hole = Math.floor(Math.random() * COLS);
      const newRow = new Array(COLS).fill(8);
      newRow[hole] = 0;
      newBoard.push(newRow);
    }
    return newBoard;
  };

  const sweep = useCallback(() => {
    let rowCount = 1;
    let newScore = 0;
    let linesCleared = 0;
    const clearedY: number[] = [];
    const clearedBlocks: number[][] = [];
    
    outer: for (let y = boardRef.current.length - 1; y >= 0; --y) {
      for (let x = 0; x < boardRef.current[y].length; ++x) {
        if (boardRef.current[y][x] === 0) {
          continue outer;
        }
      }
      clearedY.push(y);
      clearedBlocks.push([...boardRef.current[y]]);
      
      const row = boardRef.current.splice(y, 1)[0].fill(0);
      boardRef.current.unshift(row);
      ++y;
      newScore += rowCount * 10;
      rowCount *= 2;
      linesCleared++;
    }
    
    if (linesCleared > 0) {
      p1ClearingLinesRef.current.push(...clearedY.map((y, i) => ({
        y: y + linesCleared - 1 - i,
        blocks: clearedBlocks[i],
        timer: 150
      })));
      
      p1ComboRef.current++;
      
      const tSpinType = pieceRef.current ? getSpinType(boardRef.current, pieceRef.current, p1LastMoveRef.current) : null;
      const isB2bClear = linesCleared === 4 || tSpinType !== null;
      
      const isPerfectClear = checkPerfectClear(boardRef.current);
      
      const garbage = calculateGarbage(
        linesCleared,
        tSpinType,
        isB2bClear ? p1B2bCounterRef.current : 0,
        p1ComboRef.current,
        isPerfectClear
      );
      
      if (isB2bClear) {
        p1B2bCounterRef.current++;
      } else {
        p1B2bCounterRef.current = 0;
      }
      
      let remainingGarbage = garbage;
      if (remainingGarbage > 0 && p1GarbageQueueRef.current > 0) {
        if (remainingGarbage >= p1GarbageQueueRef.current) {
          remainingGarbage -= p1GarbageQueueRef.current;
          p1GarbageQueueRef.current = 0;
        } else {
          p1GarbageQueueRef.current -= remainingGarbage;
          remainingGarbage = 0;
        }
      }
      
      if (remainingGarbage > 0) {
        aiGarbageQueueRef.current += remainingGarbage;
      }
      setAiGarbage(aiGarbageQueueRef.current);
      setP1Garbage(p1GarbageQueueRef.current);
    } else {
      p1ComboRef.current = -1;
    }
    
    if (newScore > 0) {
      setScore(prev => prev + newScore);
      playClearSound();
    }
  }, []);

  const aiSweep = useCallback(() => {
    let rowCount = 1;
    let newScore = 0;
    let linesCleared = 0;
    const clearedY: number[] = [];
    const clearedBlocks: number[][] = [];
    
    outer: for (let y = aiBoardRef.current.length - 1; y >= 0; --y) {
      for (let x = 0; x < aiBoardRef.current[y].length; ++x) {
        if (aiBoardRef.current[y][x] === 0) {
          continue outer;
        }
      }
      clearedY.push(y);
      clearedBlocks.push([...aiBoardRef.current[y]]);
      
      const row = aiBoardRef.current.splice(y, 1)[0].fill(0);
      aiBoardRef.current.unshift(row);
      ++y;
      newScore += rowCount * 10;
      rowCount *= 2;
      linesCleared++;
    }
    
    if (linesCleared > 0) {
      aiClearingLinesRef.current.push(...clearedY.map((y, i) => ({
        y: y + linesCleared - 1 - i,
        blocks: clearedBlocks[i],
        timer: 150
      })));
      
      aiComboRef.current++;
      
      const tSpinType = aiPieceRef.current ? getSpinType(aiBoardRef.current, aiPieceRef.current, aiLastMoveRef.current) : null;
      const isB2bClear = linesCleared === 4 || tSpinType !== null;
      
      const isPerfectClear = checkPerfectClear(aiBoardRef.current);
      
      const garbage = calculateGarbage(
        linesCleared,
        tSpinType,
        isB2bClear ? aiB2bCounterRef.current : 0,
        aiComboRef.current,
        isPerfectClear
      );
      
      if (isB2bClear) {
        aiB2bCounterRef.current++;
      } else {
        aiB2bCounterRef.current = 0;
      }
      
      let remainingGarbage = garbage;
      if (remainingGarbage > 0 && aiGarbageQueueRef.current > 0) {
        if (remainingGarbage >= aiGarbageQueueRef.current) {
          remainingGarbage -= aiGarbageQueueRef.current;
          aiGarbageQueueRef.current = 0;
        } else {
          aiGarbageQueueRef.current -= remainingGarbage;
          remainingGarbage = 0;
        }
      }
      
      if (remainingGarbage > 0) {
        p1GarbageQueueRef.current += remainingGarbage;
      }
      setP1Garbage(p1GarbageQueueRef.current);
      setAiGarbage(aiGarbageQueueRef.current);
    } else {
      aiComboRef.current = -1;
    }
    
    if (newScore > 0) {
      setAiScore(prev => prev + newScore);
      playClearSound();
    }
  }, []);

  const getPieceFromSequence = useCallback((index: number) => {
    while (pieceSequenceRef.current.length <= index) {
      if (handling.randomizer === 'random') {
        pieceSequenceRef.current.push(Math.floor(Math.random() * 7) + 1);
      } else {
        const bag = [1, 2, 3, 4, 5, 6, 7];
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        pieceSequenceRef.current.push(...bag);
      }
    }
    return pieceSequenceRef.current[index];
  }, [handling.randomizer]);

  const initNextPieces = useCallback(() => {
    p1PieceIndexRef.current = 0;
    const pieces = Array.from({ length: 6 }, () => getPieceFromSequence(p1PieceIndexRef.current++));
    nextPiecesRef.current = pieces;
    setNextPieces([...pieces]);
  }, [getPieceFromSequence]);

  const aiInitNextPieces = useCallback(() => {
    aiPieceIndexRef.current = 0;
    const pieces = Array.from({ length: 6 }, () => getPieceFromSequence(aiPieceIndexRef.current++));
    aiNextPiecesRef.current = pieces;
    setAiNextPieces([...pieces]);
  }, [getPieceFromSequence]);

  const spawnPiece = useCallback((specificTypeId?: number) => {
    if (nextPiecesRef.current.length === 0) {
      initNextPieces();
    }
    
    let typeId;
    if (specificTypeId) {
      typeId = specificTypeId;
    } else {
      typeId = nextPiecesRef.current.shift()!;
      nextPiecesRef.current.push(getPieceFromSequence(p1PieceIndexRef.current++));
      setNextPieces([...nextPiecesRef.current]);
    }

    const matrix = SHAPES[typeId];
    pieceRef.current = {
      matrix: JSON.parse(JSON.stringify(matrix)),
      x: Math.floor(COLS / 2) - Math.floor(matrix[0].length / 2),
      y: 0,
      typeId,
      rotationState: 0
    };
    
    p1LastMoveRef.current = null;
    
    lowestYRef.current = pieceRef.current.y;
    lockResetsRef.current = 0;
    lockTimerRef.current = 0;
    dcdTimerRef.current = handling.dcd;
    
    if (collide(boardRef.current, pieceRef.current)) {
      setGameOver(true);
      gameOverRef.current = true;
      setIsPlaying(false);
      playGameOverSound();
    } else {
      if (isAiEnabledRef.current) {
        p1AiTargetRef.current = calculateBestMove(boardRef.current, pieceRef.current, nextPiecesRef.current[0], aiDifficultyRef.current, p1B2bCounterRef.current, p1ComboRef.current);
      }
    }
  }, [collide, initNextPieces, handling.dcd, calculateBestMove, getPieceFromSequence]);

  const aiSpawnPiece = useCallback(() => {
    if (aiNextPiecesRef.current.length === 0) {
      aiInitNextPieces();
    }
    
    const typeId = aiNextPiecesRef.current.shift()!;
    aiNextPiecesRef.current.push(getPieceFromSequence(aiPieceIndexRef.current++));
    setAiNextPieces([...aiNextPiecesRef.current]);

    const matrix = SHAPES[typeId];
    const x = Math.floor(COLS / 2) - Math.floor(matrix[0].length / 2);
    const y = 0;
    
    const piece = { typeId, matrix: JSON.parse(JSON.stringify(matrix)), x, y, rotationState: 0 };
    aiPieceRef.current = piece;
    
    aiLastMoveRef.current = null;
    
    if (collide(aiBoardRef.current, piece)) {
      setAiGameOver(true);
      aiGameOverRef.current = true;
      setIsPlaying(false);
      playGameOverSound();
    } else {
      aiTargetRef.current = calculateBestMove(aiBoardRef.current, aiPieceRef.current, aiNextPiecesRef.current[0], aiDifficultyRef.current, aiB2bCounterRef.current, aiComboRef.current);
    }
  }, [getPieceFromSequence, aiInitNextPieces, calculateBestMove, collide]);

  const lockPiece = useCallback(() => {
    if (!pieceRef.current) return;
    merge(boardRef.current, pieceRef.current);
    sweep();
    
    if (p1GarbageQueueRef.current > 0) {
      boardRef.current = applyGarbage(boardRef.current, p1GarbageQueueRef.current);
      p1GarbageQueueRef.current = 0;
      setP1Garbage(0);
    }
    
    setHasHeldBoth(false);
    spawnPiece();
  }, [merge, sweep, spawnPiece, setHasHeldBoth]);

  const aiLockPiece = useCallback(() => {
    if (!aiPieceRef.current) return;
    merge(aiBoardRef.current, aiPieceRef.current);
    aiSweep();
    
    if (aiGarbageQueueRef.current > 0) {
      aiBoardRef.current = applyGarbage(aiBoardRef.current, aiGarbageQueueRef.current);
      aiGarbageQueueRef.current = 0;
      setAiGarbage(0);
    }
    
    aiSpawnPiece();
  }, [merge, aiSweep, aiSpawnPiece]);

  const playerDrop = useCallback(() => {
    if (!pieceRef.current) return;
    pieceRef.current.y++;
    if (collide(boardRef.current, pieceRef.current)) {
      pieceRef.current.y--;
    } else {
      p1LastMoveRef.current = { type: 'drop' };
      if (pieceRef.current.y > lowestYRef.current) {
        lowestYRef.current = pieceRef.current.y;
        lockResetsRef.current = 0;
        lockTimerRef.current = 0;
      }
    }
    dropCounterRef.current = 0;
  }, [collide]);

  const aiRotate = useCallback((dir: number = 1) => {
    if (!aiPieceRef.current) return false;
    const piece = aiPieceRef.current;
    if (piece.typeId === 4) return false;

    const prevMatrix = piece.matrix;
    const prevRotationState = piece.rotationState;
    const newRotationState = (prevRotationState + (dir === 1 ? 1 : dir === -1 ? 3 : 2)) % 4;
    const matrix = rotateMatrix(prevMatrix, dir);
    
    piece.matrix = matrix;
    piece.rotationState = newRotationState;
    
    if (!collide(aiBoardRef.current, piece)) {
      aiLastMoveRef.current = { type: 'rotate', kickIndex: 0 };
      return true;
    }
    
    const kickData = piece.typeId === 1 ? KICK_DATA_I : KICK_DATA_JLSTZ;
    const kickKey = `${prevRotationState}->${newRotationState}`;
    const kicks = kickData[kickKey] || [{x:0, y:0}];
    
    for (let i = 0; i < kicks.length; i++) {
      const kick = kicks[i];
      piece.x += kick.x;
      piece.y -= kick.y;
      if (!collide(aiBoardRef.current, piece)) {
        aiLastMoveRef.current = { type: 'rotate', kickIndex: i };
        return true;
      }
      piece.x -= kick.x;
      piece.y += kick.y;
    }
    
    piece.matrix = prevMatrix;
    piece.rotationState = prevRotationState;
    return false;
  }, [collide]);

  const aiMove = useCallback((dir: number) => {
    if (!aiPieceRef.current) return false;
    aiPieceRef.current.x += dir;
    if (collide(aiBoardRef.current, aiPieceRef.current)) {
      aiPieceRef.current.x -= dir;
      return false;
    }
    aiLastMoveRef.current = { type: 'move' };
    return true;
  }, [collide]);

  const aiHardDrop = useCallback(() => {
    if (!aiPieceRef.current) return;
    let moved = false;
    while (!collide(aiBoardRef.current, aiPieceRef.current)) {
      aiPieceRef.current.y++;
      moved = true;
    }
    aiPieceRef.current.y--;
    if (moved) {
      aiLastMoveRef.current = { type: 'hardDrop' };
    }
    aiLockPiece();
  }, [collide, aiLockPiece]);

  const playerHardDrop = useCallback(() => {
    if (!pieceRef.current) return;
    let moved = false;
    while (!collide(boardRef.current, pieceRef.current)) {
      pieceRef.current.y++;
      moved = true;
    }
    pieceRef.current.y--;
    if (moved) {
      p1LastMoveRef.current = { type: 'hardDrop' };
    }
    lockPiece();
    dropCounterRef.current = 0;
  }, [collide, lockPiece]);

  const playerMove = useCallback((dir: number) => {
    if (!pieceRef.current) return false;
    pieceRef.current.x += dir;
    if (collide(boardRef.current, pieceRef.current)) {
      pieceRef.current.x -= dir;
      return false;
    }
    
    p1LastMoveRef.current = { type: 'move' };
    
    let isTouchingFloor = false;
    pieceRef.current.y++;
    if (collide(boardRef.current, pieceRef.current)) {
      isTouchingFloor = true;
    }
    pieceRef.current.y--;

    if (isTouchingFloor && lockResetsRef.current < 15) {
      lockTimerRef.current = 0;
      lockResetsRef.current++;
    }
    
    return true;
  }, [collide]);

  const playerSoftDropToBottom = useCallback(() => {
    if (!pieceRef.current) return;
    let moved = false;
    while (!collide(boardRef.current, pieceRef.current)) {
      pieceRef.current.y++;
      moved = true;
    }
    pieceRef.current.y--;
    if (moved) {
      p1LastMoveRef.current = { type: 'drop' };
    }
    dropCounterRef.current = 0;
    if (pieceRef.current.y > lowestYRef.current) {
      lowestYRef.current = pieceRef.current.y;
      lockResetsRef.current = 0;
      lockTimerRef.current = 0;
    }
  }, [collide]);

  const playerRotate = useCallback((dir: number = 1) => {
    if (!pieceRef.current) return false;
    
    const piece = pieceRef.current;
    
    // O piece doesn't rotate or kick
    if (piece.typeId === 4) return false;

    const prevMatrix = piece.matrix;
    const prevX = piece.x;
    const prevY = piece.y;
    const prevRotationState = piece.rotationState;
    
    const newRotationState = (prevRotationState + (dir === 1 ? 1 : dir === -1 ? 3 : 2)) % 4;
    const matrix = rotateMatrix(prevMatrix, dir);
    
    piece.matrix = matrix;
    piece.rotationState = newRotationState;
    
    const transition = `${prevRotationState}->${newRotationState}`;
    let kickData;
    if (dir === 2) {
      kickData = KICK_DATA_180[transition];
    } else {
      kickData = piece.typeId === 1 ? KICK_DATA_I[transition] : KICK_DATA_JLSTZ[transition];
    }
    
    let rotated = false;
    let kickIndex = 0;
    for (let i = 0; i < kickData.length; i++) {
      const kick = kickData[i];
      piece.x = prevX + kick.x;
      piece.y = prevY + kick.y;
      
      if (!collide(boardRef.current, piece)) {
        rotated = true;
        kickIndex = i;
        break;
      }
    }
    
    if (rotated) {
      p1LastMoveRef.current = { type: 'rotate', kickIndex };
      playRotateSound();
      
      let isTouchingFloor = false;
      piece.y++;
      if (collide(boardRef.current, piece)) {
        isTouchingFloor = true;
      }
      piece.y--;

      if (isTouchingFloor && lockResetsRef.current < 15) {
        lockTimerRef.current = 0;
        lockResetsRef.current++;
      }
      return true;
    } else {
      // Revert if all kicks failed
      piece.matrix = prevMatrix;
      piece.x = prevX;
      piece.y = prevY;
      piece.rotationState = prevRotationState;
      return false;
    }
  }, [collide]);

  const playerHold = useCallback(() => {
    if (hasHeldRef.current || !pieceRef.current) return;

    const currentTypeId = pieceRef.current.typeId;

    if (heldPiece === null) {
      setHeldPiece(currentTypeId);
      spawnPiece();
    } else {
      const previousHeld = heldPiece;
      setHeldPiece(currentTypeId);
      spawnPiece(previousHeld);
    }

    setHasHeldBoth(true);
  }, [heldPiece, spawnPiece, setHasHeldBoth]);

  const pollGamepad = useCallback(() => {
    if (showSettings) return; // Don't process game input while settings are open
    
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[0];
    if (!gp) return;

    const state = {
      left: gp.buttons[gamepadBindings.moveLeft]?.pressed || gp.axes[0] < -0.5,
      right: gp.buttons[gamepadBindings.moveRight]?.pressed || gp.axes[0] > 0.5,
      down: gp.buttons[gamepadBindings.softDrop]?.pressed || gp.axes[1] > 0.5,
      up: gp.buttons[gamepadBindings.hardDrop]?.pressed || gp.axes[1] < -0.5,
      rotate: gp.buttons[gamepadBindings.rotate]?.pressed,
      rotateAntiClockwise: gp.buttons[gamepadBindings.rotateAntiClockwise]?.pressed,
      rotate180: gp.buttons[gamepadBindings.rotate180]?.pressed,
      hold: gp.buttons[gamepadBindings.hold]?.pressed,
    };

    const last = lastGamepadStateRef.current;

    if (state.left && !last.left) {
      keysRef.current.left = true;
      activeDirRef.current = -1;
      dasTimerRef.current = 0;
      arrTimerRef.current = 0;
      playerMove(-1);
    } else if (!state.left && last.left) {
      keysRef.current.left = false;
      if (activeDirRef.current === -1) {
        activeDirRef.current = keysRef.current.right ? 1 : 0;
        if (activeDirRef.current === 1) {
          dasTimerRef.current = 0;
          arrTimerRef.current = 0;
          playerMove(1);
        }
      }
    }

    if (state.right && !last.right) {
      keysRef.current.right = true;
      activeDirRef.current = 1;
      dasTimerRef.current = 0;
      arrTimerRef.current = 0;
      playerMove(1);
    } else if (!state.right && last.right) {
      keysRef.current.right = false;
      if (activeDirRef.current === 1) {
        activeDirRef.current = keysRef.current.left ? -1 : 0;
        if (activeDirRef.current === -1) {
          dasTimerRef.current = 0;
          arrTimerRef.current = 0;
          playerMove(-1);
        }
      }
    }
    
    if (state.down && !last.down) {
      keysRef.current.down = true;
      if (handling.sdf === Infinity) playerSoftDropToBottom();
      else playerDrop();
    } else if (!state.down && last.down) {
      keysRef.current.down = false;
    }

    if (state.up && !last.up) playerHardDrop();
    if (state.rotate && !last.rotate) playerRotate(1);
    if (state.rotateAntiClockwise && !last.rotateAntiClockwise) playerRotate(-1);
    if (state.rotate180 && !last.rotate180) playerRotate(2);
    if (state.hold && !last.hold) playerHold();

    lastGamepadStateRef.current = state;
  }, [playerMove, playerDrop, playerHardDrop, playerRotate, playerHold, playerSoftDropToBottom, gamepadBindings, showSettings, handling.sdf]);

  const update = useCallback((time = 0) => {
    if (!isPlayingRef.current || (gameOverRef.current && aiGameOverRef.current)) return;
    
    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;
    
    // Process clearing lines animations
    if (p1ClearingLinesRef.current.length > 0) {
      p1ClearingLinesRef.current.forEach(line => line.timer -= deltaTime);
      p1ClearingLinesRef.current = p1ClearingLinesRef.current.filter(line => line.timer > 0);
    }
    if (aiClearingLinesRef.current.length > 0) {
      aiClearingLinesRef.current.forEach(line => line.timer -= deltaTime);
      aiClearingLinesRef.current = aiClearingLinesRef.current.filter(line => line.timer > 0);
    }
    
    // Player 1 Update
    if (!gameOverRef.current) {
      if (isAiEnabledRef.current && p1AiTargetRef.current && pieceRef.current) {
        p1AiTimerRef.current += deltaTime;
        const delayMs = 1000 / aiPpsRef.current;
        if (p1AiTimerRef.current > delayMs) {
          p1AiTimerRef.current -= delayMs;
          if (p1AiTimerRef.current > delayMs) p1AiTimerRef.current = delayMs; // Cap to prevent infinite growth
          const target = p1AiTargetRef.current;
          const piece = pieceRef.current;
          
          piece.rotationState = target.rotation;
          let matrix = SHAPES[piece.typeId];
          for(let i=0; i<target.rotation; i++) matrix = rotateMatrix(matrix, 1);
          piece.matrix = matrix;
          piece.x = target.x;
          piece.y = target.y;
          
          p1LastMoveRef.current = target.lastMove;
          lockPiece();
        }
      } else {
        pollGamepad();

        if (dcdTimerRef.current > 0) {
          dcdTimerRef.current -= deltaTime;
        } else if (activeDirRef.current !== 0) {
          dasTimerRef.current += deltaTime;
          if (dasTimerRef.current >= handling.das) {
            if (handling.arr === 0) {
              while (playerMove(activeDirRef.current)) {}
            } else {
              arrTimerRef.current += deltaTime;
              while (arrTimerRef.current >= handling.arr) {
                arrTimerRef.current -= handling.arr;
                playerMove(activeDirRef.current);
              }
            }
          }
        }

        if (keysRef.current.down) {
          if (handling.sdf === Infinity) {
            playerSoftDropToBottom();
          } else {
            dropCounterRef.current += deltaTime * handling.sdf;
          }
        } else {
          dropCounterRef.current += deltaTime;
        }

        if (dropCounterRef.current > 1000) {
          playerDrop();
        }
        
        let isTouchingFloor = false;
        if (pieceRef.current) {
          pieceRef.current.y++;
          if (collide(boardRef.current, pieceRef.current)) {
            isTouchingFloor = true;
          }
          pieceRef.current.y--;
        }

        if (isTouchingFloor) {
          lockTimerRef.current += deltaTime;
          if (lockTimerRef.current >= 500) {
            lockPiece();
          }
        } else {
          lockTimerRef.current = 0;
        }
      }
    }

    // AI Update
    if (!aiGameOverRef.current) {
      if (aiTargetRef.current && aiPieceRef.current) {
        aiTimerRef.current += deltaTime;
        const delayMs = 1000 / aiPpsRef.current;
        if (aiTimerRef.current > delayMs) {
          aiTimerRef.current -= delayMs;
          if (aiTimerRef.current > delayMs) aiTimerRef.current = delayMs; // Cap to prevent infinite growth
          const target = aiTargetRef.current;
          const piece = aiPieceRef.current;
          
          piece.rotationState = target.rotation;
          let matrix = SHAPES[piece.typeId];
          for(let i=0; i<target.rotation; i++) matrix = rotateMatrix(matrix, 1);
          piece.matrix = matrix;
          piece.x = target.x;
          piece.y = target.y;
          
          aiLastMoveRef.current = target.lastMove;
          aiLockPiece();
        }
      } else if (aiPieceRef.current) {
        aiTargetRef.current = calculateBestMove(aiBoardRef.current, aiPieceRef.current, aiNextPiecesRef.current[0], aiDifficultyRef.current, aiB2bCounterRef.current, aiComboRef.current);
      }
    }
    
    draw();
    requestRef.current = requestAnimationFrame(update);
  }, [draw, playerDrop, pollGamepad, playerMove, playerSoftDropToBottom, handling, lockPiece, collide, playerRotate, playerHardDrop, aiRotate, aiMove, aiHardDrop, aiLockPiece, calculateBestMove]);

  const startGame = () => {
    pieceSequenceRef.current = [];
    p1PieceIndexRef.current = 0;
    aiPieceIndexRef.current = 0;

    boardRef.current = createEmptyBoard();
    aiBoardRef.current = createEmptyBoard();

    setScore(0);
    setAiScore(0);

    setGameOver(false);
    setAiGameOver(false);
    gameOverRef.current = false;
    aiGameOverRef.current = false;

    setHeldPiece(null);
    setHasHeldBoth(false);
    
    p1AiTimerRef.current = 0;
    aiTimerRef.current = 0;
    
    p1GarbageQueueRef.current = 0;
    aiGarbageQueueRef.current = 0;
    setP1Garbage(0);
    setAiGarbage(0);
    
    p1ComboRef.current = -1;
    p1B2bCounterRef.current = 0;
    p1LastMoveRef.current = null;
    
    aiComboRef.current = -1;
    aiB2bCounterRef.current = 0;
    aiLastMoveRef.current = null;
    
    keysRef.current = { left: false, right: false, down: false };
    activeDirRef.current = 0;
    dasTimerRef.current = 0;
    arrTimerRef.current = 0;
    dcdTimerRef.current = 0;
    lockTimerRef.current = 0;
    lockResetsRef.current = 0;
    lowestYRef.current = 0;
    
    aiDropCounterRef.current = 0;
    
    initNextPieces();
    aiInitNextPieces();

    spawnPiece();
    aiSpawnPiece();

    lastTimeRef.current = performance.now();
    dropCounterRef.current = 0;
    setIsPlaying(true);
    isPlayingRef.current = true;
  };

  const exportSettings = () => {
    const settings = {
      keybindings,
      gamepadBindings,
      handling
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(settings, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", "tetris-settings.json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const importSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.keybindings) setKeybindings(json.keybindings);
        if (json.gamepadBindings) setGamepadBindings(json.gamepadBindings);
        if (json.handling) setHandling(json.handling);
      } catch (err) {
        console.error("Failed to parse settings file", err);
        alert("Invalid settings file.");
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    if (isPlaying && !gameOver) {
      lastTimeRef.current = performance.now();
      requestRef.current = requestAnimationFrame(update);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, gameOver, update]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlayingRef.current || gameOverRef.current || showSettings || listeningKey) return;
      if (isAiEnabledRef.current) return;
      if (e.repeat) return;
      
      const key = e.key;
      let handled = false;

      if (key === keybindings.moveLeft) {
        keysRef.current.left = true;
        activeDirRef.current = -1;
        dasTimerRef.current = 0;
        arrTimerRef.current = 0;
        playerMove(-1);
        handled = true;
      } else if (key === keybindings.moveRight) {
        keysRef.current.right = true;
        activeDirRef.current = 1;
        dasTimerRef.current = 0;
        arrTimerRef.current = 0;
        playerMove(1);
        handled = true;
      } else if (key === keybindings.softDrop) {
        keysRef.current.down = true;
        if (handling.sdf === Infinity) playerSoftDropToBottom();
        else playerDrop();
        handled = true;
      } else if (key === keybindings.hardDrop) {
        playerHardDrop();
        handled = true;
      } else if (key === keybindings.rotate) {
        playerRotate(1);
        handled = true;
      } else if (key === keybindings.rotateAntiClockwise) {
        playerRotate(-1);
        handled = true;
      } else if (key === keybindings.rotate180) {
        playerRotate(2);
        handled = true;
      } else if (key === keybindings.hold) {
        playerHold();
        handled = true;
      }

      if (handled) {
        e.preventDefault();
        draw();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key;
      if (key === keybindings.moveLeft) {
        keysRef.current.left = false;
        if (activeDirRef.current === -1) {
          activeDirRef.current = keysRef.current.right ? 1 : 0;
          if (activeDirRef.current === 1) {
            dasTimerRef.current = 0;
            arrTimerRef.current = 0;
            playerMove(1);
            draw();
          }
        }
      } else if (key === keybindings.moveRight) {
        keysRef.current.right = false;
        if (activeDirRef.current === 1) {
          activeDirRef.current = keysRef.current.left ? -1 : 0;
          if (activeDirRef.current === -1) {
            dasTimerRef.current = 0;
            arrTimerRef.current = 0;
            playerMove(-1);
            draw();
          }
        }
      } else if (key === keybindings.softDrop) {
        keysRef.current.down = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [keybindings, playerMove, playerDrop, playerHardDrop, playerRotate, playerHold, playerSoftDropToBottom, draw, showSettings, listeningKey, handling.sdf]);

  // Keybinding listener
  useEffect(() => {
    if (!listeningKey) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      setKeybindings(prev => ({ ...prev, [listeningKey]: e.key }));
      setListeningKey(null);
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [listeningKey]);

  // Gamepad binding listener
  useEffect(() => {
    if (!listeningGamepadKey) return;
    
    let animationFrameId: number;
    
    const pollSettingsGamepad = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = gamepads[0];
      if (gp) {
        for (let i = 0; i < gp.buttons.length; i++) {
          if (gp.buttons[i].pressed) {
            setGamepadBindings(prev => ({ ...prev, [listeningGamepadKey]: i }));
            setListeningGamepadKey(null);
            return;
          }
        }
      }
      animationFrameId = requestAnimationFrame(pollSettingsGamepad);
    };
    
    animationFrameId = requestAnimationFrame(pollSettingsGamepad);
    
    return () => cancelAnimationFrame(animationFrameId);
  }, [listeningGamepadKey]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPlayingRef.current || gameOverRef.current || !pieceRef.current) return;
    if (isAiEnabledRef.current) return;
    
    if (e.button === 2) {
      playerRotate();
      draw();
      return;
    }

    if (e.button === 1) { // Middle click
      e.preventDefault();
      playerHold();
      draw();
      return;
    }
    
    if (e.button === 0) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const gridX = Math.floor(mouseX / BLOCK_SIZE);
      const gridY = Math.floor(mouseY / BLOCK_SIZE);
      
      dragOffsetXRef.current = gridX - pieceRef.current.x;
      dragOffsetYRef.current = gridY - pieceRef.current.y;
      isDraggingRef.current = true;
      
      handleMouseMove(e);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || !isPlayingRef.current || gameOverRef.current || !pieceRef.current) return;
    if (isAiEnabledRef.current) return;
    
    const rect = canvasRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const gridX = Math.floor(mouseX / BLOCK_SIZE);
    const gridY = Math.floor(mouseY / BLOCK_SIZE);
    
    const targetX = gridX - dragOffsetXRef.current;
    const targetY = gridY - dragOffsetYRef.current;
    
    // Handle horizontal movement
    while (pieceRef.current.x !== targetX) {
      const step = targetX > pieceRef.current.x ? 1 : -1;
      pieceRef.current.x += step;
      if (collide(boardRef.current, pieceRef.current)) {
        pieceRef.current.x -= step;
        break;
      }
    }

    // Handle vertical movement (soft drop)
    // Only allow dragging down, not up
    if (targetY > pieceRef.current.y) {
      while (pieceRef.current.y !== targetY) {
        pieceRef.current.y += 1;
        if (collide(boardRef.current, pieceRef.current)) {
          pieceRef.current.y -= 1;
          break;
        }
      }
      // Reset drop counter when dragging down so it doesn't immediately drop again
      dropCounterRef.current = 0;
      if (pieceRef.current.y > lowestYRef.current) {
        lowestYRef.current = pieceRef.current.y;
        lockResetsRef.current = 0;
        lockTimerRef.current = 0;
      }
    }

    draw();
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-sans text-slate-100 p-4">
      <div className="mb-8 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-white mb-3">Tetris Battle</h1>
        <p className="text-slate-400 text-lg">Play against the AI!</p>
      </div>
      
      <div className="flex flex-col xl:flex-row gap-8 items-center xl:items-start justify-center w-full max-w-[1400px]">
        {/* Player 1 Area */}
        <div className="flex gap-4">
          <div className="flex flex-col gap-4">
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl w-32 flex flex-col items-center">
              <h3 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-4 text-center">Hold</h3>
              <div className="h-16 flex items-center justify-center">
                {heldPiece ? <MiniPiece typeId={heldPiece} disabled={hasHeld} /> : <span className="text-slate-600 text-sm">Empty</span>}
              </div>
            </div>
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl w-32 text-center">
              <h3 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-2">Score</h3>
              <div className="text-2xl font-mono font-bold text-cyan-400">{score}</div>
            </div>
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl w-32 text-center">
              <h3 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-2">Garbage</h3>
              <div className="text-2xl font-mono font-bold text-red-500">{p1Garbage}</div>
            </div>
          </div>

          <div className="relative bg-slate-900 p-4 rounded-3xl border-4 border-slate-800 shadow-2xl flex gap-3">
            <div className="w-3 bg-slate-950 rounded-full overflow-hidden flex flex-col justify-end border border-slate-800 relative">
              <div 
                className="bg-red-500 w-full transition-all duration-300 absolute bottom-0" 
                style={{ height: `${Math.min(100, (p1Garbage / ROWS) * 100)}%` }}
              />
            </div>
            <canvas
              ref={canvasRef}
              width={COLS * BLOCK_SIZE}
              height={ROWS * BLOCK_SIZE}
              className="bg-slate-950 rounded-xl block"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onContextMenu={e => e.preventDefault()}
            />
            {gameOver && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl">
                <h2 className="text-4xl font-black text-red-500 mb-2 tracking-widest uppercase">Game Over</h2>
                <p className="text-slate-300 text-lg">Score: {score}</p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl w-32 flex flex-col items-center">
              <h3 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-4 text-center">Next</h3>
              <div className="flex flex-col gap-6">
                {nextPieces.slice(0, 3).map((typeId, i) => (
                  <div key={i} className="flex justify-center">
                    <MiniPiece typeId={typeId} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* VS Badge / Controls */}
        <div className="flex flex-col gap-4 items-center justify-center xl:mt-32">
          <div className="text-5xl font-black text-slate-700 italic mb-4">VS</div>
          
          <div className="flex flex-col gap-3 w-48">
            {!isPlaying && (!gameOver && !aiGameOver) ? (
              <button 
                onClick={startGame}
                className="flex items-center justify-center gap-2 w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-colors shadow-lg shadow-cyan-500/20"
              >
                <Play size={20} />
                Start Game
              </button>
            ) : (
              <button 
                onClick={startGame}
                className="flex items-center justify-center gap-2 w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors border border-slate-700"
              >
                <RotateCcw size={20} />
                Restart
              </button>
            )}
            
            <button 
              onClick={() => setShowSettings(true)}
              className="flex items-center justify-center gap-2 w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors border border-slate-700"
            >
              <Settings size={20} />
              Controls
            </button>
            
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-xl mt-2">
              <div className="flex items-center justify-between mb-4">
                <span className="text-slate-300 font-semibold text-sm">AI Auto-Play (P1)</span>
                <button
                  onClick={() => setIsAiEnabled(!isAiEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${isAiEnabled ? 'bg-cyan-500' : 'bg-slate-700'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${isAiEnabled ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-400 text-xs">AI Difficulty</span>
                  </div>
                  <select 
                    value={aiDifficulty} 
                    onChange={e => setAiDifficulty(e.target.value as any)}
                    className="w-full bg-slate-800 text-white border border-slate-700 rounded-lg p-1.5 text-sm outline-none focus:border-cyan-500"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-400 text-xs">AI Speed</span>
                    <span className="text-cyan-400 font-mono text-xs">{aiPps} PPS</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.5" 
                    max="10" 
                    step="0.5"
                    value={aiPps} 
                    onChange={e => setAiPps(Number(e.target.value))}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Player 2 (AI) Area */}
        <div className="flex gap-4">
          <div className="flex flex-col gap-4">
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl w-32 flex flex-col items-center">
              <h3 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-4 text-center">Next</h3>
              <div className="flex flex-col gap-6">
                {aiNextPieces.slice(0, 3).map((typeId, i) => (
                  <div key={i} className="flex justify-center">
                    <MiniPiece typeId={typeId} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="relative bg-slate-900 p-4 rounded-3xl border-4 border-slate-800 shadow-2xl flex gap-3">
            <canvas
              ref={aiCanvasRef}
              width={COLS * BLOCK_SIZE}
              height={ROWS * BLOCK_SIZE}
              className="bg-slate-950 rounded-xl block"
            />
            <div className="w-3 bg-slate-950 rounded-full overflow-hidden flex flex-col justify-end border border-slate-800 relative">
              <div 
                className="bg-red-500 w-full transition-all duration-300 absolute bottom-0" 
                style={{ height: `${Math.min(100, (aiGarbage / ROWS) * 100)}%` }}
              />
            </div>
            {aiGameOver && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl">
                <h2 className="text-4xl font-black text-red-500 mb-2 tracking-widest uppercase">Game Over</h2>
                <p className="text-slate-300 text-lg">Score: {aiScore}</p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl w-32 text-center">
              <h3 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-2">Score</h3>
              <div className="text-2xl font-mono font-bold text-cyan-400">{aiScore}</div>
            </div>
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl w-32 text-center">
              <h3 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-2">Garbage</h3>
              <div className="text-2xl font-mono font-bold text-red-500">{aiGarbage}</div>
            </div>
          </div>
        </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 backdrop-blur-sm p-4">
          <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl w-full max-w-md">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">Controls</h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={exportSettings} 
                  className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition-colors"
                  title="Export Settings"
                >
                  <Download size={20} />
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition-colors"
                  title="Import Settings"
                >
                  <Upload size={20} />
                </button>
                <input 
                  type="file" 
                  accept=".json" 
                  ref={fileInputRef} 
                  onChange={importSettings} 
                  className="hidden" 
                />
                <button 
                  onClick={() => { setShowSettings(false); setListeningKey(null); setListeningGamepadKey(null); }} 
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ml-2"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="flex gap-4 mb-6 border-b border-slate-800 pb-2">
              <button 
                onClick={() => setSettingsTab('keyboard')}
                className={`pb-2 px-2 font-semibold transition-colors ${settingsTab === 'keyboard' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Keyboard
              </button>
              <button 
                onClick={() => setSettingsTab('gamepad')}
                className={`pb-2 px-2 font-semibold transition-colors ${settingsTab === 'gamepad' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Gamepad
              </button>
              <button 
                onClick={() => setSettingsTab('handling')}
                className={`pb-2 px-2 font-semibold transition-colors ${settingsTab === 'handling' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Handling
              </button>
            </div>
            
            {settingsTab === 'keyboard' && (
              <div className="space-y-4">
                {Object.entries(keybindings).map(([action, key]) => (
                  <div key={action} className="flex justify-between items-center">
                    <span className="text-slate-300 capitalize">{action.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <button 
                      onClick={() => { setListeningKey(action); setListeningGamepadKey(null); }}
                      className={`px-4 py-2 rounded-lg font-mono text-sm border transition-colors min-w-[120px] ${
                        listeningKey === action 
                          ? 'bg-cyan-600/20 border-cyan-500 text-cyan-400' 
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {listeningKey === action ? 'Press key...' : (String(key) === ' ' ? 'Space' : String(key).replace('Arrow', ''))}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {settingsTab === 'gamepad' && (
              <div className="space-y-4">
                {Object.entries(gamepadBindings).map(([action, btnIndex]) => (
                  <div key={action} className="flex justify-between items-center">
                    <span className="text-slate-300 capitalize">{action.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <button 
                      onClick={() => { setListeningGamepadKey(action); setListeningKey(null); }}
                      className={`px-4 py-2 rounded-lg font-mono text-sm border transition-colors min-w-[120px] ${
                        listeningGamepadKey === action 
                          ? 'bg-cyan-600/20 border-cyan-500 text-cyan-400' 
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {listeningGamepadKey === action ? 'Press button...' : `Button ${btnIndex}`}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {settingsTab === 'handling' && (
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-slate-300 text-sm font-semibold">Randomizer</label>
                  </div>
                  <select 
                    value={handling.randomizer || '7-bag'} 
                    onChange={e => setHandling({...handling, randomizer: e.target.value})}
                    className="w-full bg-slate-800 text-white border border-slate-700 rounded-lg p-2 outline-none focus:border-cyan-500"
                  >
                    <option value="7-bag">7-Bag (Modern)</option>
                    <option value="random">Completely Random (Classic)</option>
                  </select>
                  <p className="text-xs text-slate-500 mt-1">7-Bag ensures you get one of every piece every 7 pieces.</p>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-slate-300 text-sm font-semibold">DAS (Delayed Auto Shift)</label>
                    <span className="text-cyan-400 font-mono text-sm">{handling.das} ms</span>
                  </div>
                  <input type="range" min="0" max="500" step="5" value={handling.das} onChange={e => setHandling({...handling, das: Number(e.target.value)})} className="w-full accent-cyan-500" />
                  <p className="text-xs text-slate-500 mt-1">Initial delay before piece starts moving continuously.</p>
                </div>
                
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-slate-300 text-sm font-semibold">ARR (Auto Repeat Rate)</label>
                    <span className="text-cyan-400 font-mono text-sm">{handling.arr === 0 ? '0 ms (Instant)' : `${handling.arr} ms`}</span>
                  </div>
                  <input type="range" min="0" max="100" step="1" value={handling.arr} onChange={e => setHandling({...handling, arr: Number(e.target.value)})} className="w-full accent-cyan-500" />
                  <p className="text-xs text-slate-500 mt-1">Speed of continuous movement. 0 is instant to wall.</p>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-slate-300 text-sm font-semibold">DCD (DAS Cut Delay)</label>
                    <span className="text-cyan-400 font-mono text-sm">{handling.dcd} ms</span>
                  </div>
                  <input type="range" min="0" max="500" step="5" value={handling.dcd} onChange={e => setHandling({...handling, dcd: Number(e.target.value)})} className="w-full accent-cyan-500" />
                  <p className="text-xs text-slate-500 mt-1">Delay before DAS applies after a piece spawns.</p>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-slate-300 text-sm font-semibold">SDF (Soft Drop Factor)</label>
                    <span className="text-cyan-400 font-mono text-sm">{handling.sdf === Infinity ? 'Infinity' : `${handling.sdf}x`}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <input 
                      type="range" 
                      min="1" 
                      max="41" 
                      step="1" 
                      value={handling.sdf === Infinity ? 41 : handling.sdf} 
                      onChange={e => {
                        const val = Number(e.target.value);
                        setHandling({...handling, sdf: val > 40 ? Infinity : val});
                      }} 
                      className="flex-1 accent-cyan-500" 
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Soft drop speed multiplier. Max is instant.</p>
                </div>
              </div>
            )}
            
            <div className="mt-8 pt-6 border-t border-slate-800">
              <button 
                onClick={() => {
                  if (settingsTab === 'keyboard') setKeybindings(DEFAULT_KEYBINDINGS);
                  else if (settingsTab === 'gamepad') setGamepadBindings(DEFAULT_GAMEPAD_BINDINGS);
                  else setHandling(DEFAULT_HANDLING);
                }}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition-colors"
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
