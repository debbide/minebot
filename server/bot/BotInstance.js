import mineflayer from 'mineflayer';
import pkg from 'mineflayer-pathfinder';
const { pathfinder, Movements, goals } = pkg;
import { BehaviorManager } from './behaviors/index.js';
import axios from 'axios';
import SftpClient from 'ssh2-sftp-client';

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
      sftp: config.sftp || null, // SFTP 配置
      fileAccessType: config.fileAccessType || 'pterodactyl', // 文件访问方式: 'pterodactyl' | 'sftp' | 'none'
      autoOp: config.autoOp !== false // 默认启用自动OP
    };

    // 从配置加载模式设置 (确保所有模式都有默认值)
    const defaultModes = {
      aiView: false,
      patrol: false,
      autoChat: config.autoChat?.enabled || false,
      autoAttack: false,
      follow: false,
      mining: false,
      invincible: false  // 无敌模式
    };
    this.modes = { ...defaultModes, ...(config.modes || {}) };

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
   * 重连逻辑 - 完全清理后重连
   */
  attemptRepair(reason = '断开') {
    if (this.destroyed || this.reconnecting) return;

    this.reconnecting = true;
    this.status.connected = false;
    // 重置活动时间，避免重连期间再次触发卡死检测
    this.lastActivity = Date.now();
    this.log('warning', `连接${reason}，5秒后重连...`, '🔄');

    // 完全清理旧实例（与 disconnect 类似但不设置 destroyed）
    this.cleanup();

    // 5秒后重新连接（比之前的10秒更快）
    this.reconnectTimeout = setTimeout(async () => {
      if (this.destroyed) return;
      this.reconnecting = false;

      try {
        await this.connect();
        this.log('success', '重连成功', '✅');
      } catch (err) {
        this.log('error', `重连失败: ${err.message}，将在10秒后再次尝试...`, '✗');
        // 如果重连失败，再次尝试
        if (!this.destroyed) {
          this.reconnectTimeout = setTimeout(() => {
            if (!this.destroyed && !this.reconnecting) {
              this.attemptRepair('重连失败');
            }
          }, 10000);
        }
      }
    }, 5000);
  }

  async connect() {
    // 如果已连接且正常，不重复连接
    if (this.bot && this.status.connected) {
      this.log('warning', '已有活动连接', '⚠');
      return;
    }

    // 完全清理旧连接（使用 cleanup 确保彻底）
    if (this.bot) {
      this.cleanup();
    }

    // 等待一小段时间确保旧连接完全关闭
    await new Promise(r => setTimeout(r, 500));

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
            try {
              this.behaviors.stopAll();
            } catch (e) {
              this.log('error', `停止行为失败: ${e.message}`, '❌');
            }
          }
          // 延迟一点再重生，避免太快
          const tryRespawn = (attempt = 1) => {
            if (!this.bot) return;
            try {
              this.bot.respawn();
              this.log('info', `重生请求已发送 (尝试 ${attempt})`, '🔄');
            } catch (e) {
              this.log('error', `重生失败 (尝试 ${attempt}): ${e.message}`, '❌');
              if (attempt < 3) {
                setTimeout(() => tryRespawn(attempt + 1), 1000);
              }
            }
          };
          setTimeout(() => tryRespawn(), 500);
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
          // 如果正在重连或已销毁，不再触发重连
          if (!this.reconnecting && !this.destroyed) {
            this.attemptRepair('错误');
          }
        });

        this.bot.on('kicked', (reason) => {
          this.log('error', `被踢出: ${reason}`, '👢');
          this.status.connected = false;
          if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
          // 如果正在重连或已销毁，不再触发重连
          if (!this.reconnecting && !this.destroyed) {
            this.attemptRepair('被踢');
          }
        });

        this.bot.on('end', () => {
          // 如果正在重连或已销毁，不再触发重连
          if (this.reconnecting || this.destroyed) {
            this.log('info', '连接已关闭', '🔌');
            return;
          }
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
        sftp: this.status.sftp || {},
        fileAccessType: this.status.fileAccessType || 'pterodactyl',
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
      try {
        if (this.modes.aiView) {
          this.behaviors.aiView.start();
          this.log('info', 'AI 视角已恢复', '👁️');
        }
      } catch (e) {
        this.log('warning', `AI 视角恢复失败: ${e.message}`, '⚠️');
      }

      try {
        if (this.modes.patrol) {
          if (this.spawnPosition) {
            this.behaviors.patrol.centerPos = this.spawnPosition.clone();
          }
          const result = this.behaviors.patrol.start();
          if (result.success) {
            this.log('info', '巡逻模式已恢复', '🚶');
          } else {
            this.log('warning', `巡逻模式恢复失败: ${result.message}`, '⚠️');
            this.modes.patrol = false;
          }
        }
      } catch (e) {
        this.log('warning', `巡逻模式恢复失败: ${e.message}`, '⚠️');
        this.modes.patrol = false;
      }

      try {
        if (this.modes.autoAttack) {
          this.behaviors.attack.start();
          this.log('info', '自动攻击已恢复', '⚔️');
        }
      } catch (e) {
        this.log('warning', `自动攻击恢复失败: ${e.message}`, '⚠️');
      }

      try {
        if (this.modes.invincible) {
          // 使用面板控制台发送创造模式命令（确保有权限）
          this.applyInvincibleMode();
        }
      } catch (e) {
        this.log('warning', `无敌模式恢复失败: ${e.message}`, '⚠️');
      }

      try {
        if (this.modes.autoChat) {
          this.startAutoChat();
          this.log('info', '自动喊话已恢复', '💬');
        }
      } catch (e) {
        this.log('warning', `自动喊话恢复失败: ${e.message}`, '⚠️');
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
      // 无敌模式 - 使用创造模式实现真正无敌
      if (mode === 'invincible' && this.bot) {
        if (enabled) {
          this.applyInvincibleMode();
        } else {
          this.disableInvincibleMode();
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

    const result = await this.sendPanelCommand(`op ${this.status.username}`);
    if (result.success) {
      this.hasAutoOpped = true;
      this.log('success', `已自动授予 OP 权限: ${this.status.username}`, '👑');
    }
  }

  /**
   * 应用无敌模式 - 优先使用面板控制台，否则使用机器人聊天
   */
  async applyInvincibleMode() {
    if (!this.bot || !this.status.username) return;

    const username = this.status.username;

    // 优先尝试通过面板控制台发送命令（有完整权限）
    if (this.status.pterodactyl?.url && this.status.pterodactyl?.apiKey) {
      const result = await this.sendPanelCommand(`gamemode creative ${username}`);
      if (result.success) {
        this.log('success', '无敌模式已开启 (创造模式 - 通过面板)', '🛡️');
        return;
      }
      this.log('warning', '面板命令失败，尝试使用机器人命令...', '⚠');
    }

    // 回退：通过机器人聊天发送命令（不需要指定玩家名）
    this.bot.chat('/gamemode creative');
    this.log('info', '无敌模式命令已发送 (创造模式)', '🛡️');
  }

  /**
   * 关闭无敌模式
   */
  async disableInvincibleMode() {
    if (!this.bot || !this.status.username) return;

    const username = this.status.username;

    // 优先尝试通过面板控制台发送命令
    if (this.status.pterodactyl?.url && this.status.pterodactyl?.apiKey) {
      const result = await this.sendPanelCommand(`gamemode survival ${username}`);
      if (result.success) {
        this.log('success', '无敌模式已关闭 (生存模式 - 通过面板)', '🛡️');
        return;
      }
    }

    // 回退：通过机器人聊天发送命令
    this.bot.chat('/gamemode survival');
    this.log('info', '无敌模式已关闭 (生存模式)', '🛡️');
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

  // ==================== 文件管理 API ====================

  /**
   * 列出目录文件
   * @param {string} directory - 目录路径，默认为根目录
   */
  async listFiles(directory = '/') {
    const panel = this.status.pterodactyl;
    if (!panel || !panel.url || !panel.apiKey || !panel.serverId) {
      return { success: false, error: '翼龙面板未配置' };
    }

    try {
      const url = `${panel.url}/api/client/servers/${panel.serverId}/files/list`;
      const response = await axios.get(url, {
        params: { directory },
        headers: {
          'Authorization': `Bearer ${panel.apiKey}`,
          'Accept': 'application/json'
        },
        timeout: 15000
      });

      const files = response.data.data.map(item => ({
        name: item.attributes.name,
        mode: item.attributes.mode,
        size: item.attributes.size,
        isFile: item.attributes.is_file,
        isSymlink: item.attributes.is_symlink,
        isEditable: item.attributes.is_editable,
        mimetype: item.attributes.mimetype,
        createdAt: item.attributes.created_at,
        modifiedAt: item.attributes.modified_at
      }));

      return { success: true, files, directory };
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.detail || error.message;
      this.log('error', `列出文件失败: ${errMsg}`, '❌');
      return { success: false, error: errMsg };
    }
  }

  /**
   * 获取文件内容
   * @param {string} file - 文件路径
   */
  async getFileContents(file) {
    const panel = this.status.pterodactyl;
    if (!panel || !panel.url || !panel.apiKey || !panel.serverId) {
      return { success: false, error: '翼龙面板未配置' };
    }

    try {
      const url = `${panel.url}/api/client/servers/${panel.serverId}/files/contents`;
      const response = await axios.get(url, {
        params: { file },
        headers: {
          'Authorization': `Bearer ${panel.apiKey}`,
          'Accept': 'application/json'
        },
        timeout: 30000
      });

      return { success: true, content: response.data, file };
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.detail || error.message;
      this.log('error', `读取文件失败: ${errMsg}`, '❌');
      return { success: false, error: errMsg };
    }
  }

  /**
   * 写入文件内容
   * @param {string} file - 文件路径
   * @param {string} content - 文件内容
   */
  async writeFile(file, content) {
    const panel = this.status.pterodactyl;
    if (!panel || !panel.url || !panel.apiKey || !panel.serverId) {
      return { success: false, error: '翼龙面板未配置' };
    }

    try {
      const url = `${panel.url}/api/client/servers/${panel.serverId}/files/write`;
      await axios.post(url, content, {
        params: { file },
        headers: {
          'Authorization': `Bearer ${panel.apiKey}`,
          'Content-Type': 'text/plain',
          'Accept': 'application/json'
        },
        timeout: 30000
      });

      this.log('success', `文件已保存: ${file}`, '💾');
      return { success: true, message: '文件已保存' };
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.detail || error.message;
      this.log('error', `保存文件失败: ${errMsg}`, '❌');
      return { success: false, error: errMsg };
    }
  }

  /**
   * 获取文件下载链接
   * @param {string} file - 文件路径
   */
  async getDownloadUrl(file) {
    const panel = this.status.pterodactyl;
    if (!panel || !panel.url || !panel.apiKey || !panel.serverId) {
      return { success: false, error: '翼龙面板未配置' };
    }

    try {
      const url = `${panel.url}/api/client/servers/${panel.serverId}/files/download`;
      const response = await axios.get(url, {
        params: { file },
        headers: {
          'Authorization': `Bearer ${panel.apiKey}`,
          'Accept': 'application/json'
        },
        timeout: 15000
      });

      return { success: true, url: response.data.attributes.url };
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.detail || error.message;
      this.log('error', `获取下载链接失败: ${errMsg}`, '❌');
      return { success: false, error: errMsg };
    }
  }

  /**
   * 获取上传链接
   */
  async getUploadUrl() {
    const panel = this.status.pterodactyl;
    if (!panel || !panel.url || !panel.apiKey || !panel.serverId) {
      return { success: false, error: '翼龙面板未配置' };
    }

    try {
      const url = `${panel.url}/api/client/servers/${panel.serverId}/files/upload`;
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${panel.apiKey}`,
          'Accept': 'application/json'
        },
        timeout: 15000
      });

      return { success: true, url: response.data.attributes.url };
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.detail || error.message;
      this.log('error', `获取上传链接失败: ${errMsg}`, '❌');
      return { success: false, error: errMsg };
    }
  }

  /**
   * 创建文件夹
   * @param {string} root - 父目录
   * @param {string} name - 文件夹名称
   */
  async createFolder(root, name) {
    const panel = this.status.pterodactyl;
    if (!panel || !panel.url || !panel.apiKey || !panel.serverId) {
      return { success: false, error: '翼龙面板未配置' };
    }

    try {
      const url = `${panel.url}/api/client/servers/${panel.serverId}/files/create-folder`;
      await axios.post(url, { root, name }, {
        headers: {
          'Authorization': `Bearer ${panel.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000
      });

      this.log('success', `文件夹已创建: ${root}${name}`, '📁');
      return { success: true, message: '文件夹已创建' };
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.detail || error.message;
      this.log('error', `创建文件夹失败: ${errMsg}`, '❌');
      return { success: false, error: errMsg };
    }
  }

  /**
   * 删除文件/文件夹
   * @param {string} root - 目录
   * @param {string[]} files - 要删除的文件名列表
   */
  async deleteFiles(root, files) {
    const panel = this.status.pterodactyl;
    if (!panel || !panel.url || !panel.apiKey || !panel.serverId) {
      return { success: false, error: '翼龙面板未配置' };
    }

    try {
      const url = `${panel.url}/api/client/servers/${panel.serverId}/files/delete`;
      await axios.post(url, { root, files }, {
        headers: {
          'Authorization': `Bearer ${panel.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000
      });

      this.log('success', `已删除 ${files.length} 个文件`, '🗑️');
      return { success: true, message: `已删除 ${files.length} 个文件` };
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.detail || error.message;
      this.log('error', `删除文件失败: ${errMsg}`, '❌');
      return { success: false, error: errMsg };
    }
  }

  /**
   * 重命名文件/文件夹
   * @param {string} root - 目录
   * @param {string} from - 原名称
   * @param {string} to - 新名称
   */
  async renameFile(root, from, to) {
    const panel = this.status.pterodactyl;
    if (!panel || !panel.url || !panel.apiKey || !panel.serverId) {
      return { success: false, error: '翼龙面板未配置' };
    }

    try {
      const url = `${panel.url}/api/client/servers/${panel.serverId}/files/rename`;
      await axios.put(url, {
        root,
        files: [{ from, to }]
      }, {
        headers: {
          'Authorization': `Bearer ${panel.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000
      });

      this.log('success', `已重命名: ${from} -> ${to}`, '✏️');
      return { success: true, message: '重命名成功' };
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.detail || error.message;
      this.log('error', `重命名失败: ${errMsg}`, '❌');
      return { success: false, error: errMsg };
    }
  }

  /**
   * 复制文件
   * @param {string} location - 文件路径
   */
  async copyFile(location) {
    const panel = this.status.pterodactyl;
    if (!panel || !panel.url || !panel.apiKey || !panel.serverId) {
      return { success: false, error: '翼龙面板未配置' };
    }

    try {
      const url = `${panel.url}/api/client/servers/${panel.serverId}/files/copy`;
      await axios.post(url, { location }, {
        headers: {
          'Authorization': `Bearer ${panel.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000
      });

      this.log('success', `已复制: ${location}`, '📋');
      return { success: true, message: '复制成功' };
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.detail || error.message;
      this.log('error', `复制失败: ${errMsg}`, '❌');
      return { success: false, error: errMsg };
    }
  }

  /**
   * 压缩文件
   * @param {string} root - 目录
   * @param {string[]} files - 要压缩的文件列表
   */
  async compressFiles(root, files) {
    const panel = this.status.pterodactyl;
    if (!panel || !panel.url || !panel.apiKey || !panel.serverId) {
      return { success: false, error: '翼龙面板未配置' };
    }

    try {
      const url = `${panel.url}/api/client/servers/${panel.serverId}/files/compress`;
      const response = await axios.post(url, { root, files }, {
        headers: {
          'Authorization': `Bearer ${panel.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 120000
      });

      const archiveName = response.data.attributes.name;
      this.log('success', `已压缩为: ${archiveName}`, '📦');
      return { success: true, archive: archiveName };
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.detail || error.message;
      this.log('error', `压缩失败: ${errMsg}`, '❌');
      return { success: false, error: errMsg };
    }
  }

  /**
   * 解压文件
   * @param {string} root - 目录
   * @param {string} file - 压缩包名称
   */
  async decompressFile(root, file) {
    const panel = this.status.pterodactyl;
    if (!panel || !panel.url || !panel.apiKey || !panel.serverId) {
      return { success: false, error: '翼龙面板未配置' };
    }

    try {
      const url = `${panel.url}/api/client/servers/${panel.serverId}/files/decompress`;
      await axios.post(url, { root, file }, {
        headers: {
          'Authorization': `Bearer ${panel.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 120000
      });

      this.log('success', `已解压: ${file}`, '📂');
      return { success: true, message: '解压成功' };
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.detail || error.message;
      this.log('error', `解压失败: ${errMsg}`, '❌');
      return { success: false, error: errMsg };
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
      this.disableInvincibleMode();
      this.modes.invincible = false;
      this.bot.chat('无敌模式已关闭');
    } else {
      this.applyInvincibleMode();
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

  // ==================== SFTP 配置与文件管理 ====================

  /**
   * 设置 SFTP 配置
   */
  setSftpConfig(config) {
    this.status.sftp = {
      host: config.host || '',
      port: parseInt(config.port) || 22,
      username: config.username || '',
      password: config.password || '',
      privateKey: config.privateKey || '',
      basePath: config.basePath || '/' // 基础路径，用于限制访问范围
    };
    this.log('info', 'SFTP 配置已更新', '🔑');
    if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
    this.saveConfig();
    return this.status.sftp;
  }

  /**
   * 设置文件访问方式
   * @param {string} type - 'pterodactyl' | 'sftp' | 'none'
   */
  setFileAccessType(type) {
    const validTypes = ['pterodactyl', 'sftp', 'none'];
    if (!validTypes.includes(type)) {
      return { success: false, message: `无效的文件访问方式，可选: ${validTypes.join(', ')}` };
    }
    this.status.fileAccessType = type;
    this.log('info', `文件访问方式已设置为: ${type}`, '📁');
    if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
    this.saveConfig();
    return { success: true, type };
  }

  /**
   * 获取 SFTP 客户端连接
   */
  async getSftpClient() {
    const sftp = this.status.sftp;
    if (!sftp || !sftp.host || !sftp.username) {
      throw new Error('SFTP 未配置');
    }

    const client = new SftpClient();
    const connectOptions = {
      host: sftp.host,
      port: sftp.port || 22,
      username: sftp.username
    };

    // 优先使用私钥，否则使用密码
    if (sftp.privateKey) {
      connectOptions.privateKey = sftp.privateKey;
    } else if (sftp.password) {
      connectOptions.password = sftp.password;
    } else {
      throw new Error('SFTP 需要密码或私钥');
    }

    await client.connect(connectOptions);
    return client;
  }

  /**
   * 获取 SFTP 完整路径
   */
  getSftpFullPath(relativePath) {
    const basePath = this.status.sftp?.basePath || '/';
    // 规范化路径
    let fullPath = relativePath.startsWith('/') ? relativePath : `${basePath}/${relativePath}`;
    // 移除多余的斜杠
    fullPath = fullPath.replace(/\/+/g, '/');
    return fullPath;
  }

  // ==================== SFTP 文件操作方法 ====================

  /**
   * 通过 SFTP 列出目录文件
   */
  async listFilesSftp(directory = '/') {
    let client;
    try {
      client = await this.getSftpClient();
      const fullPath = this.getSftpFullPath(directory);
      const list = await client.list(fullPath);

      const files = list.map(item => ({
        name: item.name,
        mode: item.rights?.user || '',
        size: item.size,
        isFile: item.type === '-',
        isSymlink: item.type === 'l',
        isEditable: item.type === '-' && item.size < 10 * 1024 * 1024, // 小于 10MB 可编辑
        mimetype: this.getMimeType(item.name),
        createdAt: item.accessTime ? new Date(item.accessTime).toISOString() : null,
        modifiedAt: item.modifyTime ? new Date(item.modifyTime).toISOString() : null
      }));

      return { success: true, files, directory };
    } catch (error) {
      this.log('error', `SFTP 列出文件失败: ${error.message}`, '❌');
      return { success: false, error: error.message };
    } finally {
      if (client) await client.end();
    }
  }

  /**
   * 通过 SFTP 获取文件内容
   */
  async getFileContentsSftp(file) {
    let client;
    try {
      client = await this.getSftpClient();
      const fullPath = this.getSftpFullPath(file);
      const content = await client.get(fullPath);

      return { success: true, content: content.toString('utf-8'), file };
    } catch (error) {
      this.log('error', `SFTP 读取文件失败: ${error.message}`, '❌');
      return { success: false, error: error.message };
    } finally {
      if (client) await client.end();
    }
  }

  /**
   * 通过 SFTP 写入文件内容
   */
  async writeFileSftp(file, content) {
    let client;
    try {
      client = await this.getSftpClient();
      const fullPath = this.getSftpFullPath(file);
      await client.put(Buffer.from(content, 'utf-8'), fullPath);

      this.log('success', `SFTP 文件已保存: ${file}`, '💾');
      return { success: true, message: '文件已保存' };
    } catch (error) {
      this.log('error', `SFTP 保存文件失败: ${error.message}`, '❌');
      return { success: false, error: error.message };
    } finally {
      if (client) await client.end();
    }
  }

  /**
   * 通过 SFTP 创建文件夹
   */
  async createFolderSftp(root, name) {
    let client;
    try {
      client = await this.getSftpClient();
      const fullPath = this.getSftpFullPath(`${root}/${name}`);
      await client.mkdir(fullPath, true);

      this.log('success', `SFTP 文件夹已创建: ${root}${name}`, '📁');
      return { success: true, message: '文件夹已创建' };
    } catch (error) {
      this.log('error', `SFTP 创建文件夹失败: ${error.message}`, '❌');
      return { success: false, error: error.message };
    } finally {
      if (client) await client.end();
    }
  }

  /**
   * 通过 SFTP 删除文件/文件夹
   */
  async deleteFilesSftp(root, files) {
    let client;
    try {
      client = await this.getSftpClient();
      let deletedCount = 0;

      for (const fileName of files) {
        const fullPath = this.getSftpFullPath(`${root}/${fileName}`);
        try {
          // 检查是文件还是目录
          const stat = await client.stat(fullPath);
          if (stat.isDirectory) {
            await client.rmdir(fullPath, true); // 递归删除目录
          } else {
            await client.delete(fullPath);
          }
          deletedCount++;
        } catch (e) {
          this.log('warning', `删除 ${fileName} 失败: ${e.message}`, '⚠');
        }
      }

      this.log('success', `SFTP 已删除 ${deletedCount} 个文件`, '🗑️');
      return { success: true, message: `已删除 ${deletedCount} 个文件` };
    } catch (error) {
      this.log('error', `SFTP 删除文件失败: ${error.message}`, '❌');
      return { success: false, error: error.message };
    } finally {
      if (client) await client.end();
    }
  }

  /**
   * 通过 SFTP 重命名文件/文件夹
   */
  async renameFileSftp(root, from, to) {
    let client;
    try {
      client = await this.getSftpClient();
      const fromPath = this.getSftpFullPath(`${root}/${from}`);
      const toPath = this.getSftpFullPath(`${root}/${to}`);
      await client.rename(fromPath, toPath);

      this.log('success', `SFTP 已重命名: ${from} -> ${to}`, '✏️');
      return { success: true, message: '重命名成功' };
    } catch (error) {
      this.log('error', `SFTP 重命名失败: ${error.message}`, '❌');
      return { success: false, error: error.message };
    } finally {
      if (client) await client.end();
    }
  }

  /**
   * 通过 SFTP 复制文件（下载后上传到新位置）
   */
  async copyFileSftp(location) {
    let client;
    try {
      client = await this.getSftpClient();
      const fullPath = this.getSftpFullPath(location);

      // 生成副本名称
      const lastSlash = location.lastIndexOf('/');
      const dir = location.substring(0, lastSlash + 1);
      const fileName = location.substring(lastSlash + 1);
      const ext = fileName.lastIndexOf('.');
      const baseName = ext > 0 ? fileName.substring(0, ext) : fileName;
      const extension = ext > 0 ? fileName.substring(ext) : '';
      const copyName = `${baseName} copy${extension}`;
      const copyPath = this.getSftpFullPath(`${dir}${copyName}`);

      // 读取原文件内容
      const content = await client.get(fullPath);
      // 写入副本
      await client.put(content, copyPath);

      this.log('success', `SFTP 已复制: ${location} -> ${copyName}`, '📋');
      return { success: true, message: '复制成功' };
    } catch (error) {
      this.log('error', `SFTP 复制失败: ${error.message}`, '❌');
      return { success: false, error: error.message };
    } finally {
      if (client) await client.end();
    }
  }

  /**
   * 获取 SFTP 文件下载（返回文件内容的 Buffer）
   */
  async getFileDownloadSftp(file) {
    let client;
    try {
      client = await this.getSftpClient();
      const fullPath = this.getSftpFullPath(file);
      const content = await client.get(fullPath);

      return { success: true, content, file };
    } catch (error) {
      this.log('error', `SFTP 下载文件失败: ${error.message}`, '❌');
      return { success: false, error: error.message };
    } finally {
      if (client) await client.end();
    }
  }

  /**
   * 通过 SFTP 上传文件
   */
  async uploadFileSftp(directory, fileName, content) {
    let client;
    try {
      client = await this.getSftpClient();
      const fullPath = this.getSftpFullPath(`${directory}/${fileName}`);
      await client.put(content, fullPath);

      this.log('success', `SFTP 文件已上传: ${fileName}`, '📤');
      return { success: true, message: '文件已上传' };
    } catch (error) {
      this.log('error', `SFTP 上传文件失败: ${error.message}`, '❌');
      return { success: false, error: error.message };
    } finally {
      if (client) await client.end();
    }
  }

  /**
   * 根据文件名获取 MIME 类型
   */
  getMimeType(fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mimeTypes = {
      txt: 'text/plain',
      json: 'application/json',
      yml: 'text/yaml',
      yaml: 'text/yaml',
      properties: 'text/x-java-properties',
      cfg: 'text/plain',
      conf: 'text/plain',
      ini: 'text/plain',
      log: 'text/plain',
      xml: 'application/xml',
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      jar: 'application/java-archive',
      zip: 'application/zip',
      gz: 'application/gzip',
      tar: 'application/x-tar',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      ico: 'image/x-icon'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}
