import { useState, useEffect, useCallback, useRef } from 'react';
import { api, BotStatus, LogEntry } from '@/lib/api';

function getWsUrl(): string {
  const token = localStorage.getItem('token');
  const baseUrl = import.meta.env.PROD
    ? `ws://${window.location.host}`
    : 'ws://localhost:3000';
  return `${baseUrl}?token=${token}`;
}

export function useWebSocket() {
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

  return { status, logs, connected, setLogs };
}

export function useBotStatus() {
  const { status, connected } = useWebSocket();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getStatus()
      .then(() => setLoading(false))
      .catch(() => setLoading(false));
  }, []);

  return { status, connected, loading };
}

export function useBotControl() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectBot = async (options?: Parameters<typeof api.connect>[0]) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.connect(options);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const disconnectBot = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.disconnect();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const restartBot = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.restart();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { connectBot, disconnectBot, restartBot, loading, error };
}

export function useModes() {
  const [modes, setModes] = useState<Record<string, boolean>>({
    aiView: false,
    patrol: false,
    autoChat: false
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getModes().then(setModes).catch(console.error);
  }, []);

  const toggleMode = async (mode: string) => {
    setLoading(true);
    try {
      const result = await api.setMode(mode, !modes[mode]);
      setModes(result.modes);
    } catch (error) {
      console.error('Failed to toggle mode:', error);
    } finally {
      setLoading(false);
    }
  };

  return { modes, toggleMode, loading };
}
