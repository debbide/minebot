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

export interface RenewalConfig {
  id: string;
  name: string;
  url: string;
  interval: number;
  enabled: boolean;

  // 续期模式：'http' | 'autoLoginHttp' | 'browserClick'
  mode?: 'http' | 'autoLoginHttp' | 'browserClick';

  // HTTP 模式配置
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body: string;
  useProxy: boolean;
  proxyUrl: string;

  // 登录配置（autoLoginHttp 和 browserClick 模式）
  loginUrl: string;
  panelUsername: string;
  panelPassword: string;

  // 浏览器点击配置（browserClick 模式）
  renewButtonSelector: string;

  // 浏览器代理配置（browserClick 模式）
  browserProxy?: string;  // 格式: socks5://127.0.0.1:1080

  // 状态
  lastRun: string | null;
  lastResult: RenewalResult | null;
  running?: boolean;

  // 兼容旧配置（已废弃）
  autoLogin?: boolean;
  useBrowserClick?: boolean;
  renewPageUrl?: string;
}

export interface RenewalResult {
  success: boolean;
  status?: number;
  message: string;
  response?: string;
  error?: string;
  timestamp: string;
}

export interface FileInfo {
  name: string;
  mode: string;
  size: number;
  isFile: boolean;
  isSymlink: boolean;
  isEditable: boolean;
  mimetype: string;
  createdAt: string;
  modifiedAt: string;
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

  // Multi-Server Management
  async getBots(): Promise<Record<string, BotStatus>> {
    return this.request('/api/bots');
  }

  async addServer(server: {
    id?: string;
    name?: string;
    host: string;
    port?: number;
    username?: string;
    version?: string;
    type?: 'minecraft' | 'panel';
  }): Promise<{ success: boolean; id: string; status: BotStatus }> {
    return this.request('/api/bots/add', {
      method: 'POST',
      body: JSON.stringify(server),
    });
  }

