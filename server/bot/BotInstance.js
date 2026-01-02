import mineflayer from 'mineflayer';
import pkg from 'mineflayer-pathfinder';
const { pathfinder, Movements, goals } = pkg;

/**
 * Single bot instance for one server connection
 */
export class BotInstance {
  constructor(id, config, aiService, onLog, onStatusChange) {
    this.id = id;
    this.config = config;
    this.aiService = aiService;
    this.onLog = onLog;
    this.onStatusChange = onStatusChange;

    this.bot = null;
    this.reconnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.connectionTimeout = null;
    this.activityMonitorInterval = null;
    this.autoChatInterval = null;
    this.lastActivity = Date.now();

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
      username: ''
    };

    this.modes = {
      aiView: false,
      patrol: false,
      autoChat: config.autoChat?.enabled || false
    };

    this.commands = {
      '!help': this.cmdHelp.bind(this),
      '!come': this.cmdCome.bind(this),
      '!ask': this.cmdAsk.bind(this),
      '!stop': this.cmdStop.bind(this),
      '!pos': this.cmdPosition.bind(this),
      '!follow': this.cmdFollow.bind(this)
    };
  }

  log(type, message, icon = '') {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const entry = {
      id: Date.now(),
      timestamp,
      type,
      icon,
      message: `[${this.status.serverName}] ${message}`,
      serverId: this.id
    };
    console.log(`[${timestamp}] [${this.status.serverName}] ${icon} ${message}`);
    if (this.onLog) this.onLog(entry);
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
      modes: this.modes
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
        this.scheduleReconnect();
      }
    }, 30000);
  }

  scheduleReconnect() {
    if (this.reconnecting) return;

    this.reconnecting = true;
    this.cleanup();

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log('error', '已达到最大重连次数，停止重连', '✗');
      this.reconnecting = false;
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(15000 * Math.pow(2, this.reconnectAttempts - 1), 60000);

    this.log('info', `等待 ${delay/1000} 秒后重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`, '🔄');

    setTimeout(() => {
      this.connect().catch(err => {
        this.log('error', `重连失败: ${err.message}`, '✗');
        this.reconnecting = false;
      });
    }, delay);
  }

  async connect() {
    if (this.bot && this.status.connected) {
      this.log('warning', '已有活动连接', '⚠');
      return;
    }

    this.cleanup();
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.reconnecting = false;

    const host = this.config.host;
    const port = this.config.port || 25565;
    const username = this.config.username || this.generateUsername();
    const version = this.config.version || false; // Auto-detect

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
          connectTimeout: 30000
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

          try {
            const movements = new Movements(this.bot, this.bot.registry);
            this.bot.pathfinder.setMovements(movements);
          } catch (e) {
            this.log('warning', '路径规划初始化失败', '⚠');
          }

          this.log('success', `进入世界 (版本: ${this.bot.version})`, '✓');
          if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
          resolve();
        });

        this.bot.on('health', () => {
          this.status.health = this.bot.health;
          this.status.food = this.bot.food;
          this.updateActivity();
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
        });

        this.bot.on('kicked', (reason) => {
          this.log('error', `被踢出: ${reason}`, '👢');
          this.status.connected = false;
          if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
          this.scheduleReconnect();
        });

        this.bot.on('end', () => {
          this.log('warning', '连接断开', '🔌');
          this.status.connected = false;
          this.bot = null;
          if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
          this.scheduleReconnect();
        });

      } catch (error) {
        this.log('error', `连接失败: ${error.message}`, '✗');
        reject(error);
      }
    });
  }

  disconnect() {
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

    const messages = this.config.autoChat?.messages || ['Hello!'];
    const interval = this.config.autoChat?.interval || 60000;

    this.autoChatInterval = setInterval(() => {
      if (this.bot && this.modes.autoChat) {
        const msg = messages[Math.floor(Math.random() * messages.length)];
        this.bot.chat(msg);
        this.log('chat', `[自动] ${msg}`, '📢');
      }
    }, interval);
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
      if (this.onStatusChange) this.onStatusChange(this.id, this.getStatus());
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
    ['!help - 帮助', '!come - 过来', '!follow - 跟随', '!stop - 停止', '!pos - 位置', '!ask [问题]'].forEach(
      line => this.bot.chat(line)
    );
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

  cmdFollow(username) {
    if (!this.bot) return;
    const player = this.bot.players[username];
    if (!player?.entity) {
      this.bot.chat('找不到你');
      return;
    }
    const goal = new goals.GoalFollow(player.entity, 2);
    this.bot.pathfinder.setGoal(goal, true);
    this.bot.chat(`跟随 ${username}`);
  }

  cmdStop() {
    if (!this.bot) return;
    this.bot.pathfinder.stop();
    this.bot.chat('已停止');
  }

  cmdPosition() {
    if (!this.bot) return;
    const pos = this.bot.entity.position;
    this.bot.chat(`X=${Math.floor(pos.x)} Y=${Math.floor(pos.y)} Z=${Math.floor(pos.z)}`);
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
}
