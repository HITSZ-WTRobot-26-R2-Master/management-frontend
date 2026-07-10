import type { SystemMode } from "../lib/types";
import { cn } from "@/lib/utils";

interface SystemToggleProps {
  mode: SystemMode;
  onChange: (mode: SystemMode) => void;
}

function VerticalToggle({
  ariaLabel,
  name,
  topLabel,
  bottomLabel,
  topSub,
  bottomSub,
  isTop,
  onSelectTop,
  onSelectBottom,
  topColor,
  bottomColor,
}: {
  ariaLabel: string;
  name: string;
  topLabel: string;
  bottomLabel: string;
  topSub: string;
  bottomSub: string;
  isTop: boolean;
  onSelectTop: () => void;
  onSelectBottom: () => void;
  topColor: string;
  bottomColor: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="relative flex flex-col items-center rounded-lg border-2 overflow-hidden select-none w-full flex-1 min-h-0"
    >
      {/* 上部选项 */}
      <label className="relative flex-1 w-full cursor-pointer">
        <input
          type="radio"
          name={name}
          checked={isTop}
          onChange={() => {
            if (!isTop) {
              onSelectTop();
            }
          }}
          className="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0"
        />
        <span
          className={cn(
            "flex size-full flex-col items-center justify-center transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[-3px] peer-focus-visible:outline-foreground",
            isTop ? topColor : "bg-muted/30"
          )}
        >
          <span className="text-[clamp(0.7rem,1.6vw,1.1rem)] font-medium leading-tight">
            {topSub}
          </span>
          <span className="font-bold text-[clamp(0.9rem,2vw,1.5rem)] leading-tight">
            {topLabel}
          </span>
        </span>
      </label>
      {/* 下部选项 */}
      <label className="relative flex-1 w-full cursor-pointer">
        <input
          type="radio"
          name={name}
          checked={!isTop}
          onChange={() => {
            if (isTop) {
              onSelectBottom();
            }
          }}
          className="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0"
        />
        <span
          className={cn(
            "flex size-full flex-col items-center justify-center transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[-3px] peer-focus-visible:outline-foreground",
            !isTop ? bottomColor : "bg-muted/30"
          )}
        >
          <span className="text-[clamp(0.7rem,1.6vw,1.1rem)] font-medium leading-tight">
            {bottomSub}
          </span>
          <span className="font-bold text-[clamp(0.9rem,2vw,1.5rem)] leading-tight">
            {bottomLabel}
          </span>
        </span>
      </label>
      {/* 滑块指示器 */}
      <div
        className={cn(
          "pointer-events-none absolute left-1 right-1 h-1 rounded-full transition-all duration-200",
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
        ariaLabel="阵营颜色"
        name="vision-alliance-color"
        topLabel="红"
        bottomLabel="蓝"
        topSub="RED"
        bottomSub="BLUE"
        isTop={isRed}
        onSelectTop={() => onChange({ ...mode, color: "red" })}
        onSelectBottom={() => onChange({ ...mode, color: "blue" })}
        topColor="bg-red-500 text-white"
        bottomColor="bg-blue-500 text-white"
      />
      <VerticalToggle
        ariaLabel="行进方向"
        name="vision-direction"
        topLabel="反"
        bottomLabel="正"
        topSub="BACK"
        bottomSub="FRONT"
        isTop={isBack}
        onSelectTop={() => onChange({ ...mode, direction: "back" })}
        onSelectBottom={() => onChange({ ...mode, direction: "front" })}
        topColor="bg-primary text-primary-foreground"
        bottomColor="bg-primary text-primary-foreground"
      />
    </div>
  );
}
