import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { BotStatus, LogEntry } from '@/lib/api';

interface WebSocketContextType {
  status: BotStatus | null;
  logs: LogEntry[];
  connected: boolean;
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
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
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

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
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'status':
              setStatus(data.data);
              break;
            case 'log':
              setLogs(prev => [...prev.slice(-99), data.data]);
              break;
            case 'logs':
              setLogs(data.data);
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
          return;
        }

        // Reconnect after delay
        reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
      reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
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
    <WebSocketContext.Provider value={{ status, logs, connected, setLogs }}>
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
