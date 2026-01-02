import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useWebSocketContext } from '@/contexts/WebSocketContext';

// Re-export for backwards compatibility
export { useWebSocketContext as useWebSocket } from '@/contexts/WebSocketContext';

export function useBotStatus() {
  const { status, connected } = useWebSocketContext();
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
