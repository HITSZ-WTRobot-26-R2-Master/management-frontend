import type { DecisionSnapshot } from "@/types/management";
import type { SystemMode } from "./types";
import { getIdMap } from "./constants";

export interface OverlayPoint {
  x: number;
  y: number;
}

export interface OverlaySegment {
  from: OverlayPoint;
  to: OverlayPoint;
}

export interface OverlayCircle {
  center: OverlayPoint;
}

export interface DecisionOverlayModel {
  pathSegments: OverlaySegment[];
  scrollArrows: OverlaySegment[];
  scrollCircles: OverlayCircle[];
}

const GRID_COLUMNS = [0.3, 1, 1, 1, 1, 0.3];
const GRID_ROWS = [0.3, 1, 1, 1, 0.3];
const ENTRY_EXIT_OFFSET = 0.34;

export function buildDecisionOverlayModel(
  decision: DecisionSnapshot | null | undefined,
  mode: SystemMode,
): DecisionOverlayModel {
  if (!decision?.available) {
    return emptyModel();
  }

  const positions = getStepCenters(mode);
  const pathPoints = actionOrderPoints(decision.action_order, mode, positions);
  const pathSegments = adjacentSegments(pathPoints);
  const scrollCircles: OverlayCircle[] = [];
  const scrollArrows: OverlaySegment[] = [];

  for (const pick of decision.scroll_picks) {
    const get = positions.get(pick.get);
    if (!get) {
      continue;
    }
    scrollCircles.push({ center: get });
    const from = pick.from === 0 ? entryPointNear(get, mode) : positions.get(pick.from);
    if (from) {
      scrollArrows.push({ from, to: get });
    }
  }

  return {
    pathSegments,
    scrollArrows,
    scrollCircles,
  };
}

export function getStepCenters(mode: SystemMode): Map<number, OverlayPoint> {
  const idMap = getIdMap(mode.color, mode.direction);
  const centers = new Map<number, OverlayPoint>();
  for (let row = 0; row < idMap.length; row++) {
    for (let col = 0; col < idMap[row].length; col++) {
      centers.set(idMap[row][col], gridCellCenter(row + 1, col + 1));
    }
  }
  return centers;
}

export function entryPointNear(step: OverlayPoint, mode: SystemMode): OverlayPoint {
  return edgePointNear(step, zoneDirection(mode, "entry"));
}

export function exitPointNear(step: OverlayPoint, mode: SystemMode): OverlayPoint {
  return edgePointNear(step, zoneDirection(mode, "exit"));
}

function actionOrderPoints(
  actionOrder: number[],
  mode: SystemMode,
  positions: Map<number, OverlayPoint>,
): OverlayPoint[] {
  const nonZeroSteps = actionOrder.filter((step) => step !== 0);
  const points = nonZeroSteps
    .map((step) => positions.get(step))
    .filter((point): point is OverlayPoint => Boolean(point));

  if (points.length === 0) {
    return [];
  }

  if (actionOrder[0] === 0) {
    points.unshift(entryPointNear(points[0], mode));
  }
  if (actionOrder[actionOrder.length - 1] === 0) {
    points.push(exitPointNear(points[points.length - 1], mode));
  }

  return points;
}

function adjacentSegments(points: OverlayPoint[]): OverlaySegment[] {
  const segments: OverlaySegment[] = [];
  for (let index = 1; index < points.length; index++) {
    segments.push({
      from: points[index - 1],
      to: points[index],
    });
  }
  return segments;
}

function gridCellCenter(row: number, col: number): OverlayPoint {
  const x = centerFromWeights(GRID_COLUMNS, col);
  const y = centerFromWeights(GRID_ROWS, row);
  return { x, y };
}

function centerFromWeights(weights: number[], index: number): number {
  const total = weights.reduce((sum, item) => sum + item, 0);
  const before = weights.slice(0, index).reduce((sum, item) => sum + item, 0);
  return ((before + weights[index] / 2) / total) * 100;
}

function edgePointNear(step: OverlayPoint, direction: "left" | "right"): OverlayPoint {
  const offset = (100 / GRID_COLUMNS.reduce((sum, item) => sum + item, 0)) * ENTRY_EXIT_OFFSET;
  return {
    x: direction === "left" ? step.x - offset : step.x + offset,
    y: step.y,
  };
}

function zoneDirection(mode: SystemMode, zone: "entry" | "exit"): "left" | "right" {
  const leftIsZoneThree = mode.direction === "front";
  if (zone === "entry") {
    return leftIsZoneThree ? "right" : "left";
  }
  return leftIsZoneThree ? "left" : "right";
}

function emptyModel(): DecisionOverlayModel {
  return {
    pathSegments: [],
    scrollArrows: [],
    scrollCircles: [],
  };
}
