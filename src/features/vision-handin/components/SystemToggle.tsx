import type { SystemMode } from "../lib/types";
import { cn } from "@/lib/utils";

interface SystemToggleProps {
  mode: SystemMode;
  onChange: (mode: SystemMode) => void;
}

function VerticalToggle({
  topLabel,
  bottomLabel,
  topSub,
  bottomSub,
  isTop,
  onToggle,
  topColor,
  bottomColor,
}: {
  topLabel: string;
  bottomLabel: string;
  topSub: string;
  bottomSub: string;
  isTop: boolean;
  onToggle: () => void;
  topColor: string;
  bottomColor: string;
}) {
  return (
    <div
      onClick={onToggle}
      className="relative flex flex-col items-center rounded-lg border-2 overflow-hidden cursor-pointer select-none w-full flex-1 min-h-0"
    >
      {/* 上部选项 */}
      <div
        className={cn(
          "flex-1 w-full flex flex-col items-center justify-center transition-colors",
          isTop ? topColor : "bg-muted/30"
        )}
      >
        <span className="text-[clamp(0.7rem,1.6vw,1.1rem)] font-medium leading-tight">
          {topSub}
        </span>
        <span className="font-bold text-[clamp(0.9rem,2vw,1.5rem)] leading-tight">
          {topLabel}
        </span>
      </div>
      {/* 下部选项 */}
      <div
        className={cn(
          "flex-1 w-full flex flex-col items-center justify-center transition-colors",
          !isTop ? bottomColor : "bg-muted/30"
        )}
      >
        <span className="text-[clamp(0.7rem,1.6vw,1.1rem)] font-medium leading-tight">
          {bottomSub}
        </span>
        <span className="font-bold text-[clamp(0.9rem,2vw,1.5rem)] leading-tight">
          {bottomLabel}
        </span>
      </div>
      {/* 滑块指示器 */}
      <div
        className={cn(
          "absolute left-1 right-1 h-1 rounded-full transition-all duration-200",
          isTop ? "top-[calc(50%-0.25rem)]" : "bottom-[calc(50%-0.25rem)]",
          isTop ? "bg-white/60" : "bg-white/60"
        )}
      />
    </div>
  );
}

export function SystemToggle({ mode, onChange }: SystemToggleProps) {
  const isRed = mode.color === "red";
  const isBack = mode.direction === "back";

  return (
    <div className="flex flex-col gap-2 w-full h-full">
      <VerticalToggle
        topLabel="红"
        bottomLabel="蓝"
        topSub="RED"
        bottomSub="BLUE"
        isTop={isRed}
        onToggle={() =>
          onChange({ ...mode, color: isRed ? "blue" : "red" })
        }
        topColor="bg-red-500 text-white"
        bottomColor="bg-blue-500 text-white"
      />
      <VerticalToggle
        topLabel="反"
        bottomLabel="正"
        topSub="BACK"
        bottomSub="FRONT"
        isTop={isBack}
        onToggle={() =>
          onChange({ ...mode, direction: isBack ? "front" : "back" })
        }
        topColor="bg-primary text-primary-foreground"
        bottomColor="bg-primary text-primary-foreground"
      />
    </div>
  );
}
