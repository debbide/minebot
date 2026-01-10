import axios from 'axios';
import net from 'net';

/**
 * Panel-only server instance (no Minecraft bot)
 * Used for managing servers via Pterodactyl API only
 */
export class PanelInstance {
  constructor(id, config, onLog, onStatusChange, configManager = null) {
    this.id = id;
    this.config = config;
    this.onLog = onLog;
    this.onStatusChange = onStatusChange;
    this.configManager = configManager;

    // 日志
    this.logs = [];
    this.maxLogs = 100;

    // 面板状态
    this.panelStatus = null;
    this.statusCheckInterval = null;

    this.status = {
      id: this.id,
      type: 'panel',
      connected: false, // 面板是否可访问
      serverName: config.name || `Panel ${id}`,
      pterodactyl: config.pterodactyl || null,
      panelServerState: null, // 'running', 'starting', 'stopping', 'offline'
      panelServerStats: null, // CPU, memory usage etc.
      // 服务器地址信息（从面板获取）
      serverHost: null,
      serverPort: null,
      // TCP ping 结果
      tcpOnline: null, // true/false/null(未检测)
      tcpLatency: null // 延迟毫秒
    };
  }

  log(type, message, icon = '') {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const entry = {
      id: Date.now(),
      timestamp,
      type,
      icon,
      message,
      serverId: this.id
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    console.log(`[${timestamp}] [${this.status.serverName}] ${icon} ${message}`);
    if (this.onLog) this.onLog(entry);
  }

  getLogs() {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
  }

  getStatus() {
    return {
      ...this.status,
      host: this.status.serverHost || '',
      port: this.status.serverPort || 0,
      name: this.config.name || this.status.serverName,
      modes: {},
      autoChat: null,
      behaviors: null
    };
  }

  /**
   * 检查面板配置是否有效
   */
  isPanelConfigured() {
    const panel = this.status.pterodactyl;
    return panel && panel.url && panel.apiKey && panel.serverId;
  }

  /**
   * 连接到面板（开始状态检查）
   */
  async connect() {
    if (!this.isPanelConfigured()) {
      this.log('warning', '翼龙面板未配置', '⚠');
      return;
    }

    this.log('info', '正在连接翼龙面板...', '🔌');

    try {
      // 先获取服务器分配的地址
      await this.fetchServerAllocation();
      // 再获取服务器状态
      await this.fetchServerStatus();
      this.status.connected = true;
      this.log('success', '面板连接成功', '✅');

      // 开始定期检查状态
      this.startStatusCheck();

      if (this.onStatusChange) {
        this.onStatusChange(this.id, this.getStatus());
      }
    } catch (error) {
      this.log('error', `面板连接失败: ${error.message}`, '❌');
      this.status.connected = false;
    }
  }

  /**
   * 断开连接（停止状态检查）
   */
  disconnect() {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
      this.statusCheckInterval = null;
    }
    this.status.connected = false;
    this.log('info', '已断开面板连接', '🔌');
    if (this.onStatusChange) {
      this.onStatusChange(this.id, this.getStatus());
    }
  }

  /**
   * 开始定期检查服务器状态
   */
  startStatusCheck() {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
    }

