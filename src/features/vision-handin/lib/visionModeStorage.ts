import type { MatchType, SystemMode } from "./types";

export const VISION_HANDIN_DIRECTION_STORAGE_KEY =
  "r2-management.vision-handin.direction-by-color.v1";

export type VisionDirectionCache = Partial<
  Record<SystemMode["color"], SystemMode["direction"]>
>;

type VisionDirectionStorageReader = Pick<Storage, "getItem">;
type VisionDirectionStorageWriter = Pick<Storage, "getItem" | "setItem">;

export function readVisionDirectionCache(
  storage: VisionDirectionStorageReader | null = getVisionDirectionStorage(),
): VisionDirectionCache {
  if (!storage) {
    return {};
  }

  try {
    const raw = storage.getItem(VISION_HANDIN_DIRECTION_STORAGE_KEY);
    if (raw === null) {
      return {};
    }

    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value)) {
      return {};
    }

    const cache: VisionDirectionCache = {};
    if (isValidDirection(value.blue)) {
      cache.blue = value.blue;
    }
    if (isValidDirection(value.red)) {
      cache.red = value.red;
    }
    return cache;
  } catch {
    return {};
  }
}

export function writeVisionDirectionForColor(
  color: SystemMode["color"],
  direction: SystemMode["direction"],
  storage: VisionDirectionStorageWriter | null = getVisionDirectionStorage(),
) {
  if (!storage) {
    return;
  }

  const nextCache: VisionDirectionCache = {
    ...readVisionDirectionCache(storage),
    [color]: direction,
  };

  try {
    storage.setItem(
      VISION_HANDIN_DIRECTION_STORAGE_KEY,
      JSON.stringify(nextCache),
    );
  } catch {
    // Browser storage may be unavailable in private or locked-down contexts.
  }
}

export function resolveInitialVisionMode(
  search: string,
  storage: VisionDirectionStorageReader | null = getVisionDirectionStorage(),
): SystemMode {
  const params = new URLSearchParams(search);
  const color = parseColor(params.get("color")) ?? "blue";
  const direction =
    readVisionDirectionCache(storage)[color] ??
    parseDirection(params.get("direction")) ??
    "front";

  return {
    color,
    direction,
    matchType: parseMatchType(params.get("match_type")) ?? "competition_full",
  };
}

export function resolveVisionModeTransition(
  previous: SystemMode,
  requested: SystemMode,
  storage: VisionDirectionStorageWriter | null = getVisionDirectionStorage(),
): SystemMode {
  if (requested.color !== previous.color) {
    const cachedDirection = readVisionDirectionCache(storage)[requested.color];
    const direction = cachedDirection ?? requested.direction;

    if (!cachedDirection) {
      writeVisionDirectionForColor(requested.color, direction, storage);
    }

    return {
      ...requested,
      direction,
    };
  }

  if (requested.direction !== previous.direction) {
    writeVisionDirectionForColor(requested.color, requested.direction, storage);
  }

  return requested;
}

function getVisionDirectionStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function parseColor(value: string | null): SystemMode["color"] | null {
  return value === "blue" || value === "red" ? value : null;
}

function parseDirection(
  value: string | null,
): SystemMode["direction"] | null {
  return isValidDirection(value) ? value : null;
}

function parseMatchType(value: string | null): MatchType | null {
  if (
    value === "martial_merlin" ||
    value === "combat_only_middle" ||
    value === "combat_only_top" ||
    value === "competition_full"
  ) {
    return value;
  }

  return null;
}

function isValidDirection(value: unknown): value is SystemMode["direction"] {
  return value === "front" || value === "back";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
