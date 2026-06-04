export type BlockState = "unknown" | "null" | "r1" | "r2" | "fake";

export interface SystemMode {
  color: "blue" | "red";
  direction: "front" | "back";
}

export interface CellPosition {
  row: number; // 0-indexed within the 3x4 interactive area
  col: number; // 0-indexed within the 3x4 interactive area
}
