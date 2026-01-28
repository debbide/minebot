const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:5000';

export interface RenewalTask {
    id: string;
    name: string;
    url: string;
    username: string;
    password: string;
    login_url?: string;
    action_type?: 'renewal' | 'keepalive';
    proxy?: string;
    selectors?: {
        renew_btn?: string;
        confirm_btn?: string;
    };
    timeout?: number;
    wait_time?: number;
    success_keywords?: string[];
    interval: number; // in hours
    enabled: boolean;
    lastRun?: string;
    lastResult?: {
        success: boolean;
        message: string;
        screenshot_url?: string;
        logs?: Array<{ time: string, type: string, message: string }>;
        timestamp: string;
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
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `HTTP ${response.status}`);
        }

        return response.json();
    }

    // Task Management
    async getTasks(): Promise<RenewalTask[]> {
        return this.request('/api/tasks');
    }

    async addTask(task: Omit<RenewalTask, 'id'>): Promise<{ success: boolean; task: RenewalTask }> {
        return this.request('/api/tasks', {
            method: 'POST',
            body: JSON.stringify(task),
        });
    }

    async updateTask(id: string, updates: Partial<RenewalTask>): Promise<{ success: boolean; task: RenewalTask }> {
        return this.request(`/api/tasks/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates),
        });
    }

    async deleteTask(id: string): Promise<{ success: boolean }> {
        return this.request(`/api/tasks/${id}`, { method: 'DELETE' });
    }

    async runTask(id: string): Promise<{ success: boolean; result: any }> {
        return this.request(`/api/tasks/${id}/run`, { method: 'POST' });
    }

    async toggleTask(id: string, enabled: boolean): Promise<{ success: boolean }> {
        return this.request(`/api/tasks/${id}/toggle`, {
            method: 'POST',
            body: JSON.stringify({ enabled }),
        });
    }

    async checkProxy(proxy: string): Promise<{ success: boolean; message?: string; error?: string }> {
        return this.request('/api/proxy/check', {
            method: 'POST',
            body: JSON.stringify({ proxy }),
        });
    }

    async getTaskLogs(id: string): Promise<{ success: boolean; logs: string }> {
        return this.request(`/api/tasks/${id}/logs`);
    }
}

export const api = new ApiService();
