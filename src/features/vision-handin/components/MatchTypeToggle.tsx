import type { MatchType } from "../lib/types";
import { MATCH_TYPE_LABELS } from "../lib/types";
import { cn } from "@/lib/utils";

interface MatchTypeToggleProps {
  matchType: MatchType;
  onChange: (matchType: MatchType) => void;
}

const MATCH_COLORS: Record<MatchType, string> = {
  skill_zone1: "bg-emerald-500 text-white",
  skill_zone3_mid: "bg-amber-500 text-white",
  skill_zone3_top: "bg-purple-500 text-white",
  arena: "bg-rose-500 text-white",
};

const MATCH_OPTIONS: MatchType[] = [
  "skill_zone1",
  "skill_zone3_mid",
  "skill_zone3_top",
  "arena",
];

export function MatchTypeToggle({ matchType, onChange }: MatchTypeToggleProps) {
  return (
    <div className="flex flex-col w-full h-full rounded-lg border-2 overflow-hidden">
      {MATCH_OPTIONS.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={cn(
            "flex-1 w-full flex items-center justify-center transition-colors cursor-pointer select-none border-0",
            matchType === option
              ? MATCH_COLORS[option]
              : "bg-muted/30 hover:bg-muted/50"
          )}
        >
          <span className="text-[clamp(0.55rem,1.1vw,0.8rem)] font-semibold leading-tight text-center px-1 py-0.5 whitespace-pre-line">
            {MATCH_TYPE_LABELS[option]}
          </span>
        </button>
      ))}
    </div>
  );
}
