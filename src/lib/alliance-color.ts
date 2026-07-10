import type { BlockStatesColor } from "@/types/management"

const allianceBackgroundColors = {
  blue: "rgb(128, 191, 209)",
  red: "rgb(236, 162, 151)",
} satisfies Record<BlockStatesColor, string>

const opponentAllianceColors = {
  blue: "red",
  red: "blue",
} satisfies Record<BlockStatesColor, BlockStatesColor>

export function getAllianceBackgroundColor(color: BlockStatesColor) {
  return allianceBackgroundColors[color]
}

export function getOpponentAllianceColor(color: BlockStatesColor) {
  return opponentAllianceColors[color]
}
