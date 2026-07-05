import { useAtomValue } from "jotai";
import { useState, useCallback, useEffect, useRef } from "react";
import {
  AUTH_REQUIRED_ERROR,
  buildRetryStateWebSocketUrl,
  hasManagementAuthToken,
} from "@/lib/management-api";
import { authTokenAtom, baseUrlAtom } from "@/state/operator-shell";
import type { ApiError, RetryType, RetryStateParams } from "@/types/management";
import { parseRetryStateMessage } from "../lib/retryStateStream";
import { getRetryStateReconnectDelayMs } from "../lib/retryStateConnection";

export type RetrySyncStatus =
  | "auth_required"
  | "connecting"
  | "live"
  | "reconnecting"
  | "error";

const INITIAL_RETRY_TYPE: RetryType = "retry_take_spear";

const DEFAULT_PARAMS: Record<RetryType, RetryStateParams> = {
  retry_take_spear: { spear_index: 1, previous_spear_needs_dock: false },
  retry_merlin: { r2_taken_count: 0, taken_r2_blocks: [] },
  retry_combat: { combat_source: 1, combat_place_layer: 1 },
};

export function useRetryState() {
  const baseUrl = useAtomValue(baseUrlAtom);
  const token = useAtomValue(authTokenAtom);
  const hasToken = hasManagementAuthToken(token);
  const [activeRetryType, setActiveRetryType] =
    useState<RetryType>(INITIAL_RETRY_TYPE);
  const [params, setParams] = useState<RetryStateParams>(
    DEFAULT_PARAMS[INITIAL_RETRY_TYPE],
  );
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<RetrySyncStatus>("auth_required");
  const [error, setError] = useState<ApiError | null>(AUTH_REQUIRED_ERROR);
  const reconnectTimerRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

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
        wsRef.current = new WebSocket(
          buildRetryStateWebSocketUrl(baseUrl, token),
        );
        setStatus(reconnectAttempt > 0 ? "reconnecting" : "connecting");
        setError(null);
      } catch (caught) {
        setStatus("error");
        setError({
          code: "request_failed",
          message:
            caught instanceof Error
              ? caught.message
              : "无法打开重试状态 WebSocket",
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
        const message = parseRetryStateMessage(event.data);
        if (!message || disposed) {
          return;
        }

        if (message.type === "retry_state_snapshot") {
          setActiveRetryType(message.active_retry_type);
          setParams(message.params);
          setRevision(message.revision);
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
        const reconnectDelayMs = getRetryStateReconnectDelayMs({
          hasOpened,
          usedInitialFastRetry,
        });
        if (reconnectDelayMs === 0) {
          usedInitialFastRetry = true;
        }
        reconnectTimerRef.current = window.setTimeout(
          connect,
          reconnectDelayMs,
        );
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

  const setRetryState = useCallback(
    (type: RetryType, newParams: RetryStateParams) => {
      if (!hasToken) {
        setStatus("auth_required");
        setError(AUTH_REQUIRED_ERROR);
        return;
      }

      setActiveRetryType(type);
      setParams(newParams);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ active_retry_type: type, params: newParams }),
        );
        setStatus("live");
        setError(null);
        return;
      }

      setStatus("reconnecting");
      setError({
        code: "request_failed",
        message: "重试状态 WebSocket 未连接，已保留本地更改并等待重连",
      });
    },
    [hasToken],
  );

  return {
    activeRetryType,
    params,
    revision,
    setRetryState,
    connected: status === "live",
    status,
    error,
  };
}
