const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:3000';

function getToken(): string | null {
  return localStorage.getItem('token');
}

function getAuthHeaders(): Record<string, string> {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

export interface BotStatus {
  connected: boolean;
  serverAddress: string;
  version: string;
  health: number;
  food: number;
  position: { x: number; y: number; z: number } | null;
  players: string[];
  modes: {
    aiView: boolean;
    patrol: boolean;
    autoChat: boolean;
  };
}

export interface LogEntry {
  id: number;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'chat';
  icon?: string;
  message: string;
}

export interface Config {
  server: {
    host: string;
    port: number;
    username: string;
    version: string | false;
  };
  ai: {
    enabled: boolean;
    model: string;
    baseURL: string;
    apiKey: string;
    systemPrompt: string;
  };
  auth: {
    username: string;
    password: string;
  };
  autoChat: {
    enabled: boolean;
    interval: number;
    messages: string[];
  };
  autoRenew: {
    enabled: boolean;
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
    interval: number;
  };
}

class ApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: getAuthHeaders(),
    });

    if (response.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth
  async login(username: string, password: string): Promise<{ success: boolean; token: string; username: string }> {
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    return response.json();
  }

  async checkAuth(): Promise<{ authenticated: boolean; username?: string }> {
    return this.request('/api/auth/check');
  }

  // Status
  async getStatus(): Promise<BotStatus> {
    return this.request<BotStatus>('/api/status');
  }

  // Config
  async getConfig(): Promise<Config> {
    return this.request<Config>('/api/config');
  }

  async getFullConfig(): Promise<Config> {
    return this.request<Config>('/api/config/full');
  }

  async updateConfig(config: Partial<Config>): Promise<{ success: boolean; config: Config }> {
    return this.request('/api/config', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async saveSettings(settings: Partial<Config>): Promise<{ success: boolean }> {
    return this.request('/api/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  }

  // Credentials
  async saveCredentials(credentials: {
    panelUrl?: string;
    id?: string;
    path?: string;
    apiKey?: string;
  }): Promise<{ success: boolean }> {
    return this.request('/api/credentials', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  // Bot Control
  async connect(options?: {
    host?: string;
    port?: number;
    username?: string;
    version?: string;
  }): Promise<{ success: boolean; status: BotStatus }> {
    return this.request('/api/bot/connect', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  }

  async disconnect(): Promise<{ success: boolean }> {
    return this.request('/api/bot/disconnect', { method: 'POST' });
  }

  async restart(): Promise<{ success: boolean; status: BotStatus }> {
    return this.request('/api/bot/restart', { method: 'POST' });
  }

  // Modes
  async getModes(): Promise<Record<string, boolean>> {
    return this.request('/api/bot/modes');
  }

  async setMode(mode: string, enabled: boolean): Promise<{ success: boolean; modes: Record<string, boolean> }> {
    return this.request('/api/bot/mode', {
      method: 'POST',
      body: JSON.stringify({ mode, enabled }),
    });
  }

  // Timer
  async setTimer(minutes: number, hours: number, action: string = 'restart'): Promise<{ success: boolean }> {
    return this.request('/api/bot/timer', {
      method: 'POST',
      body: JSON.stringify({ minutes, hours, action }),
    });
  }

  // Command
  async executeCommand(command: string): Promise<{ success: boolean; result: unknown }> {
    return this.request('/api/bot/command', {
      method: 'POST',
      body: JSON.stringify({ command }),
    });
  }

  // AI Chat
  async chat(message: string): Promise<{ success: boolean; response: string }> {
    return this.request('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  // Logs
  async getLogs(): Promise<LogEntry[]> {
    return this.request<LogEntry[]>('/api/logs');
  }
}

export const api = new ApiService();
