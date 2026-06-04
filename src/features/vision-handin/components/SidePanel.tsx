import type { SystemMode } from "../lib/types";
import { getSideLabels } from "../lib/constants";

interface SidePanelProps {
  side: "left" | "right";
  mode: SystemMode;
}

export function SidePanel({ side, mode }: SidePanelProps) {
  const labels = getSideLabels(mode.color, mode.direction);
  const text = side === "left" ? labels.left : labels.right;

  return (
    <div className="flex items-center justify-center w-[clamp(80px,12vw,180px)] p-2">
      <div className="text-center">
        <p className="text-[clamp(1rem,2.5vw,2.2rem)] font-bold whitespace-pre-line leading-snug">
          {text.replace("/", "\n")}
        </p>
      </div>
    </div>
  );
}