  async removeServer(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/bots/${id}`, { method: 'DELETE' });
  }

  async updateServer(id: string, updates: {
    name?: string;
    username?: string;
    host?: string;
    port?: number;
  }): Promise<{ success: boolean; config: unknown }> {
    return this.request(`/api/bots/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async connectAll(): Promise<{ success: boolean; results: unknown[] }> {
    return this.request('/api/bots/connect-all', { method: 'POST' });
  }

  async disconnectAll(): Promise<{ success: boolean }> {
    return this.request('/api/bots/disconnect-all', { method: 'POST' });
  }

  async restartBot(id: string): Promise<{ success: boolean; status: BotStatus }> {
    return this.request(`/api/bots/${id}/restart`, { method: 'POST' });
  }

  // Behavior Control
  async setBehavior(id: string, behavior: string, enabled: boolean, options?: Record<string, unknown>): Promise<{ success: boolean; message: string; status: BotStatus }> {
    return this.request(`/api/bots/${id}/behavior`, {
      method: 'POST',
      body: JSON.stringify({ behavior, enabled, options }),
    });
  }

  async doAction(id: string, action: string, params?: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/bots/${id}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, params }),
    });
  }

  async stopAllBehaviors(id: string): Promise<{ success: boolean; status: BotStatus }> {
    return this.request(`/api/bots/${id}/stop-all`, { method: 'POST' });
  }

  async getBehaviors(id: string): Promise<{ modes: Record<string, boolean>; behaviors: unknown }> {
    return this.request(`/api/bots/${id}/behaviors`);
  }

  // Bot-specific mode control
  async setBotMode(id: string, mode: string, enabled: boolean): Promise<{ success: boolean; modes: Record<string, boolean>; status: BotStatus }> {
    return this.request(`/api/bots/${id}/mode`, {
      method: 'POST',
      body: JSON.stringify({ mode, enabled }),
    });
  }

  // Restart timer for specific bot
  async setRestartTimer(id: string, minutes: number): Promise<{ success: boolean; restartTimer: { enabled: boolean; intervalMinutes: number; nextRestart: string | null } }> {
    return this.request(`/api/bots/${id}/restart-timer`, {
      method: 'POST',
      body: JSON.stringify({ minutes }),
    });
  }

  // Send /restart command immediately
  async sendRestartCommand(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/bots/${id}/restart-command`, {
      method: 'POST',
    });
  }

  // Auto-chat config for specific bot
  async setAutoChat(id: string, config: { enabled?: boolean; interval?: number; messages?: string[] }): Promise<{ success: boolean; autoChat: { enabled: boolean; interval: number; messages: string[] }; status: BotStatus }> {
    return this.request(`/api/bots/${id}/auto-chat`, {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  // Pterodactyl panel config
  async setPterodactyl(id: string, config: { url: string; apiKey: string; serverId: string }): Promise<{ success: boolean; pterodactyl: { url: string; apiKey: string; serverId: string } }> {
    return this.request(`/api/bots/${id}/pterodactyl`, {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  // Send console command via panel
  async sendPanelCommand(id: string, command: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/bots/${id}/panel-command`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    });
  }

  // Auto-OP bot
  async autoOp(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/bots/${id}/auto-op`, {
      method: 'POST',
    });
  }

  // Send power signal via Pterodactyl panel (start/stop/restart/kill)
  async sendPowerSignal(id: string, signal: 'start' | 'stop' | 'restart' | 'kill'): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/bots/${id}/power`, {
      method: 'POST',
      body: JSON.stringify({ signal }),
    });
  }

  // Get logs for specific bot
  async getBotLogs(id: string): Promise<{ success: boolean; logs: LogEntry[] }> {
    return this.request(`/api/bots/${id}/logs`);
  }

  // Clear logs for specific bot
  async clearBotLogs(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/bots/${id}/logs`, { method: 'DELETE' });
  }

  // Get bot config
  async getBotConfig(id: string): Promise<{ success: boolean; config: { id: string; name: string; modes: Record<string, boolean>; autoChat: { enabled: boolean; interval: number; messages: string[] }; restartTimer: { enabled: boolean; intervalMinutes: number; nextRestart: string | null }; pterodactyl: { url: string; apiKey: string; serverId: string } | null; autoOp: boolean } }> {
    return this.request(`/api/bots/${id}/config`);
  }

  // ==================== 续期 API ====================

  async getRenewals(): Promise<RenewalConfig[]> {
    return this.request('/api/renewals');
  }

  async addRenewal(renewal: Partial<RenewalConfig>): Promise<{ success: boolean; renewal: RenewalConfig }> {
    return this.request('/api/renewals', {
      method: 'POST',
      body: JSON.stringify(renewal),
    });
  }

  async updateRenewal(id: string, updates: Partial<RenewalConfig>): Promise<{ success: boolean; renewal: RenewalConfig }> {
    return this.request(`/api/renewals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteRenewal(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/renewals/${id}`, { method: 'DELETE' });
  }

  async testRenewal(id: string): Promise<{ success: boolean; result: RenewalResult }> {
    return this.request(`/api/renewals/${id}/test`, { method: 'POST' });
  }

  async testProxy(proxyUrl: string, testUrl?: string): Promise<{ success: boolean; result: { success: boolean; message: string; response?: string; error?: string } }> {
    return this.request('/api/renewals/test-proxy', {
      method: 'POST',
      body: JSON.stringify({ proxyUrl, testUrl }),
    });
  }

  async startRenewal(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/renewals/${id}/start`, { method: 'POST' });
  }

  async stopRenewal(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/renewals/${id}/stop`, { method: 'POST' });
  }

  async getRenewalLogs(): Promise<LogEntry[]> {
    return this.request('/api/renewals/logs');
  }

  async getRenewalLogsById(id: string): Promise<LogEntry[]> {
    return this.request(`/api/renewals/${id}/logs`);
  }

  async clearRenewalLogs(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/renewals/${id}/logs`, { method: 'DELETE' });
  }

  // ==================== 文件管理 API ====================

  async listFiles(id: string, directory: string = '/'): Promise<{ success: boolean; files?: FileInfo[]; directory?: string; error?: string }> {
    return this.request(`/api/bots/${id}/files?directory=${encodeURIComponent(directory)}`);
  }

  async getFileContents(id: string, file: string): Promise<{ success: boolean; content?: string; file?: string; error?: string }> {
    return this.request(`/api/bots/${id}/files/contents?file=${encodeURIComponent(file)}`);
  }

  async writeFile(id: string, file: string, content: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const token = getToken();
    const response = await fetch(`${this.baseUrl}/api/bots/${id}/files/write?file=${encodeURIComponent(file)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: content
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async getDownloadUrl(id: string, file: string): Promise<{ success: boolean; url?: string; error?: string }> {
    return this.request(`/api/bots/${id}/files/download?file=${encodeURIComponent(file)}`);
  }

  async getUploadUrl(id: string): Promise<{ success: boolean; url?: string; error?: string }> {
    return this.request(`/api/bots/${id}/files/upload`);
  }

  async createFolder(id: string, root: string, name: string): Promise<{ success: boolean; message?: string; error?: string }> {
    return this.request(`/api/bots/${id}/files/folder`, {
      method: 'POST',
      body: JSON.stringify({ root, name }),
    });
  }

  async deleteFiles(id: string, root: string, files: string[]): Promise<{ success: boolean; message?: string; error?: string }> {
    return this.request(`/api/bots/${id}/files/delete`, {
      method: 'POST',
      body: JSON.stringify({ root, files }),
    });
  }

  async renameFile(id: string, root: string, from: string, to: string): Promise<{ success: boolean; message?: string; error?: string }> {
    return this.request(`/api/bots/${id}/files/rename`, {
      method: 'POST',
      body: JSON.stringify({ root, from, to }),
    });
  }

  async copyFile(id: string, location: string): Promise<{ success: boolean; message?: string; error?: string }> {
    return this.request(`/api/bots/${id}/files/copy`, {
      method: 'POST',
      body: JSON.stringify({ location }),
    });
  }

  async compressFiles(id: string, root: string, files: string[]): Promise<{ success: boolean; archive?: string; error?: string }> {
    return this.request(`/api/bots/${id}/files/compress`, {
      method: 'POST',
      body: JSON.stringify({ root, files }),
    });
  }

  async decompressFile(id: string, root: string, file: string): Promise<{ success: boolean; message?: string; error?: string }> {
    return this.request(`/api/bots/${id}/files/decompress`, {
      method: 'POST',
      body: JSON.stringify({ root, file }),
    });
  }
}

export const api = new ApiService();
