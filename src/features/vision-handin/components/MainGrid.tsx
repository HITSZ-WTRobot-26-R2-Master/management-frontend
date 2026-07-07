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
            <path d="M0,0 L6,3 L0,6 Z" fill="rgba(168, 85, 247, 0.9)" />
          </marker>
        </defs>
        {overlay.pathSegments.map((segment, index) => (
          <line
            key={`path-${index}`}
            x1={segment.from.x}
            y1={segment.from.y}
            x2={segment.to.x}
            y2={segment.to.y}
            stroke="rgba(0, 0, 0, 0.82)"
            strokeWidth={4}
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
            stroke="rgba(168, 85, 247, 0.9)"
            strokeWidth={3}
            strokeLinecap="round"
            markerEnd="url(#decision-scroll-arrowhead)"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 z-10 overflow-visible" aria-hidden="true">
        {overlay.scrollCircles.map((circle, index) => (
          <div
            key={`scroll-circle-${index}`}
            className="absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-purple-500/90"
            style={{
              left: `${circle.center.x}%`,
              top: `${circle.center.y}%`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
