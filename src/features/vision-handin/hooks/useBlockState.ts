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
import type { ApiError } from "@/types/management";
import type { BlockState, MatchType, SystemMode } from "../lib/types";
import { parseBlockStateMessage, serializeBlockStatesUpdate } from "../lib/blockStateStream";
import { getBlockStateReconnectDelayMs } from "../lib/blockStateConnection";
import {
  resolveInitialVisionMode,
  resolveVisionModeTransition,
} from "../lib/visionModeStorage";

const INITIAL_BLOCKS: BlockState[] = Array(12).fill("null");

export type BlockSyncStatus =
  | "auth_required"
  | "connecting"
  | "live"
  | "reconnecting"
  | "error";

function syncUrl(mode: SystemMode) {
  const params = new URLSearchParams();
  params.set("color", mode.color);
  params.set("direction", mode.direction);
  params.set("match_type", mode.matchType);
  const url = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, "", url);
}

export function useBlockState() {
  const baseUrl = useAtomValue(baseUrlAtom);
  const token = useAtomValue(authTokenAtom);
  const hasToken = hasManagementAuthToken(token);
  const [blocks, setBlocks] = useState<BlockState[]>(INITIAL_BLOCKS);
  const reconnectTimerRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<BlockSyncStatus>("auth_required");
  const [error, setError] = useState<ApiError | null>(AUTH_REQUIRED_ERROR);

  const [mode, setModeState] = useState<SystemMode>(() =>
    resolveInitialVisionMode(window.location.search)
  );

  const setMode = useCallback((newMode: SystemMode | ((prev: SystemMode) => SystemMode)) => {
    setModeState((prev) => {
      const requested = typeof newMode === "function" ? newMode(prev) : newMode;
      const next = resolveVisionModeTransition(prev, requested);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          color: next.color,
          match_type: next.matchType,
        }));
      }
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
    let hasOpened = false;
    let usedInitialFastRetry = false;

    function connect() {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

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
        hasOpened = true;
        setStatus("live");
        setError(null);
      };

      wsRef.current.onmessage = (event) => {
        const message = parseBlockStateMessage(event.data);
        if (!message || disposed) {
          return;
        }

        if (message.type === "block_states_snapshot") {
          setBlocks(message.blocks);
          setModeState((prev) => {
            const next = resolveVisionModeTransition(prev, {
              ...prev,
              color: message.color,
              matchType: message.matchType,
            });
            if (prev === next || (
              prev.color === next.color &&
              prev.direction === next.direction &&
              prev.matchType === next.matchType
            )) {
              return prev;
            }
            return next;
          });
          setStatus("live");
          setError(null);
          return;
        }

        setError({
          code: message.code,
          message: message.message,
        });
      };

      wsRef.current.onclose = () => {
        wsRef.current = null;
        if (disposed) {
          return;
        }

        reconnectAttempt += 1;
        setStatus("reconnecting");
        const reconnectDelayMs = getBlockStateReconnectDelayMs({
          hasOpened,
          usedInitialFastRetry,
        });
        if (reconnectDelayMs === 0) {
          usedInitialFastRetry = true;
        }
        reconnectTimerRef.current = window.setTimeout(connect, reconnectDelayMs);
      };

      wsRef.current.onerror = () => {
        wsRef.current?.close();
      };
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

    setBlocks((currentBlocks) => {
      const nextBlocks = currentBlocks.map((block, index) =>
        index === id - 1 ? state : block
      );

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(serializeBlockStatesUpdate(nextBlocks, mode.color, mode.matchType));
        setStatus("live");
        setError(null);
        return nextBlocks;
      }

      setStatus("reconnecting");
      setError({
        code: "request_failed",
        message: "块状态 WebSocket 未连接，无法发送更改",
      });
      return nextBlocks;
    });
  }, [hasToken, mode.color, mode.matchType]);

  const setMatchType = useCallback((matchType: MatchType) => {
    setMode((prev) => ({ ...prev, matchType }));
  }, [setMode]);

  return {
    blocks,
    setBlockState,
    mode,
    setMode,
    setMatchType,
    connected: status === "live",
    status,
    error,
    baseUrl,
  };
}
