export type BlockState = "unknown" | "null" | "r1" | "r2" | "fake";

export type MatchType =
  | "martial_merlin"
  | "combat_only_middle"
  | "combat_only_top"
  | "competition_full";

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  martial_merlin: "技能赛\n一区",
  combat_only_middle: "技能赛\n三区中层",
  combat_only_top: "技能赛\n三区顶层",
  competition_full: "竞技赛",
};

export interface SystemMode {
  color: "blue" | "red";
  direction: "front" | "back";
  matchType: MatchType;
}

export interface CellPosition {
  row: number; // 0-indexed within the 3x4 interactive area
  col: number; // 0-indexed within the 3x4 interactive area
}
