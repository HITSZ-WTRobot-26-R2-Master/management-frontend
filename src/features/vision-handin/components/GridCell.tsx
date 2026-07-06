import type { BlockState } from "../lib/types";
import { STATE_LABELS, CELL_HEIGHTS, HEIGHT_COLORS } from "../lib/constants";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface GridCellProps {
  id: number;
  state: BlockState;
  onChange: (id: number, state: BlockState) => void;
}

const ALL_BUTTONS: { state: BlockState; label: string; className: string }[] = [
  { state: "null", label: "Null", className: "bg-gray-200 hover:bg-gray-300 text-gray-800" },
  { state: "r1", label: "R1", className: "bg-blue-500 hover:bg-blue-600 text-white" },
  { state: "r2", label: "R2", className: "bg-green-500 hover:bg-green-600 text-white" },
  { state: "fake", label: "Fake", className: "bg-red-500 hover:bg-red-600 text-white" },
];

function getButtons(id: number) {
  return ALL_BUTTONS.filter((btn) => {
    if (btn.state === "r1" && (id === 5 || id === 8)) return false;
    if (btn.state === "fake" && (id === 1 || id === 2 || id === 3)) return false;
    return true;
  });
}

export function GridCell({ id, state, onChange }: GridCellProps) {
  const height = CELL_HEIGHTS[id - 1];
  const bgColor = HEIGHT_COLORS[height];
  const buttons = getButtons(id);

  return (
    <div
      className="relative flex flex-col items-center p-1 border rounded-lg h-full @container"
      style={{ backgroundColor: bgColor }}
    >
      {/* 第一行：编号 + 状态，上下堆叠，占一半高度 */}
      <div className="relative z-20 flex flex-col items-center justify-center leading-none font-medium flex-1 min-h-0">
        <span className="font-bold text-[clamp(1rem,10cqw,3.5rem)] leading-tight">
          <span className="text-white/40">#{id}</span>{" "}
          <span className="text-white/90">{height}mm</span>
        </span>
        <span className="font-bold text-white text-[clamp(1rem,10cqw,3.5rem)] leading-tight">
          {STATE_LABELS[state]}
        </span>
      </div>
      {/* 第二/三行：2×2 按钮矩阵，占一半高度，横向 2/3 宽度 */}
      <div className="relative z-20 grid grid-cols-2 gap-1 w-2/3 px-1 flex-1 min-h-0"
        style={{ gridTemplateRows: "1fr 1fr" }}>
        {buttons.map((btn) => (
          <Button
            key={btn.state}
            variant={state === btn.state ? "default" : "outline"}
            className={cn(
              "w-full h-full min-h-0 p-0 text-[clamp(0.5rem,7cqw,2.5rem)] leading-none",
              state === btn.state ? "" : btn.className
            )}
            onClick={() => onChange(id, btn.state)}
          >
            {btn.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
