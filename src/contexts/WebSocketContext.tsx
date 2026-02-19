import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { BotStatus, LogEntry } from '@/lib/api';

interface WebSocketContextType {
  status: BotStatus | null;
  logs: LogEntry[];
  connected: boolean;
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  systemStatus: any;
  botUpdates: Map<string, any>;
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
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [botUpdates, setBotUpdates] = useState<Map<string, any>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;
  const baseReconnectDelay = 1000; // 1 秒

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
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'bot_update':
              // 机器人状态更新
              setStatus(data.data);
              setBotUpdates(prev => new Map(prev).set(data.data.id, data.data));
              if (data.data.logs) {
                setLogs(data.data.logs.slice(0, 100)); // 限制日志最多 100 条
              }
              break;
            case 'bot_deleted':
              // 机器人被删除，从 Map 中移除
              setBotUpdates(prev => {
                const updated = new Map(prev);
                updated.delete(data.id);
                return updated;
              });
              break;
            case 'system_status':
              // 系统状态更新（内存等）
              setSystemStatus(data.data);
              break;
            case 'status':
              setStatus(data.data);
              break;
            case 'log':
              setLogs(prev => [...prev.slice(-99), data.data]);
              break;
            case 'logs':
              setLogs(data.data.slice(0, 100)); // 限制日志最多 100 条
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

        // 指数退避重试
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
          reconnectAttemptsRef.current++;
          console.log(`[WebSocket] 第 ${reconnectAttemptsRef.current} 次重连，延迟 ${delay}ms`);
          reconnectTimeoutRef.current = window.setTimeout(connect, delay);
        } else {
          console.error('[WebSocket] 达到最大重连次数，停止重连');
          reconnectAttemptsRef.current = 0;
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
        reconnectAttemptsRef.current++;
        console.log(`[WebSocket] 连接失败，第 ${reconnectAttemptsRef.current} 次重连，延迟 ${delay}ms`);
        reconnectTimeoutRef.current = window.setTimeout(connect, delay);
      }
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
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
