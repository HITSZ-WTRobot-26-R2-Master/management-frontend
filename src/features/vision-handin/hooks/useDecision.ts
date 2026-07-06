import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import {
  AUTH_REQUIRED_ERROR,
  buildDecisionWebSocketUrl,
  hasManagementAuthToken,
} from "@/lib/management-api";
import {
  authTokenAtom,
  baseUrlAtom,
} from "@/state/operator-shell";
import type { ApiError, DecisionSnapshot } from "@/types/management";
import { parseDecisionMessage } from "../lib/decisionStream";
import { getBlockStateReconnectDelayMs } from "../lib/blockStateConnection";

const INITIAL_DECISION: DecisionSnapshot = {
  available: false,
  topic: "/decision",
  received_at: null,
  action_order: [],
  scroll_picks: [],
  revision: 0,
};

export type DecisionSyncStatus =
  | "auth_required"
  | "connecting"
  | "live"
  | "reconnecting"
  | "error";

export function useDecision() {
  const baseUrl = useAtomValue(baseUrlAtom);
  const token = useAtomValue(authTokenAtom);
  const hasToken = hasManagementAuthToken(token);
  const [decision, setDecision] = useState<DecisionSnapshot>(INITIAL_DECISION);
  const [status, setStatus] = useState<DecisionSyncStatus>("auth_required");
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
        wsRef.current = new WebSocket(buildDecisionWebSocketUrl(baseUrl, token));
        setStatus(reconnectAttempt > 0 ? "reconnecting" : "connecting");
        setError(null);
      } catch (caught) {
        setStatus("error");
        setError({
          code: "request_failed",
          message: caught instanceof Error ? caught.message : "无法打开决策 WebSocket",
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
        const message = parseDecisionMessage(event.data);
        if (!message || disposed) {
          return;
        }

        if (message.type === "decision_snapshot") {
          setDecision(message.snapshot);
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

  return {
    decision,
    connected: status === "live",
    status,
    error,
  };
}
