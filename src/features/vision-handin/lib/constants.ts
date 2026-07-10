import type { BlockState, SystemMode } from "./types";

export const STATE_LABELS: Record<BlockState, string> = {
  unknown: "Unknown",
  null: "Null",
  r1: "R1",
  r2: "R2",
  fake: "Fake",
};

/** Blue + Front 模式下 (interactive_row=1..3, interactive_col=1..4) 的 ID 排布 */
const BLUE_FRONT_MAP: number[][] = [
  [12, 9, 6, 3],
  [11, 8, 5, 2],
  [10, 7, 4, 1],
];

/** 旋转 180 度 */
function rotate180(map: number[][]): number[][] {
  const rows = map.length;
  const cols = map[0].length;
  const result: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      result[rows - 1 - r][cols - 1 - c] = map[r][c];
    }
  }
  return result;
}

/** 关于行对称镜像 */
function mirrorRows(map: number[][]): number[][] {
  const rows = map.length;
  const result: number[][] = Array.from({ length: rows }, () => Array(map[0].length).fill(0));
  for (let r = 0; r < rows; r++) {
    result[rows - 1 - r] = map[r];
  }
  return result;
}

export function getIdMap(color: SystemMode["color"], direction: SystemMode["direction"]): number[][] {
  if (color === "blue" && direction === "front") {
    return BLUE_FRONT_MAP;
  }
  if (color === "blue" && direction === "back") {
    return rotate180(BLUE_FRONT_MAP);
  }
  if (color === "red" && direction === "front") {
    return mirrorRows(BLUE_FRONT_MAP);
  }
  // red + back
  return rotate180(mirrorRows(BLUE_FRONT_MAP));
}

export function getSideLabels(color: SystemMode["color"], direction: SystemMode["direction"]): { left: string; right: string } {
  const leftBlue = "决胜区\n竞技场\n三区";
  const rightBlue = "启动区\n武馆\n一区";

  if (color === "blue") {
    if (direction === "front") {
      return { left: leftBlue, right: rightBlue };
    } else {
      return { left: rightBlue, right: leftBlue };
    }
  } else {
    if (direction === "front") {
      return { left: leftBlue, right: rightBlue };
    } else {
      return { left: rightBlue, right: leftBlue };
    }
  }
}

/** 格子编号 → 高度映射 (ID 1~12) */
export const CELL_HEIGHTS: number[] = [400, 200, 400, 200, 400, 600, 400, 600, 400, 200, 400, 200];

/** 高度 → 背景颜色 */
export const HEIGHT_COLORS: Record<number, string> = {
  200: "rgb(41, 82, 16)",
  400: "rgb(42, 113, 56)",
  600: "rgb(152, 166, 80)",
};
