import { useAtomValue } from "jotai";
import { useState, useCallback, useEffect, useRef } from "react";
import {
  AUTH_REQUIRED_ERROR,
  buildBlockStatesWebSocketUrl,
  hasManagementAuthToken,
} from "@/lib/management-api";
import {
  authTokenAtom,
  baseUrlAtom,
} from "@/state/operator-shell";
import type {
  ApiError,
  BlockStateValue,
} from "@/types/management";
import type { BlockState, SystemMode } from "../lib/types";
import { STATE_VALUES, VALUE_TO_STATE } from "../lib/constants";

const INITIAL_BLOCKS: BlockState[] = Array(12).fill("null");
const RECONNECT_DELAY_MS = 3000;

export type BlockSyncStatus =
  | "auth_required"
  | "connecting"
  | "live"
  | "reconnecting"
  | "error";

function getParam(key: string, fallback: string): string {
  const params = new URLSearchParams(window.location.search);
  return params.get(key) || fallback;
}

function syncUrl(mode: SystemMode) {
  const params = new URLSearchParams();
  params.set("color", mode.color);
  params.set("direction", mode.direction);
  const url = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, "", url);
}

export function useBlockState() {
  const baseUrl = useAtomValue(baseUrlAtom);
  const token = useAtomValue(authTokenAtom);
  const hasToken = hasManagementAuthToken(token);
  const [blocks, setBlocks] = useState<BlockState[]>(INITIAL_BLOCKS);
  const blocksRef = useRef(blocks);
  const reconnectTimerRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<BlockSyncStatus>("auth_required");
  const [error, setError] = useState<ApiError | null>(AUTH_REQUIRED_ERROR);

  blocksRef.current = blocks;

  const [mode, setModeState] = useState<SystemMode>(() => ({
    color: getParam("color", "blue") as SystemMode["color"],
    direction: getParam("direction", "front") as SystemMode["direction"],
  }));

  const setMode = useCallback((newMode: SystemMode | ((prev: SystemMode) => SystemMode)) => {
    setModeState((prev) => {
      const next = typeof newMode === "function" ? newMode(prev) : newMode;
      return next;
    });
  }, []);

  // 状态变更时同步 URL
  useEffect(() => {
    syncUrl(mode);
  }, [mode]);

  useEffect(() => {
    if (!hasToken) {
      setStatus("auth_required");
      setError(AUTH_REQUIRED_ERROR);
      return;
    }

    let disposed = false;
    let reconnectAttempt = 0;

    function connect() {
      try {
        wsRef.current = new WebSocket(buildBlockStatesWebSocketUrl(baseUrl, token));
        setStatus(reconnectAttempt > 0 ? "reconnecting" : "connecting");
        setError(null);
      } catch (caught) {
        setStatus("error");
        setError({
          code: "request_failed",
          message: caught instanceof Error ? caught.message : "无法打开块状态 WebSocket",
        });
        return;
      }

      wsRef.current.onopen = () => {
        if (disposed) {
          return;
        }

        reconnectAttempt = 0;
        setStatus("live");
        setError(null);
        sendBlocks(blocksRef.current);
      };

      wsRef.current.onmessage = (event) => {
        const nextBlocks = parseBlockStateMessage(event.data);
        if (!nextBlocks || disposed) {
          return;
        }

        setBlocks(nextBlocks);
      };

      wsRef.current.onclose = () => {
        wsRef.current = null;
        if (disposed) {
          return;
        }

        reconnectAttempt += 1;
        setStatus("reconnecting");
        reconnectTimerRef.current = window.setTimeout(connect, RECONNECT_DELAY_MS);
      };

      wsRef.current.onerror = () => {
        wsRef.current?.close();
      };
    }

    function sendBlocks(nextBlocks: BlockState[]) {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        return;
      }

      wsRef.current.send(JSON.stringify(nextBlocks.map(blockStateToValue)));
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [baseUrl, hasToken, token]);

  const setBlockState = useCallback((id: number, state: BlockState) => {
    if (!hasToken) {
      setStatus("auth_required");
      setError(AUTH_REQUIRED_ERROR);
      return;
    }

    const nextBlocks = blocks.map((block, index) =>
      index === id - 1 ? state : block
    );
    setBlocks(nextBlocks);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(nextBlocks.map(blockStateToValue)));
      setStatus("live");
      setError(null);
      return;
    }

    setStatus("reconnecting");
    setError({
      code: "request_failed",
      message: "块状态 WebSocket 未连接，已保留本地更改并等待重连",
    });
  }, [blocks, hasToken]);

  return {
    blocks,
    setBlockState,
    mode,
    setMode,
    connected: status === "live",
    status,
    error,
    baseUrl,
  };
}

function blockStateToValue(state: BlockState): BlockStateValue {
  return STATE_VALUES[state] as BlockStateValue;
}

function blockStateValueToState(value: BlockStateValue): BlockState {
  return VALUE_TO_STATE[value];
}

function parseBlockStateMessage(data: unknown): BlockState[] | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as unknown;
    if (!isBlockStateValueArray(parsed)) {
      return null;
    }

    return parsed.map(blockStateValueToState);
  } catch {
    return null;
  }
}

function isBlockStateValueArray(value: unknown): value is BlockStateValue[] {
  return (
    Array.isArray(value) &&
    value.length === 12 &&
    value.every((item) => Number.isInteger(item) && item >= 0 && item <= 4)
  );
}