    // 每 30 秒检查一次状态
    this.statusCheckInterval = setInterval(async () => {
      try {
        await this.fetchServerStatus();
      } catch (error) {
        this.log('warning', `状态检查失败: ${error.message}`, '⚠');
      }
    }, 30000);
  }

  /**
   * 获取服务器分配的地址和端口
   */
  async fetchServerAllocation() {
    const panel = this.status.pterodactyl;
    if (!panel || !panel.url || !panel.apiKey || !panel.serverId) {
      throw new Error('面板未配置');
    }

    const url = `${panel.url}/api/client/servers/${panel.serverId}`;

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${panel.apiKey}`,
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    const data = response.data.attributes;
    const relationships = data.relationships;

    // 获取主分配（primary allocation）
    if (relationships?.allocations?.data) {
      const allocations = relationships.allocations.data;
      // 找到默认分配或第一个分配
      const primaryAlloc = allocations.find(a => a.attributes.is_default) || allocations[0];
      if (primaryAlloc) {
        const alloc = primaryAlloc.attributes;
        this.status.serverHost = alloc.ip_alias || alloc.ip;
        this.status.serverPort = alloc.port;
        this.log('info', `服务器地址: ${this.status.serverHost}:${this.status.serverPort}`, '🌐');
      }
    }

    return {
      host: this.status.serverHost,
      port: this.status.serverPort
    };
  }

  /**
   * TCP ping 检测服务器端口是否在线
   */
  tcpPing(host, port, timeout = 5000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const socket = new net.Socket();

      socket.setTimeout(timeout);

      socket.on('connect', () => {
        const latency = Date.now() - startTime;
        socket.destroy();
        resolve({ online: true, latency });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({ online: false, latency: null });
      });

      socket.on('error', () => {
        socket.destroy();
        resolve({ online: false, latency: null });
      });

      socket.connect(port, host);
    });
  }

  /**
   * 获取服务器状态
   */
  async fetchServerStatus() {
    const panel = this.status.pterodactyl;
    if (!panel || !panel.url || !panel.apiKey || !panel.serverId) {
      throw new Error('面板未配置');
    }

    const url = `${panel.url}/api/client/servers/${panel.serverId}/resources`;

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${panel.apiKey}`,
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    const data = response.data.attributes;
    this.status.panelServerState = data.current_state;
    this.status.panelServerStats = {
      cpuPercent: data.resources?.cpu_absolute || 0,
      memoryBytes: data.resources?.memory_bytes || 0,
      diskBytes: data.resources?.disk_bytes || 0,
      networkRx: data.resources?.network_rx_bytes || 0,
      networkTx: data.resources?.network_tx_bytes || 0,
      uptime: data.resources?.uptime || 0
    };

    // 如果面板显示服务器正在运行，使用 TCP ping 验证真实在线状态
    if (data.current_state === 'running' && this.status.serverHost && this.status.serverPort) {
      const pingResult = await this.tcpPing(this.status.serverHost, this.status.serverPort);
      this.status.tcpOnline = pingResult.online;
      this.status.tcpLatency = pingResult.latency;

      if (!pingResult.online) {
        this.log('warning', `TCP 检测: 端口 ${this.status.serverPort} 无响应`, '⚠');
      }
    } else {
      // 服务器未运行，不进行 TCP ping
      this.status.tcpOnline = false;
      this.status.tcpLatency = null;
    }

    if (this.onStatusChange) {
      this.onStatusChange(this.id, this.getStatus());
    }

    return this.status.panelServerStats;
  }

  /**
   * 发送电源信号
   */
  async sendPowerSignal(signal) {
    const validSignals = ['start', 'stop', 'restart', 'kill'];
    if (!validSignals.includes(signal)) {
      return { success: false, message: `无效的电源信号，可选: ${validSignals.join(', ')}` };
    }

    const panel = this.status.pterodactyl;
    if (!panel || !panel.url || !panel.apiKey || !panel.serverId) {
      return { success: false, message: '翼龙面板未配置' };
    }

    const signalNames = {
      'start': '开机',
      'stop': '关机',
      'restart': '重启',
      'kill': '强制终止'
    };

    try {
      const url = `${panel.url}/api/client/servers/${panel.serverId}/power`;
      this.log('info', `正在发送电源信号: ${signalNames[signal]}`, '⚡');

      await axios.post(url, { signal }, {
        headers: {
          'Authorization': `Bearer ${panel.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000
      });

      this.log('success', `电源信号已发送: ${signalNames[signal]}`, '⚡');

      // 刷新状态
      setTimeout(() => this.fetchServerStatus().catch(() => {}), 2000);

      return { success: true, message: `已发送: ${signalNames[signal]}` };
    } catch (error) {
      const status = error.response?.status;
      const errDetail = error.response?.data?.errors?.[0]?.detail;
      const errMsg = errDetail || error.response?.data?.message || error.message;

      let hint = '';
      if (status === 403) {
        hint = ' (检查 API Key 权限)';
      } else if (status === 404) {
        hint = ' (检查服务器 ID)';
      } else if (status === 409) {
        hint = ' (服务器状态冲突)';
      }

      this.log('error', `电源信号失败 [${status}]: ${errMsg}${hint}`, '✗');
      return { success: false, message: `${errMsg}${hint}` };
    }
  }

  /**
   * 发送控制台命令
   */
  async sendPanelCommand(command) {
    const panel = this.status.pterodactyl;
    if (!panel || !panel.url || !panel.apiKey || !panel.serverId) {
      return { success: false, message: '翼龙面板未配置' };
    }

    try {
      const url = `${panel.url}/api/client/servers/${panel.serverId}/command`;
      this.log('info', `发送控制台命令: ${command}`, '🖥️');

      await axios.post(url, { command }, {
        headers: {
          'Authorization': `Bearer ${panel.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      this.log('success', `命令已发送: ${command}`, '🖥️');
      return { success: true, message: `已发送: ${command}` };
    } catch (error) {
      const status = error.response?.status;
      const errMsg = error.response?.data?.errors?.[0]?.detail || error.message;

      this.log('error', `命令发送失败 [${status}]: ${errMsg}`, '✗');
      return { success: false, message: errMsg };
    }
  }

  /**
   * 设置翼龙面板配置
   */
  setPterodactylConfig(config) {
    this.status.pterodactyl = {
      url: (config.url || '').replace(/\/$/, ''),
      apiKey: config.apiKey || '',
      serverId: config.serverId || ''
    };
    this.log('info', '翼龙面板配置已更新', '🔑');

    // 保存配置
    if (this.configManager) {
      this.configManager.updateServer(this.id, {
        pterodactyl: this.status.pterodactyl
      });
    }

    if (this.onStatusChange) {
      this.onStatusChange(this.id, this.getStatus());
    }

    return this.status.pterodactyl;
  }

  // 以下方法返回空操作，保持接口一致性
  setMode() { return {}; }
  setBehavior() { return { success: false, message: '纯面板服务器不支持此操作' }; }
  doAction() { return { success: false, message: '纯面板服务器不支持此操作' }; }
  setRestartTimer() { return {}; }
  sendRestartCommand() { return { success: false, message: '纯面板服务器不支持此操作' }; }
  updateAutoChatConfig() { return {}; }

  /**
   * 清理资源
   */
  cleanup() {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
      this.statusCheckInterval = null;
    }
    this.status.connected = false;
  }
}
