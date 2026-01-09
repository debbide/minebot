import mineflayer from 'mineflayer';
import pkg from 'mineflayer-pathfinder';
const { pathfinder, Movements, goals } = pkg;
import { BehaviorManager } from './behaviors/index.js';
import axios from 'axios';

/**
 * Single bot instance for one server connection
 */
export class BotInstance {
  constructor(id, config, aiService, onLog, onStatusChange, configManager = null) {
    this.id = id;
    this.config = config;
    this.aiService = aiService;
    this.onLog = onLog;
    this.onStatusChange = onStatusChange;
    this.configManager = configManager; // 用于保存配置

    this.bot = null;
    this.behaviors = null;
    this.reconnecting = false;
    this.connectionTimeout = null;
    this.reconnectTimeout = null;
    this.activityMonitorInterval = null;
    this.autoChatInterval = null;
    this.restartCommandTimer = null; // 定时发送 /restart 命令
    this.lastActivity = Date.now();
    this.destroyed = false;
    this.spawnPosition = null; // 记录出生点用于巡逻
    this.hasAutoOpped = false; // 是否已自动给予OP权限

    // 每个机器人独立的日志
    this.logs = [];
    this.maxLogs = 100;

    this.status = {
      id: this.id,
      connected: false,
      serverAddress: '',
      serverName: config.name || `Server ${id}`,
      version: '',
      health: 0,
      food: 0,
      position: null,
      players: [],
      username: '',
      restartTimer: config.restartTimer || {
        enabled: false,
        intervalMinutes: 0,
        nextRestart: null,
        command: '/restart'
      },
      pterodactyl: config.pterodactyl || null, // 翼龙面板配置
      autoOp: config.autoOp !== false // 默认启用自动OP
    };

    // 从配置加载模式设置
    this.modes = config.modes || {
      aiView: false,
      patrol: false,
      autoChat: config.autoChat?.enabled || false,
      autoAttack: false,
      follow: false,
      mining: false,
      invincible: false  // 无敌模式
    };

    // 自动喊话配置
    this.autoChatConfig = config.autoChat || {
      enabled: false,
      interval: 60000,
      messages: ['Hello!']
    };

    this.commands = {
      '!help': this.cmdHelp.bind(this),
      '!come': this.cmdCome.bind(this),
      '!ask': this.cmdAsk.bind(this),
      '!stop': this.cmdStop.bind(this),
      '!pos': this.cmdPosition.bind(this),
      '!follow': this.cmdFollow.bind(this),
      '!attack': this.cmdAttack.bind(this),
      '!patrol': this.cmdPatrol.bind(this),
      '!god': this.cmdGod.bind(this),
      '!mine': this.cmdMine.bind(this),
      '!jump': this.cmdJump.bind(this),
      '!sneak': this.cmdSneak.bind(this)
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

    // 存储到本机器人的日志数组
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    console.log(`[${timestamp}] [${this.status.serverName}] ${icon} ${message}`);
    if (this.onLog) this.onLog(entry);
  }

  // 获取本机器人的日志
  getLogs() {
    return this.logs;
  }

  // 清空本机器人的日志
  clearLogs() {
    this.logs = [];
  }

  updateActivity() {
    this.lastActivity = Date.now();
  }

  generateUsername() {
    const adjectives = ['Clever', 'Swift', 'Brave', 'Happy', 'Mighty', 'Wise', 'Quick', 'Sneaky'];
    const animals = ['Fox', 'Wolf', 'Bear', 'Tiger', 'Eagle', 'Panda', 'Otter', 'Raccoon'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const animal = animals[Math.floor(Math.random() * animals.length)];
    const num = Math.floor(Math.random() * 999);
    return `${adj}${animal}${num}`;
  }

  getStatus() {
    return {
      ...this.status,
      // 添加配置中的服务器连接信息
      host: this.config.host,
      port: this.config.port,
      name: this.config.name || this.status.serverName,
      modes: this.modes,
      autoChat: this.autoChatConfig,
      behaviors: this.behaviors?.getStatus() || null
    };
  }

  cleanup() {
    if (this.activityMonitorInterval) {
      clearInterval(this.activityMonitorInterval);
      this.activityMonitorInterval = null;
    }
    if (this.autoChatInterval) {
      clearInterval(this.autoChatInterval);
      this.autoChatInterval = null;
    }
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.restartCommandTimer) {
      clearInterval(this.restartCommandTimer);
      this.restartCommandTimer = null;
    }

    // 停止所有行为
    if (this.behaviors) {
      this.behaviors.stopAll();
      this.behaviors = null;
    }

    if (this.bot) {
      try {
        this.bot.removeAllListeners();
        if (this.bot._client) {
          this.bot._client.removeAllListeners();
        }
        if (typeof this.bot.quit === 'function') {
          this.bot.quit();
        } else if (typeof this.bot.end === 'function') {
          this.bot.end();
        }
      } catch (e) {
        // Ignore
      }
      this.bot = null;
    }

    this.status.connected = false;
  }

  startActivityMonitor() {
    if (this.activityMonitorInterval) {
      clearInterval(this.activityMonitorInterval);
    }

    this.activityMonitorInterval = setInterval(() => {
      if (Date.now() - this.lastActivity > 300000) {
        this.log('warning', 'Bot 可能卡死，尝试重连...', '⏱️');
        this.attemptRepair('卡死');
      }
    }, 30000);
  }

  /**
   * 重连逻辑 - 完全照抄 Pathfinder PRO
   */
  attemptRepair(reason = '断开') {
    if (this.destroyed || this.reconnecting) return;

    this.reconnecting = true;
    this.status.connected = false;
    this.log('warning', `连接${reason}，10秒后重连...`, '🔄');

    // 清理旧实例
    if (this.bot) {
      try {
        this.bot.removeAllListeners();
        this.bot.end();
      } catch (e) {}
      this.bot = null;
    }
    if (this.behaviors) {
      this.behaviors.stopAll();
      this.behaviors = null;
    }
    if (this.activityMonitorInterval) {
      clearInterval(this.activityMonitorInterval);
      this.activityMonitorInterval = null;
    }
    if (this.autoChatInterval) {
      clearInterval(this.autoChatInterval);
      this.autoChatInterval = null;
    }

    // 10秒后重新连接
    setTimeout(() => {
      if (this.destroyed) return;
      this.reconnecting = false;
      this.connect().catch(err => {
        this.log('error', `重连失败: ${err.message}`, '✗');
      });
    }, 10000);
  }

  async connect() {
    if (this.bot && this.status.connected) {
      this.log('warning', '已有活动连接', '⚠');
      return;
    }

    // 确保旧连接已清理
    if (this.bot) {
      try {
        this.bot.removeAllListeners();
        this.bot.end();
      } catch (e) {}
      this.bot = null;
    }

    const host = this.config.host;
    const port = this.config.port || 25565;
    const username = this.config.username || this.generateUsername();
    const version = this.config.version || false;

    this.status.username = username;
    this.log('info', `正在连接 ${host}:${port} (用户: ${username})...`, '⚡');

    return new Promise((resolve, reject) => {
      try {
        const botOptions = {
          host,
          port,
          username,
          version: version || undefined,
          auth: 'offline',
          connectTimeout: 30000,
          // 增加 keepalive 检查间隔，避免因网络波动被踢
          checkTimeoutInterval: 60000
        };

        this.bot = mineflayer.createBot(botOptions);

        this.connectionTimeout = setTimeout(() => {
          if (this.bot && !this.status.connected) {
            this.log('error', '连接超时', '❌');
            this.scheduleReconnect();
            reject(new Error('Connection timeout'));
          }
        }, 30000);

        this.bot.loadPlugin(pathfinder);

        this.bot.on('login', () => {
          this.log('success', `登录成功 (${username})`, '✅');
          clearTimeout(this.connectionTimeout);
          this.reconnecting = false;
          this.reconnectAttempts = 0;
          this.updateActivity();
          this.startActivityMonitor();

          if (this.modes.autoChat) {
            this.startAutoChat();
          }
        });

        this.bot.once('spawn', () => {
          this.status.connected = true;
          this.status.serverAddress = `${host}:${port}`;
          this.status.version = this.bot.version;

          // 记录出生点用于巡逻
          if (this.bot.entity) {
            this.spawnPosition = this.bot.entity.position.clone();
          }

          try {
            const movements = new Movements(this.bot, this.bot.registry);
            movements.canDig = false; // 禁止挖掘方块
            this.bot.pathfinder.setMovements(movements);
          } catch (e) {
            this.log('warning', '路径规划初始化失败', '⚠');
          }

          // 初始化行为管理器，传递日志函数以便巡逻等行为输出坐标
          this.behaviors = new BehaviorManager(this.bot, goals, this.log.bind(this));

          this.log('success', `进入世界 (版本: ${this.bot.version})`, '✓');

          // 恢复之前开启的模式
          this.restoreModes();

          // 自动给机器人 OP 权限（通过翼龙面板）
          if (this.status.autoOp && this.status.pterodactyl && !this.hasAutoOpped) {
            this.autoOpSelf();
          }

          if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
          resolve();
        });

        this.bot.on('health', () => {
          this.status.health = this.bot.health;
          this.status.food = this.bot.food;
          this.updateActivity();
          if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
        });

        // 死亡自动重生
        this.bot.on('death', () => {
          this.log('warning', '机器人死亡，正在重生...', '💀');
          // 停止所有行为
          if (this.behaviors) {
            this.behaviors.stopAll();
          }
          // 延迟一点再重生，避免太快
          setTimeout(() => {
            if (this.bot) {
              this.bot.respawn();
            }
          }, 1000);
        });

        this.bot.on('respawn', () => {
          this.log('info', '已重生', '✨');
          // 更新出生点
          if (this.bot?.entity) {
            this.spawnPosition = this.bot.entity.position.clone();
          }
          if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
        });

        this.bot.on('move', () => {
          if (this.bot?.entity) {
            this.status.position = this.bot.entity.position;
            this.updateActivity();
          }
        });

        this.bot.on('playerJoined', (player) => {
          if (this.bot) {
            this.status.players = Object.keys(this.bot.players);
            this.log('info', `${player.username} 加入`, '👋');
            if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
          }
        });

        this.bot.on('playerLeft', (player) => {
          if (this.bot) {
            this.status.players = Object.keys(this.bot.players);
            if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
          }
        });

        this.bot.on('chat', async (chatUsername, message) => {
          if (!this.bot || chatUsername === this.bot.username) return;
          this.updateActivity();
          this.log('chat', `${chatUsername}: ${message}`, '💬');

          if (message.startsWith('!')) {
            await this.handleCommand(chatUsername, message);
          }
        });

        this.bot.on('error', (err) => {
          this.log('error', `错误: ${err.message}`, '✗');
          this.attemptRepair('错误');
        });

        this.bot.on('kicked', (reason) => {
          this.log('error', `被踢出: ${reason}`, '👢');
          this.status.connected = false;
          if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
          this.attemptRepair('被踢');
        });

        this.bot.on('end', () => {
          this.log('warning', '连接断开', '🔌');
          this.status.connected = false;
          this.bot = null;
          if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
          this.attemptRepair('断开');
        });

      } catch (error) {
        this.log('error', `连接失败: ${error.message}`, '✗');
        this.attemptRepair('连接失败');
        reject(error);
      }
    });
  }

  disconnect() {
    this.destroyed = true;
    this.reconnecting = true;
    this.cleanup();
    this.log('info', '已断开', '🔌');
    if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
    this.reconnecting = false;
  }

  startAutoChat() {
    if (this.autoChatInterval) {
      clearInterval(this.autoChatInterval);
    }

    const messages = this.autoChatConfig.messages || ['Hello!'];
    const interval = this.autoChatConfig.interval || 60000;

    this.autoChatInterval = setInterval(() => {
      if (this.bot && this.modes.autoChat) {
        const msg = messages[Math.floor(Math.random() * messages.length)];
        this.bot.chat(msg);
        this.log('chat', `[自动] ${msg}`, '📢');
      }
    }, interval);
  }

  /**
   * 更新自动喊话配置
   */
  updateAutoChatConfig(config) {
    this.autoChatConfig = {
      ...this.autoChatConfig,
      ...config
    };
    // 如果正在运行，重启以应用新配置
    if (this.modes.autoChat) {
      this.startAutoChat();
    }
    this.saveConfig();
    return this.autoChatConfig;
  }

  /**
   * 保存配置到 ConfigManager
   */
  saveConfig() {
    if (!this.configManager) return;

    try {
      this.configManager.updateServer(this.id, {
        modes: this.modes,
        autoChat: this.autoChatConfig,
        restartTimer: {
          enabled: this.status.restartTimer?.enabled || false,
          intervalMinutes: this.status.restartTimer?.intervalMinutes || 0,
          command: this.status.restartTimer?.command || '/restart'
        },
        pterodactyl: this.status.pterodactyl || {},
        autoOp: this.status.autoOp
      });
      this.log('info', '配置已保存', '💾');
    } catch (error) {
      this.log('warning', `保存配置失败: ${error.message}`, '⚠');
    }
  }

  /**
   * 恢复之前开启的模式（重连后调用）
   */
  restoreModes() {
    if (!this.bot || !this.behaviors) return;

    // 稍微延迟一下，确保机器人完全初始化
    setTimeout(() => {
      if (this.modes.aiView) {
        this.behaviors.aiView.start();
        this.log('info', 'AI 视角已恢复', '👁️');
      }

      if (this.modes.patrol) {
        if (this.spawnPosition) {
          this.behaviors.patrol.centerPos = this.spawnPosition.clone();
        }
        this.behaviors.patrol.start();
        this.log('info', '巡逻模式已恢复', '🚶');
      }

      if (this.modes.autoAttack) {
        this.behaviors.attack.start();
        this.log('info', '自动攻击已恢复', '⚔️');
      }

      if (this.modes.invincible) {
        this.bot.chat(`/effect give ${this.bot.username} resistance 999999 255 true`);
        this.bot.chat(`/effect give ${this.bot.username} regeneration 999999 5 true`);
        this.bot.chat(`/effect give ${this.bot.username} fire_resistance 999999 1 true`);
        this.log('info', '无敌模式已恢复', '🛡️');
      }

      if (this.modes.autoChat) {
        this.startAutoChat();
        this.log('info', '自动喊话已恢复', '💬');
      }
    }, 2000);
  }

  setMode(mode, enabled) {
    if (mode in this.modes) {
      this.modes[mode] = enabled;
      if (mode === 'autoChat') {
        if (enabled) {
          this.startAutoChat();
        } else if (this.autoChatInterval) {
          clearInterval(this.autoChatInterval);
          this.autoChatInterval = null;
        }
      }
      // AI 视角模式
      if (mode === 'aiView' && this.behaviors) {
        if (enabled) {
          this.behaviors.aiView.start();
          this.log('info', 'AI 视角已开启', '👁️');
        } else {
          this.behaviors.aiView.stop();
          this.log('info', 'AI 视角已关闭', '👁️');
        }
      }
      // 巡逻模式
      if (mode === 'patrol' && this.behaviors) {
        if (enabled) {
          // 使用出生点作为巡逻中心
          if (this.spawnPosition) {
            this.behaviors.patrol.centerPos = this.spawnPosition.clone();
          }
          this.behaviors.patrol.start();
          this.log('info', '巡逻模式已开启', '🚶');
        } else {
          this.behaviors.patrol.stop();
          this.log('info', '巡逻模式已关闭', '🚶');
        }
      }
      // 无敌模式 - 使用游戏命令
      if (mode === 'invincible' && this.bot) {
        if (enabled) {
          // 给予抗性提升255级（几乎无敌）+ 生命恢复
          this.bot.chat(`/effect give ${this.bot.username} resistance 999999 255 true`);
          this.bot.chat(`/effect give ${this.bot.username} regeneration 999999 5 true`);
          this.bot.chat(`/effect give ${this.bot.username} fire_resistance 999999 1 true`);
          this.log('info', '无敌模式已开启', '🛡️');
        } else {
          // 清除效果
          this.bot.chat(`/effect clear ${this.bot.username}`);
          this.log('info', '无敌模式已关闭', '🛡️');
        }
      }
      // 保存模式设置到配置
      this.saveConfig();
      if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
    }
  }

  /**
   * 设置定时发送 /restart 命令
   * @param {number} minutes - 间隔分钟数，0 表示禁用
   */
  setRestartTimer(minutes) {
    // 清除现有定时器
    if (this.restartCommandTimer) {
      clearInterval(this.restartCommandTimer);
      this.restartCommandTimer = null;
    }

    if (minutes > 0 && this.bot) {
      const intervalMs = minutes * 60 * 1000;
      const nextRestart = new Date(Date.now() + intervalMs);

      this.status.restartTimer = {
        enabled: true,
        intervalMinutes: minutes,
        nextRestart: nextRestart.toISOString()
      };

      this.restartCommandTimer = setInterval(() => {
        if (this.bot && this.status.connected) {
          this.bot.chat('/restart');
          this.log('info', '执行定时重启命令 /restart', '⏰');
          // 更新下次重启时间
          this.status.restartTimer.nextRestart = new Date(Date.now() + intervalMs).toISOString();
          if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
        }
      }, intervalMs);

      this.log('info', `定时重启已设置: 每 ${minutes} 分钟执行 /restart`, '⏰');
    } else {
      this.status.restartTimer = {
        enabled: false,
        intervalMinutes: 0,
        nextRestart: null
      };
      this.log('info', '定时重启已禁用', '⏰');
    }

    if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
    // 保存配置
    this.saveConfig();
    return this.status.restartTimer;
  }

  /**
   * 立即发送 /restart 命令
   */
  sendRestartCommand() {
    if (this.bot && this.status.connected) {
      this.bot.chat('/restart');
      this.log('info', '立即发送 /restart 命令', '⚡');
      return { success: true, message: '已发送 /restart' };
    }
    return { success: false, message: 'Bot 未连接' };
  }

  /**
   * 通过翼龙面板发送控制台命令
   */
  async sendPanelCommand(command) {
    const panel = this.status.pterodactyl;
    if (!panel || !panel.url || !panel.apiKey || !panel.serverId) {
      return { success: false, message: '翼龙面板未配置' };
    }

    try {
      const url = `${panel.url}/api/client/servers/${panel.serverId}/command`;
      this.log('info', `正在发送面板命令: ${command} -> ${url}`, '🖥️');

      const response = await axios.post(url, { command }, {
        headers: {
          'Authorization': `Bearer ${panel.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 10000 // 10秒超时
      });

      this.log('success', `面板命令已发送: ${command}`, '🖥️');
      return { success: true, message: `已发送: ${command}` };
    } catch (error) {
      const status = error.response?.status;
      const errDetail = error.response?.data?.errors?.[0]?.detail;
      const errMsg = errDetail || error.response?.data?.message || error.message;

      // 打印完整响应用于调试
      console.log('[Panel API Error]', {
        status,
        data: error.response?.data,
        headers: error.response?.headers
      });

      let hint = '';
      if (status === 403) {
        hint = ' (检查: API Key是否有效、IP是否被限制、账号是否有该服务器权限)';
      } else if (status === 404) {
        hint = ' (检查: 服务器ID是否正确)';
      }

      this.log('error', `面板命令失败 [${status}]: ${errMsg}${hint}`, '✗');
      return { success: false, message: `${errMsg}${hint}` };
    }
  }

  /**
   * 自动给机器人 OP 权限
   */
  async autoOpSelf() {
    if (!this.status.username) {
      this.log('warning', '无法自动OP：用户名未知', '⚠');
      return;
    }

    const result = await this.sendPanelCommand(`/op ${this.status.username}`);
    if (result.success) {
      this.hasAutoOpped = true;
      this.log('success', `已自动授予 OP 权限: ${this.status.username}`, '👑');
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
    if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
    // 保存配置
    this.saveConfig();
    return this.status.pterodactyl;
  }

  /**
   * 发送翼龙面板电源信号
   * @param {string} signal - 电源信号: 'start' | 'stop' | 'restart' | 'kill'
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
      this.log('info', `正在发送电源信号: ${signalNames[signal]} -> ${url}`, '⚡');

      const response = await axios.post(url, { signal }, {
        headers: {
          'Authorization': `Bearer ${panel.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000
      });

      this.log('success', `电源信号已发送: ${signalNames[signal]}`, '⚡');
      return { success: true, message: `已发送: ${signalNames[signal]}` };
    } catch (error) {
      const status = error.response?.status;
      const errDetail = error.response?.data?.errors?.[0]?.detail;
      const errMsg = errDetail || error.response?.data?.message || error.message;

      // 打印调试信息到控制台
      console.log('[Power API Debug]', {
        url: `${panel.url}/api/client/servers/${panel.serverId}/power`,
        status,
        apiKeyPrefix: panel.apiKey?.substring(0, 10) + '...',
        response: error.response?.data
      });

      let hint = '';
      if (status === 403) {
        hint = ' (403常见原因: 1.需要Client API Key而非Application API Key 2.API Key需在面板Account→API Credentials创建 3.检查Key是否有该服务器权限)';
      } else if (status === 404) {
        hint = ' (检查: 服务器ID应为短ID如c5281c3e，不是数字ID)';
      } else if (status === 409) {
        hint = ' (服务器状态冲突，可能已在运行或已停止)';
      } else if (status === 401) {
        hint = ' (API Key无效或已过期)';
      }

      this.log('error', `电源信号失败 [${status}]: ${errMsg}${hint}`, '✗');
      return { success: false, message: `${errMsg}${hint}` };
    }
  }

  async handleCommand(username, message) {
    const parts = message.trim().split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    if (this.commands[cmd]) {
      try {
        await this.commands[cmd](username, args);
      } catch (error) {
        this.log('error', `指令失败: ${error.message}`, '✗');
      }
    }
  }

  cmdHelp() {
    if (!this.bot) return;
    const helpLines = [
      '!help - 帮助',
      '!come - 过来',
      '!follow [玩家] - 跟随',
      '!stop - 停止所有行为',
      '!pos - 位置',
      '!attack [hostile/all] - 自动攻击',
      '!patrol - 随机巡逻',
      '!god - 无敌模式',
      '!mine - 自动挖矿',
      '!jump - 跳跃',
      '!sneak - 蹲下/站起',
      '!ask [问题] - 问AI'
    ];
    helpLines.forEach(line => this.bot.chat(line));
  }

  async cmdCome(username) {
    if (!this.bot) return;
    const player = this.bot.players[username];
    if (!player?.entity) {
      this.bot.chat('找不到你');
      return;
    }
    const goal = new goals.GoalNear(player.entity.position.x, player.entity.position.y, player.entity.position.z, 2);
    this.bot.pathfinder.setGoal(goal);
    this.bot.chat(`正在走向 ${username}`);
  }

  cmdFollow(username, args) {
    if (!this.bot || !this.behaviors) return;

    const targetName = args[0] || username;

    if (this.modes.follow) {
      this.behaviors.follow.stop();
      this.modes.follow = false;
      this.bot.chat('停止跟随');
    } else {
      const result = this.behaviors.follow.start(targetName);
      if (result.success) {
        this.modes.follow = true;
        this.bot.chat(result.message);
      } else {
        this.bot.chat(result.message);
      }
    }
    if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
  }

  cmdStop() {
    if (!this.bot) return;
    if (this.behaviors) {
      this.behaviors.stopAll();
    }
    this.bot.pathfinder.stop();
    this.modes.follow = false;
    this.modes.autoAttack = false;
    this.modes.patrol = false;
    this.modes.mining = false;
    this.bot.chat('已停止所有行为');
    if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
  }

  cmdPosition() {
    if (!this.bot) return;
    const pos = this.bot.entity.position;
    this.bot.chat(`X=${Math.floor(pos.x)} Y=${Math.floor(pos.y)} Z=${Math.floor(pos.z)}`);
  }

  cmdAttack(username, args) {
    if (!this.bot || !this.behaviors) return;

    if (this.modes.autoAttack) {
      this.behaviors.attack.stop();
      this.modes.autoAttack = false;
      this.bot.chat('停止攻击');
    } else {
      const mode = args[0] || 'hostile';
      const result = this.behaviors.attack.start(mode);
      this.modes.autoAttack = true;
      this.bot.chat(result.message);
    }
    if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
  }

  cmdPatrol() {
    if (!this.bot || !this.behaviors) return;

    if (this.modes.patrol) {
      this.behaviors.patrol.stop();
      this.modes.patrol = false;
      this.bot.chat('停止巡逻');
    } else {
      const result = this.behaviors.patrol.start();
      this.modes.patrol = true;
      this.bot.chat(result.message);
    }
    if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
  }

  cmdGod() {
    if (!this.bot) return;

    if (this.modes.invincible) {
      this.bot.chat(`/effect clear ${this.bot.username}`);
      this.modes.invincible = false;
      this.bot.chat('无敌模式已关闭');
    } else {
      this.bot.chat(`/effect give ${this.bot.username} resistance 999999 255 true`);
      this.bot.chat(`/effect give ${this.bot.username} regeneration 999999 5 true`);
      this.bot.chat(`/effect give ${this.bot.username} fire_resistance 999999 1 true`);
      this.modes.invincible = true;
      this.bot.chat('无敌模式已开启');
    }
    this.saveConfig();
    if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
  }

  cmdMine() {
    if (!this.bot || !this.behaviors) return;

    if (this.modes.mining) {
      this.behaviors.mining.stop();
      this.modes.mining = false;
      this.bot.chat('停止挖矿');
    } else {
      const result = this.behaviors.mining.start();
      this.modes.mining = true;
      this.bot.chat(result.message);
    }
    if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
  }

  cmdJump() {
    if (!this.bot || !this.behaviors) return;
    this.behaviors.action.jump();
    this.bot.chat('跳!');
  }

  cmdSneak() {
    if (!this.bot || !this.behaviors) return;
    const sneaking = this.bot.getControlState('sneak');
    this.behaviors.action.sneak(!sneaking);
    this.bot.chat(sneaking ? '站起' : '蹲下');
  }

  async cmdAsk(username, args) {
    if (!this.bot || args.length === 0) return;

    try {
      const response = await this.aiService.chat(args.join(' '), username);
      for (let i = 0; i < response.length; i += 100) {
        this.bot.chat(response.substring(i, i + 100));
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (error) {
      this.bot.chat('AI 暂时不可用');
    }
  }

  // 行为控制 API
  setBehavior(behavior, enabled, options = {}) {
    if (!this.behaviors) return { success: false, message: 'Bot 未连接' };

    let result;
    switch (behavior) {
      case 'follow':
        if (enabled) {
          result = this.behaviors.follow.start(options.target);
          this.modes.follow = result.success;
        } else {
          result = this.behaviors.follow.stop();
          this.modes.follow = false;
        }
        break;
      case 'attack':
        if (enabled) {
          result = this.behaviors.attack.start(options.mode || 'hostile');
          this.modes.autoAttack = true;
        } else {
          result = this.behaviors.attack.stop();
          this.modes.autoAttack = false;
        }
        break;
      case 'patrol':
        if (enabled) {
          result = this.behaviors.patrol.start(options.waypoints);
          this.modes.patrol = true;
        } else {
          result = this.behaviors.patrol.stop();
          this.modes.patrol = false;
        }
        break;
      case 'mining':
        if (enabled) {
          result = this.behaviors.mining.start(options.blocks);
          this.modes.mining = true;
        } else {
          result = this.behaviors.mining.stop();
          this.modes.mining = false;
        }
        break;
      default:
        result = { success: false, message: '未知行为' };
    }

    if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
    return result;
  }

  // 执行动作
  doAction(action, params = {}) {
    if (!this.behaviors) return { success: false, message: 'Bot 未连接' };

    switch (action) {
      case 'jump':
        return this.behaviors.action.jump();
      case 'sneak':
        return this.behaviors.action.sneak(params.enabled);
      case 'sprint':
        return this.behaviors.action.sprint(params.enabled);
      case 'useItem':
        return this.behaviors.action.useItem();
      case 'swing':
        return this.behaviors.action.swing();
      case 'lookAt':
        return this.behaviors.action.lookAt(params.x, params.y, params.z);
      default:
        return { success: false, message: '未知动作' };
    }
  }
}
