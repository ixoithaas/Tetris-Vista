export const ATTACK_TABLE: Record<string, any> = {
  Single: [0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3],
  Double: [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6],
  Triple: [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12],
  Quad: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
  "T-Spin Mini Single": [0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3],
  "T-Spin Single": [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12],
  "T-Spin Mini Double": [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6],
  "T-Spin Double": [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
  "T-Spin Triple": [6, 7, 9, 10, 12, 13, 15, 16, 18, 19, 21, 22, 24, 25, 27, 28, 30, 31, 33, 34, 36],
  
  B2B1: {
    Quad: [5, 6, 7, 8, 10, 11, 12, 13, 15, 16, 17, 18, 20, 21, 22, 23, 25, 26, 27, 28, 30],
    "T-Spin Mini Single": [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6],
    "T-Spin Single": [3, 3, 4, 5, 6, 6, 7, 8, 9, 9, 10, 11, 12, 12, 13, 14, 15, 15, 16, 17, 18],
    "T-Spin Mini Double": [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12],
    "T-Spin Double": [5, 6, 7, 8, 10, 11, 12, 13, 15, 16, 17, 18, 20, 21, 22, 23, 25, 26, 27, 28, 30],
    "T-Spin Triple": [7, 8, 10, 12, 14, 15, 17, 19, 21, 22, 24, 26, 28, 29, 31, 33, 35, 36, 38, 40, 42]
  },
  B2B2: {
    Quad: [6, 7, 9, 10, 12, 13, 15, 16, 18, 19, 21, 22, 24, 25, 27, 28, 30, 31, 33, 34, 36],
    "T-Spin Mini Single": [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12],
    "T-Spin Single": [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
    "T-Spin Mini Double": [3, 3, 4, 5, 6, 6, 7, 8, 9, 9, 10, 11, 12, 12, 13, 14, 15, 15, 16, 17, 18],
    "T-Spin Double": [6, 7, 9, 10, 12, 13, 15, 16, 18, 19, 21, 22, 24, 25, 27, 28, 30, 31, 33, 34, 36],
    "T-Spin Triple": [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48]
  },
  B2B3: {
    Quad: [7, 8, 10, 12, 14, 15, 17, 19, 21, 22, 24, 26, 28, 29, 31, 33, 35, 36, 38, 40, 42],
    "T-Spin Mini Single": [3, 3, 4, 5, 6, 6, 7, 8, 9, 9, 10, 11, 12, 12, 13, 14, 15, 15, 16, 17, 18],
    "T-Spin Single": [5, 6, 7, 8, 10, 11, 12, 13, 15, 16, 17, 18, 20, 21, 22, 23, 25, 26, 27, 28, 30],
    "T-Spin Mini Double": [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
    "T-Spin Double": [7, 8, 10, 12, 14, 15, 17, 19, 21, 22, 24, 26, 28, 29, 31, 33, 35, 36, 38, 40, 42],
    "T-Spin Triple": [9, 11, 13, 15, 18, 20, 22, 24, 27, 29, 31, 33, 36, 38, 40, 42, 45, 47, 49, 51, 54]
  },
  B2B4: {
    Quad: [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48],
    "T-Spin Mini Single": [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
    "T-Spin Single": [6, 7, 9, 10, 12, 13, 15, 16, 18, 19, 21, 22, 24, 25, 27, 28, 30, 31, 33, 34, 36],
    "T-Spin Mini Double": [5, 6, 7, 8, 10, 11, 12, 13, 15, 16, 17, 18, 20, 21, 22, 23, 25, 26, 27, 28, 30],
    "T-Spin Double": [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48],
    "T-Spin Triple": [10, 12, 15, 17, 20, 22, 25, 27, 30, 32, 35, 37, 40, 42, 45, 47, 50, 52, 55, 57, 60]
  }
};

export function calculateGarbage(
  linesCleared: number,
  tSpinType: 'normal' | 'mini' | null,
  b2bCounter: number,
  combo: number,
  isPerfectClear: boolean
): number {
  let garbage = 0;
  
  if (isPerfectClear) {
    garbage += 10;
  }
  
  if (linesCleared === 0) return garbage;
  
  let attackType = "";
  if (tSpinType === 'mini') {
    if (linesCleared === 1) attackType = "T-Spin Mini Single";
    else if (linesCleared === 2) attackType = "T-Spin Mini Double";
  } else if (tSpinType === 'normal') {
    if (linesCleared === 1) attackType = "T-Spin Single";
    else if (linesCleared === 2) attackType = "T-Spin Double";
    else if (linesCleared === 3) attackType = "T-Spin Triple";
  } else {
    if (linesCleared === 1) attackType = "Single";
    else if (linesCleared === 2) attackType = "Double";
    else if (linesCleared === 3) attackType = "Triple";
    else if (linesCleared === 4) attackType = "Quad";
  }
  
  if (!attackType) return garbage;
  
  const safeCombo = Math.min(Math.max(0, combo), 20);
  
  let b2bLevel = "";
  if (b2bCounter > 0 && (linesCleared === 4 || tSpinType !== null)) {
    if (b2bCounter <= 2) b2bLevel = "B2B1";
    else if (b2bCounter <= 7) b2bLevel = "B2B2";
    else if (b2bCounter <= 23) b2bLevel = "B2B3";
    else b2bLevel = "B2B4";
  }
  
  if (b2bLevel && ATTACK_TABLE[b2bLevel] && ATTACK_TABLE[b2bLevel][attackType]) {
    garbage += ATTACK_TABLE[b2bLevel][attackType][safeCombo];
  } else if (ATTACK_TABLE[attackType]) {
    garbage += ATTACK_TABLE[attackType][safeCombo];
  }
  
  return garbage;
}
