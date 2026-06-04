import type { BlockState, SystemMode } from "../lib/types";
import { getIdMap } from "../lib/constants";
import { GridCell } from "./GridCell";

interface MainGridProps {
  blocks: BlockState[];
  mode: SystemMode;
  onCellChange: (id: number, state: BlockState) => void;
}

export function MainGrid({ blocks, mode, onCellChange }: MainGridProps) {
  const idMap = getIdMap(mode.color, mode.direction);

  return (
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
  );
}
