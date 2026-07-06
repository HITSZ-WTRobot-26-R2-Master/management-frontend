import { useMemo } from "react";
import type { DecisionSnapshot } from "@/types/management";
import type { BlockState, SystemMode } from "../lib/types";
import { getIdMap } from "../lib/constants";
import { buildDecisionOverlayModel } from "../lib/decisionOverlay";
import { GridCell } from "./GridCell";

interface MainGridProps {
  blocks: BlockState[];
  decision: DecisionSnapshot;
  mode: SystemMode;
  onCellChange: (id: number, state: BlockState) => void;
}

export function MainGrid({ blocks, decision, mode, onCellChange }: MainGridProps) {
  const idMap = getIdMap(mode.color, mode.direction);
  const overlay = useMemo(
    () => buildDecisionOverlayModel(decision, mode),
    [decision, mode],
  );

  return (
    <div className="relative w-full h-full">
      <div
        className="grid gap-2 w-full h-full"
        style={{
          gridTemplateColumns: "0.3fr 1fr 1fr 1fr 1fr 0.3fr",
          gridTemplateRows: "0.3fr 1fr 1fr 1fr 0.3fr",
        }}
      >
        {Array.from({ length: 5 }, (_, gridRow) =>
          Array.from({ length: 6 }, (_, gridCol) => {
            // 判断是否为可交互区域（中间 3 行 4 列）
            const isInteractive = gridRow >= 1 && gridRow <= 3 && gridCol >= 1 && gridCol <= 4;

            if (!isInteractive) {
              return (
                <div
                  key={`${gridRow}-${gridCol}`}
                  className="border border-dashed border-muted-foreground/20 rounded-lg"
                />
              );
            }

            const interactiveRow = gridRow - 1;
            const interactiveCol = gridCol - 1;
            const cellId = idMap[interactiveRow][interactiveCol];

            return (
              <GridCell
                key={cellId}
                id={cellId}
                state={blocks[cellId - 1]}
                onChange={onCellChange}
              />
            );
          })
        )}
      </div>
      <svg
        className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <marker
            id="decision-scroll-arrowhead"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L6,3 L0,6 Z" fill="rgba(34, 211, 238, 0.88)" />
          </marker>
        </defs>
        {overlay.pathSegments.map((segment, index) => (
          <line
            key={`path-${index}`}
            x1={segment.from.x}
            y1={segment.from.y}
            x2={segment.to.x}
            y2={segment.to.y}
            stroke="rgba(251, 191, 36, 0.82)"
            strokeWidth={1.25}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {overlay.scrollArrows.map((segment, index) => (
          <line
            key={`scroll-arrow-${index}`}
            x1={segment.from.x}
            y1={segment.from.y}
            x2={segment.to.x}
            y2={segment.to.y}
            stroke="rgba(34, 211, 238, 0.88)"
            strokeWidth={1}
            strokeLinecap="round"
            markerEnd="url(#decision-scroll-arrowhead)"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {overlay.scrollCircles.map((circle, index) => (
          <circle
            key={`scroll-circle-${index}`}
            cx={circle.center.x}
            cy={circle.center.y}
            r={4.5}
            fill="transparent"
            stroke="rgba(34, 211, 238, 0.92)"
            strokeWidth={1.25}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}
