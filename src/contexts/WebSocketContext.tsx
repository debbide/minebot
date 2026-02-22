/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { BotStatus, LogEntry } from '@/lib/api';

interface SystemStatus {
  percent: string;
  used: string;
  total: string;
}

interface WebSocketContextType {
  status: BotStatus | null;
  logs: LogEntry[];
  connected: boolean;
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  systemStatus: SystemStatus | null;
  botUpdates: Map<string, BotStatus>;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

function getWsUrl(): string {
  const token = localStorage.getItem('token');
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const baseUrl = import.meta.env.PROD
    ? `${protocol}//${window.location.host}`
    : 'ws://localhost:3000';
  return `${baseUrl}?token=${token}`;
}

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [botUpdates, setBotUpdates] = useState<Map<string, BotStatus>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const connectRef = useRef<() => void>(() => {});
  const maxReconnectAttempts = 10;
  const baseReconnectDelay = 1000; // 1 秒
  const maxReconnectDelay = 30000; // 30 秒

  const clearReconnectTimeout = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  const scheduleReconnect = useCallback(() => {
    if (!navigator.onLine) {
      console.warn('[WebSocket] offline, waiting for network');
      return;
    }
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.error('[WebSocket] 达到最大重连次数，停止重连');
      reconnectAttemptsRef.current = 0;
      return;
    }
    const expDelay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
    const cappedDelay = Math.min(expDelay, maxReconnectDelay);
    const jitter = 0.8 + Math.random() * 0.4;
    const delay = Math.floor(cappedDelay * jitter);
    reconnectAttemptsRef.current += 1;
    console.log(`[WebSocket] 第 ${reconnectAttemptsRef.current} 次重连，延迟 ${delay}ms`);
    clearReconnectTimeout();
    reconnectTimeoutRef.current = window.setTimeout(() => {
      connectRef.current();
    }, delay);
  }, []);

  const connect = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setConnected(false);
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        reconnectAttemptsRef.current = 0; // 重置重连计数
        clearReconnectTimeout();
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as Record<string, unknown>;
          const type = data.type as string | undefined;

          switch (type) {
            case 'bot_update':
            case 'botStatus': {
              // 机器人状态更新
              const payload = (data.data ?? data.status ?? data) as Partial<BotStatus> & { logs?: LogEntry[]; id?: string };
              const botData = payload.id ? (payload as BotStatus) : null;
              if (!botData) break;
              setBotUpdates(prev => new Map(prev).set(botData.id, botData));
              if (Array.isArray(payload.logs)) {
                setLogs(payload.logs.slice(0, 100)); // 限制日志最多 100 条
              }
              break;
            }
            case 'bot_deleted':
              // 机器人被删除，从 Map 中移除
              setBotUpdates(prev => {
                const updated = new Map(prev);
                if (typeof data.id === 'string') {
                  updated.delete(data.id);
                }
                return updated;
              });
              break;
            case 'system_status':
              // 系统状态更新（内存等）
              setSystemStatus(data.data as SystemStatus);
              break;
            case 'status':
              setStatus(data.data as BotStatus);
              break;
            case 'log':
              setLogs(prev => [...prev.slice(-99), data.data as LogEntry]);
              break;
            case 'logs':
              if (Array.isArray(data.data)) {
                setLogs((data.data as LogEntry[]).slice(0, 100)); // 限制日志最多 100 条
              }
              break;
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      };

      ws.onclose = (event) => {
        setConnected(false);
        console.log('WebSocket disconnected', event.code);

        // Don't reconnect if unauthorized
        if (event.code === 1008) {
          reconnectAttemptsRef.current = 0;
          return;
        }

        scheduleReconnect();
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
      scheduleReconnect();
    }
  }, [scheduleReconnect]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      clearReconnectTimeout();
      wsRef.current?.close();
    };
  }, [connect]);

  // Reconnect when token changes
  useEffect(() => {
    const handleStorageChange = () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      connect();
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [connect]);

  useEffect(() => {
    const handleOnline = () => {
      reconnectAttemptsRef.current = 0;
      connect();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !connected) {
        connect();
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [connect, connected]);

  return (
    <WebSocketContext.Provider value={{ status, logs, connected, setLogs, systemStatus, botUpdates }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}
