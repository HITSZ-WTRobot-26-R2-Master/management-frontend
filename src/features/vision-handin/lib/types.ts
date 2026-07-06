export type BlockState = "unknown" | "null" | "r1" | "r2" | "fake";

export type MatchType =
  | "skill_zone1"
  | "skill_zone3_mid"
  | "skill_zone3_top"
  | "arena";

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  skill_zone1: "技能赛\n一区",
  skill_zone3_mid: "技能赛\n三区中层",
  skill_zone3_top: "技能赛\n三区顶层",
  arena: "竞技赛",
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
