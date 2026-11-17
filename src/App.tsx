import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, RotateCcw, Settings, X, Download, Upload } from 'lucide-react';
import { calculateGarbage } from './attackTable';
import {
  boardToRows,
  simulate as aiSimulate,
} from './ai/engine';
import {
  Difficulty,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  OPENER_NAMES,
  OpenerGoal,
  chooseOpener,
  decide as aiDecide,
} from './ai/strategy';
import type { Plan } from './ai/planner';

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

/**
 * The board-space T-spin rule (three-corner rule + mini detection).
 *
 * This reads the *cleared* board, so any material this piece placed is gone and
 * the corners can only be seen for rows that survived the clear. The renderer and
 * the AI therefore also record the rule result at lock time, when the board still
 * contains the piece; `spinAtLock` is preferred whenever it is available.
 */
const getSpinType = (
  board: number[][],
  piece: { typeId: number, x: number, y: number, rotationState: number },
  lastMove: { type: 'move' | 'rotate' | 'drop' | 'hardDrop', kickIndex?: number } | null
): 'normal' | 'mini' | null => {
  if (!lastMove || lastMove.type !== 'rotate') return null;

  if (piece.typeId === 6) {
    const corners = [
      { x: piece.x, y: piece.y },         // Top-left
      { x: piece.x + 2, y: piece.y },     // Top-right
      { x: piece.x + 2, y: piece.y + 2 }, // Bottom-right
      { x: piece.x, y: piece.y + 2 }      // Bottom-left
    ];

    let occupiedCorners = 0;
    const occupied = corners.map(c => {
      const isOccupied =
        c.y < 0 || c.y >= ROWS || c.x < 0 || c.x >= COLS || board[c.y][c.x] !== 0;
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
  
  const [aiDifficulty, setAiDifficulty] = useState<Difficulty>('medium');
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
  const p1SpinAtLockRef = useRef<'normal' | 'mini' | null>(null);
  
  const aiComboRef = useRef<number>(-1);
  const aiB2bCounterRef = useRef<number>(0);
  const aiLastMoveRef = useRef<{ type: 'move' | 'rotate' | 'drop' | 'hardDrop', kickIndex?: number } | null>(null);
  const aiSpinAtLockRef = useRef<'normal' | 'mini' | null>(null);
  
  const p1ClearingLinesRef = useRef<{ y: number, blocks: number[], timer: number }[]>([]);
  const aiClearingLinesRef = useRef<{ y: number, blocks: number[], timer: number }[]>([]);
  
  const aiDropCounterRef = useRef<number>(0);
  const aiTargetRef = useRef<{x: number, y: number, rotation: number, lastMove: any} | null>(null);
  const aiTimerRef = useRef(0);

  // ---- AI brain state (shared by both boards) ------------------------------
  const [aiHold, setAiHold] = useState<number | null>(null);
  const aiHoldRef = useRef<number | null>(null);
  const aiCanHoldRef = useRef(true);
  const p1CanHoldRef = useRef(true);
  const p1PlanRef = useRef<Plan | null>(null);
  const aiPlanRef = useRef<Plan | null>(null);
  const p1OpenerRef = useRef<OpenerGoal | null>(null);
  const aiOpenerRef = useRef<OpenerGoal | null>(null);
  const p1PiecesPlacedRef = useRef(0);
  const aiPiecesPlacedRef = useRef(0);
  // The I-well each brain is currently building around (-1 = none chosen yet).
  const p1WellColumnRef = useRef(-1);
  const aiWellColumnRef = useRef(-1);
  const [aiStrategy, setAiStrategy] = useState<{ label: string; detail: string } | null>(null);
  const aiStrategyRef = useRef<{ label: string; detail: string } | null>(null);
  const aiDecisionIdRef = useRef(0);
  
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
      
      const tSpinType = p1SpinAtLockRef.current
        ?? (pieceRef.current ? getSpinType(boardRef.current, pieceRef.current, p1LastMoveRef.current) : null);
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
      
      const tSpinType = aiSpinAtLockRef.current
        ?? (aiPieceRef.current ? getSpinType(aiBoardRef.current, aiPieceRef.current, aiLastMoveRef.current) : null);
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

  /**
   * Runs the AI planner for a board and returns the target the piece must reach.
   *
   * `side` is 'p1' (the AI autoplaying the player board) or 'ai' (the opponent).
   * Both use the same engine; they only differ in which state they read.
   */
  const planAiMove = useCallback((
    side: 'p1' | 'ai',
    board: number[][],
    pieceType: number,
    queue: number[],
    hold: number | null,
    canHold: boolean,
    b2b: number,
    combo: number,
    incomingGarbage: number,
    difficulty: Difficulty,
    plan: Plan | null,
    piecesPlaced: number,
    opener: OpenerGoal | null,
    wellColumn: number,
  ) => {
    const decision = aiDecide({
      board,
      current: pieceType,
      queue,
      hold,
      canHold,
      b2b,
      combo,
      incomingGarbage,
      piecesPlaced,
      opener,
      difficulty,
      plan,
      wellColumn,
      // Decision time tracks the AI's speed: at 10 PPS there are only 100 ms per
      // piece, so a heavy search must thin out rather than stutter the frame.
      timeBudgetMs: Math.max(8, Math.min(45, (1000 / Math.max(0.5, aiPpsRef.current)) * 0.6)),
    });
    if (!decision) return null;

    return {
      side,
      placement: decision.placement,
      useHold: decision.useHold,
      plan: decision.plan,
      label: decision.label,
      intent: decision.intent,
      wellColumn: decision.wellColumn,
    };
  }, []);


/**
 * Resolves the exact board position for an AI target.
 *
 * The AI works on a flat board model, so its `y` is an absolute board row. The
 * game spawns pieces at row 0 and applies targets directly, so this recomputes the
 * resting row from the live board and the target matrix: the AI's intent (column,
 * rotation) is preserved while the row is guaranteed to be a real resting place.
 */
const resolveTargetPosition = (
  board: number[][],
  typeId: number,
  rotation: number,
  targetX: number,
) => {
  let matrix = SHAPES[typeId];
  for (let i = 0; i < rotation; i++) matrix = rotateMatrix(matrix, 1);
  const piece = { matrix, x: targetX, y: 0 } as { matrix: number[][]; x: number; y: number };

  const collidesAt = (py: number) => {
    for (let yy = 0; yy < matrix.length; yy++) {
      for (let xx = 0; xx < matrix[yy].length; xx++) {
        if (matrix[yy][xx] === 0) continue;
        const by = py + yy;
        const bx = targetX + xx;
        if (by < 0) continue;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (board[by] && board[by][bx] !== 0) return true;
      }
    }
    return false;
  };

  // Start above the board, exactly like a hard drop from the spawn row, so the
  // result is always the topmost resting place (the same one the AI planned).
  piece.y = -matrix.length;
  while (!collidesAt(piece.y + 1)) piece.y++;
  return { x: targetX, y: piece.y };
};

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
    p1SpinAtLockRef.current = null;
    
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
      p1AiTargetRef.current = null;
    }
  }, [collide, initNextPieces, handling.dcd, getPieceFromSequence]);

  /** Recompute the autopilot target for the piece currently in play (P1). */
  const planP1Move = useCallback(() => {
    if (!pieceRef.current) return;
    const decision = planAiMove(
      'p1',
      boardRef.current,
      pieceRef.current.typeId,
      nextPiecesRef.current.slice(0, 4),
      heldPiece,
      p1CanHoldRef.current,
      p1B2bCounterRef.current,
      p1ComboRef.current,
      p1GarbageQueueRef.current,
      aiDifficultyRef.current,
      p1PlanRef.current,
      p1PiecesPlacedRef.current,
      p1OpenerRef.current,
      p1WellColumnRef.current,
    );
    if (!decision) {
      p1AiTargetRef.current = null;
      return;
    }
    p1WellColumnRef.current = decision.wellColumn;
    p1AiTargetRef.current = {
      x: decision.placement.x,
      y: decision.placement.y,
      rotation: decision.placement.rotation,
      lastMove: null,
      spin: decision.placement.spin,
      useHold: decision.useHold,
      nextType: nextPiecesRef.current[0],
    };
    p1PlanRef.current = decision.plan;
  }, [planAiMove, heldPiece]);

  /** Recompute the opponent's move for the piece currently in play. */
  const planAiOpponentMove = useCallback(() => {
    if (!aiPieceRef.current) return;
    const decision = planAiMove(
      'ai',
      aiBoardRef.current,
      aiPieceRef.current.typeId,
      aiNextPiecesRef.current.slice(0, 4),
      aiHoldRef.current,
      aiCanHoldRef.current,
      aiB2bCounterRef.current,
      aiComboRef.current,
      aiGarbageQueueRef.current,
      aiDifficultyRef.current,
      aiPlanRef.current,
      aiPiecesPlacedRef.current,
      aiOpenerRef.current,
      aiWellColumnRef.current,
    );
    if (!decision) {
      aiTargetRef.current = null;
      return;
    }
    aiWellColumnRef.current = decision.wellColumn;
    aiTargetRef.current = {
      x: decision.placement.x,
      y: decision.placement.y,
      rotation: decision.placement.rotation,
      lastMove: null,
      spin: decision.placement.spin,
      useHold: decision.useHold,
    };
    aiPlanRef.current = decision.plan;
    aiStrategyRef.current = {
      label: decision.label || decision.intent,
      detail: aiDifficultyRef.current,
    };
    setAiStrategy(aiStrategyRef.current);
  }, [planAiMove]);

  const aiSpawnPiece = useCallback((specificTypeId?: number) => {
    if (aiNextPiecesRef.current.length === 0) {
      aiInitNextPieces();
    }

    let typeId: number;
    if (specificTypeId !== undefined) {
      typeId = specificTypeId;
    } else {
      typeId = aiNextPiecesRef.current.shift()!;
      aiNextPiecesRef.current.push(getPieceFromSequence(aiPieceIndexRef.current++));
      setAiNextPieces([...aiNextPiecesRef.current]);
    }

    const matrix = SHAPES[typeId];
    const x = Math.floor(COLS / 2) - Math.floor(matrix[0].length / 2);
    const y = 0;
    
    const piece = { typeId, matrix: JSON.parse(JSON.stringify(matrix)), x, y, rotationState: 0 };
    aiPieceRef.current = piece;
    
    aiLastMoveRef.current = null;
    aiSpinAtLockRef.current = null;
    
    aiTargetRef.current = null;
    if (collide(aiBoardRef.current, piece)) {
      setAiGameOver(true);
      aiGameOverRef.current = true;
      setIsPlaying(false);
      playGameOverSound();
    }
  }, [getPieceFromSequence, aiInitNextPieces, collide]);

  const lockPiece = useCallback(() => {
    if (!pieceRef.current) return;
    // Judge the spin before the board changes: after the clear the piece's own
    // cells are gone, and for a T-spin whose corners came from this piece the
    // cleared board can no longer prove the spin.
    p1SpinAtLockRef.current = getSpinType(boardRef.current, pieceRef.current, p1LastMoveRef.current);
    merge(boardRef.current, pieceRef.current);
    sweep();
    
    if (p1GarbageQueueRef.current > 0) {
      boardRef.current = applyGarbage(boardRef.current, p1GarbageQueueRef.current);
      p1GarbageQueueRef.current = 0;
      setP1Garbage(0);
    }
    
    setHasHeldBoth(false);
    p1CanHoldRef.current = true;
    p1PiecesPlacedRef.current++;
    p1AiTargetRef.current = null;
    spawnPiece();
  }, [merge, sweep, spawnPiece, setHasHeldBoth]);

  const aiLockPiece = useCallback(() => {
    if (!aiPieceRef.current) return;
    aiSpinAtLockRef.current = getSpinType(aiBoardRef.current, aiPieceRef.current, aiLastMoveRef.current);
    merge(aiBoardRef.current, aiPieceRef.current);
    aiSweep();
    
    if (aiGarbageQueueRef.current > 0) {
      aiBoardRef.current = applyGarbage(aiBoardRef.current, aiGarbageQueueRef.current);
      aiGarbageQueueRef.current = 0;
      setAiGarbage(0);
    }

    aiCanHoldRef.current = true;
    aiPiecesPlacedRef.current++;
    aiTargetRef.current = null;
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
      p1CanHoldRef.current = false;
      spawnPiece();
    } else {
      const previousHeld = heldPiece;
      setHeldPiece(currentTypeId);
      p1CanHoldRef.current = false;
      spawnPiece(previousHeld);
    }

    setHasHeldBoth(true);
  }, [heldPiece, spawnPiece, setHasHeldBoth]);

  /** Hold/swap for the opponent board (mirrors playerHold). */
  const aiHoldPiece = useCallback(() => {
    if (!aiCanHoldRef.current || !aiPieceRef.current) return;
    const currentTypeId = aiPieceRef.current.typeId;
    aiCanHoldRef.current = false;

    if (aiHoldRef.current === null) {
      aiHoldRef.current = currentTypeId;
      setAiHold(currentTypeId);
      aiSpawnPiece();
    } else {
      const previousHeld = aiHoldRef.current;
      aiHoldRef.current = currentTypeId;
      setAiHold(currentTypeId);
      aiSpawnPiece(previousHeld);
    }
  }, [aiSpawnPiece]);

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
      if (isAiEnabledRef.current && pieceRef.current) {
        if (!p1AiTargetRef.current) planP1Move();
        if (p1AiTargetRef.current) {
          p1AiTimerRef.current += deltaTime;
          const delayMs = 1000 / aiPpsRef.current;
          if (p1AiTimerRef.current > delayMs) {
            p1AiTimerRef.current -= delayMs;
            if (p1AiTimerRef.current > delayMs) p1AiTimerRef.current = delayMs; // Cap to prevent infinite growth
            const target = p1AiTargetRef.current;
            const piece = pieceRef.current;

            if (target.useHold && !hasHeldRef.current) {
              playerHold();
              p1AiTargetRef.current = null;
            } else {
              piece.rotationState = target.rotation;
              let matrix = SHAPES[piece.typeId];
              for (let i = 0; i < target.rotation; i++) matrix = rotateMatrix(matrix, 1);
              const at = resolveTargetPosition(boardRef.current, piece.typeId, target.rotation, target.x);
              piece.matrix = matrix;
              piece.x = at.x;
              piece.y = at.y;

              // A tuck placement is only reachable with a kick, and the corner
              // rule still has the final say, so mark it as the 180 kick so a
              // finished T-spin always registers as 'normal'.
              p1LastMoveRef.current = target.spin
                ? { type: 'rotate', kickIndex: 4 }
                : { type: 'hardDrop' };
              lockPiece();
            }
          }
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
      if (aiPieceRef.current) {
        if (!aiTargetRef.current) planAiOpponentMove();
        if (aiTargetRef.current) {
          aiTimerRef.current += deltaTime;
          const delayMs = 1000 / aiPpsRef.current;
          if (aiTimerRef.current > delayMs) {
            aiTimerRef.current -= delayMs;
            if (aiTimerRef.current > delayMs) aiTimerRef.current = delayMs; // Cap to prevent infinite growth
            const target = aiTargetRef.current;
            const piece = aiPieceRef.current;

            if (target.useHold && aiCanHoldRef.current) {
              aiHoldPiece();
              aiTargetRef.current = null;
            } else {
              piece.rotationState = target.rotation;
              let matrix = SHAPES[piece.typeId];
              for (let i = 0; i < target.rotation; i++) matrix = rotateMatrix(matrix, 1);
              const at = resolveTargetPosition(aiBoardRef.current, piece.typeId, target.rotation, target.x);
              piece.matrix = matrix;
              piece.x = at.x;
              piece.y = at.y;

              aiLastMoveRef.current = target.spin
                ? { type: 'rotate', kickIndex: 4 }
                : { type: 'hardDrop' };
              aiLockPiece();
            }
          }
        }
      }
    }
    
    draw();
    requestRef.current = requestAnimationFrame(update);
  }, [draw, playerDrop, pollGamepad, playerMove, playerSoftDropToBottom, handling, lockPiece, collide, playerRotate, playerHardDrop, playerHold, aiRotate, aiMove, aiHardDrop, aiLockPiece, aiHoldPiece, planP1Move, planAiOpponentMove]);

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

    // AI brains
    p1AiTargetRef.current = null;
    aiTargetRef.current = null;
    p1PlanRef.current = null;
    aiPlanRef.current = null;
    p1PiecesPlacedRef.current = 0;
    aiPiecesPlacedRef.current = 0;
    p1WellColumnRef.current = -1;
    aiWellColumnRef.current = -1;
    p1CanHoldRef.current = true;
    aiCanHoldRef.current = true;
    aiHoldRef.current = null;
    setAiHold(null);
    aiStrategyRef.current = null;
    setAiStrategy(null);

    // Hard/expert open with a known opener; easy/medium just play.
    p1OpenerRef.current = chooseOpener(aiDifficultyRef.current);
    aiOpenerRef.current = chooseOpener(aiDifficultyRef.current);

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
                    onChange={e => {
                      const next = e.target.value as Difficulty;
                      setAiDifficulty(next);
                      // Restart the opener repertoire for the new level.
                      p1OpenerRef.current = chooseOpener(next);
                      aiOpenerRef.current = chooseOpener(next);
                      p1PlanRef.current = null;
                      aiPlanRef.current = null;
                      p1AiTargetRef.current = null;
                      aiTargetRef.current = null;
                      p1WellColumnRef.current = -1;
                      aiWellColumnRef.current = -1;
                    }}
                    className="w-full bg-slate-800 text-white border border-slate-700 rounded-lg p-1.5 text-sm outline-none focus:border-cyan-500"
                  >
                    {DIFFICULTIES.map(d => (
                      <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>
                    ))}
                  </select>
                  <p className="text-[11px] leading-snug text-slate-500 mt-2">
                    {aiDifficulty === 'easy' && 'Casual but tidy: flat stack, grinds singles and doubles.'}
                    {aiDifficulty === 'medium' && 'Solid ladder play: keeps an I-well, tetrises on purpose.'}
                    {aiDifficulty === 'hard' && 'Openers, T-spins, tetrises and all clears, two moves ahead.'}
                    {aiDifficulty === 'expert' && 'Three moves ahead: T-spin triples, deep all-clear hunting.'}
                  </p>
                  {(aiDifficulty === 'hard' || aiDifficulty === 'expert') && (
                    <p className="text-[11px] leading-snug text-slate-600 mt-1">
                      Opens with: {OPENER_NAMES[aiDifficulty].join(', ')}
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">AI plan</span>
                    <span className="text-cyan-400 font-mono truncate ml-2 max-w-[9rem] text-right">
                      {aiStrategy?.label || 'thinking'}
                    </span>
                  </div>
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
              <h3 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-2 text-center">Hold</h3>
              <div className="h-16 flex items-center justify-center">
                {aiHold ? <MiniPiece typeId={aiHold} disabled={!aiCanHoldRef.current} /> : <span className="text-slate-600 text-sm">Empty</span>}
              </div>
            </div>
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
