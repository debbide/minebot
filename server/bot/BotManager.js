import mineflayer from 'mineflayer';
import pkg from 'mineflayer-pathfinder';
const { pathfinder, Movements, goals } = pkg;
import minecraftData from 'minecraft-data';

export class BotManager {
  constructor(configManager, aiService, broadcast) {
    this.configManager = configManager;
    this.aiService = aiService;
    this.broadcast = broadcast;
    this.bot = null;
    this.logs = [];
    this.maxLogs = 100;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.timer = null;
    this.autoChatInterval = null;

    this.modes = {
      aiView: false,
      patrol: false,
      autoChat: false
    };

    this.status = {
      connected: false,
      serverAddress: '',
      version: '',
      health: 0,
      food: 0,
      position: null,
      players: []
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
      message
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    this.broadcast('log', entry);
  }

  getRecentLogs() {
    return this.logs.slice(-50);
  }

  getStatus() {
    return {
      ...this.status,
      modes: this.modes
    };
  }

  getModes() {
    return this.modes;
  }

  async connect(options = {}) {
    const config = this.configManager.getConfig();
    const host = options.host || config.server?.host || 'localhost';
    const port = options.port || config.server?.port || 25565;
    const username = options.username || config.server?.username || 'MinecraftBot';
    const version = options.version || config.server?.version || false;

    if (this.bot) {
      this.disconnect();
    }

    this.log('info', `正在连接服务器 ${host}:${port}...`, '⚡');

    return new Promise((resolve, reject) => {
      try {
        this.bot = mineflayer.createBot({
          host,
          port,
          username,
          version,
          auth: 'offline'
        });

        this.bot.loadPlugin(pathfinder);

        this.bot.once('spawn', () => {
          this.status.connected = true;
          this.status.serverAddress = `${host}:${port}`;
          this.status.version = this.bot.version;
          this.reconnectAttempts = 0;

          const mcData = minecraftData(this.bot.version);
          const movements = new Movements(this.bot, mcData);
          this.bot.pathfinder.setMovements(movements);

          this.log('success', `成功进入世界 (版本: ${this.bot.version})`, '✓');
          this.log('success', '[路径规划] 版本适配成功', '✓');

          this.broadcast('status', this.getStatus());
          resolve();
        });

        this.bot.on('health', () => {
          this.status.health = this.bot.health;
          this.status.food = this.bot.food;
          this.broadcast('status', this.getStatus());
        });

        this.bot.on('move', () => {
          this.status.position = this.bot.entity.position;
        });

        this.bot.on('playerJoined', (player) => {
          this.status.players = Object.keys(this.bot.players);
          this.log('info', `玩家 ${player.username} 加入游戏`, '👋');
          this.broadcast('status', this.getStatus());
        });

        this.bot.on('playerLeft', (player) => {
          this.status.players = Object.keys(this.bot.players);
          this.log('info', `玩家 ${player.username} 离开游戏`, '👋');
          this.broadcast('status', this.getStatus());
        });

        this.bot.on('chat', async (username, message) => {
          if (username === this.bot.username) return;

          this.log('chat', `${username}: ${message}`, '💬');

          // Handle commands
          if (message.startsWith('!')) {
            await this.handleCommand(username, message);
          }
        });

        this.bot.on('error', (err) => {
          this.log('error', `错误: ${err.message}`, '✗');
          reject(err);
        });

        this.bot.on('kicked', (reason) => {
          this.log('error', `被踢出: ${reason}`, '✗');
          this.status.connected = false;
          this.broadcast('status', this.getStatus());
        });

        this.bot.on('end', () => {
          this.log('warning', '连接已断开', '⚠');
          this.status.connected = false;
          this.bot = null;
          this.broadcast('status', this.getStatus());

          // Auto reconnect with exponential backoff
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            // Delay increases: 10s, 20s, 40s, 60s, 60s
            const delay = Math.min(10000 * Math.pow(2, this.reconnectAttempts - 1), 60000);
            this.log('info', `尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})，${delay/1000}秒后...`, '🔄');
            setTimeout(() => this.connect(options), delay);
          }
        });

      } catch (error) {
        this.log('error', `连接失败: ${error.message}`, '✗');
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.bot) {
      try {
        if (typeof this.bot.quit === 'function') {
          this.bot.quit();
        } else if (typeof this.bot.end === 'function') {
          this.bot.end();
        }
      } catch (e) {
        // Ignore disconnect errors
      }
      this.bot = null;
      this.status.connected = false;
      this.log('info', '已断开连接', '🔌');
      this.broadcast('status', this.getStatus());
    }
  }

  async restart() {
    const config = this.configManager.getConfig();
    this.disconnect();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.connect(config.server);
  }

  setMode(mode, enabled) {
    if (mode in this.modes) {
      this.modes[mode] = enabled;
      this.log('info', `${mode} 模式: ${enabled ? '开启' : '关闭'}`, '✦');

      if (mode === 'autoChat') {
        this.handleAutoChatMode(enabled);
      } else if (mode === 'patrol') {
        this.handlePatrolMode(enabled);
      }

      this.broadcast('status', this.getStatus());
    }
  }

  handleAutoChatMode(enabled) {
    if (this.autoChatInterval) {
      clearInterval(this.autoChatInterval);
      this.autoChatInterval = null;
    }

    if (enabled && this.bot) {
      const messages = this.configManager.getConfig().autoChat?.messages || [
        '欢迎来到服务器！',
        '有问题可以问我 !ask [问题]',
        '需要帮助请输入 !help'
      ];
      const interval = this.configManager.getConfig().autoChat?.interval || 60000;

      this.autoChatInterval = setInterval(() => {
        if (this.bot && this.modes.autoChat) {
          const msg = messages[Math.floor(Math.random() * messages.length)];
          this.bot.chat(msg);
          this.log('chat', `[自动喊话] ${msg}`, '📢');
        }
      }, interval);
    }
  }

  handlePatrolMode(enabled) {
    // Patrol mode implementation
    if (enabled && this.bot) {
      this.log('info', '巡逻模式已启动', '🚶');
      // Add patrol waypoints logic here
    } else {
      this.bot?.pathfinder?.stop();
    }
  }

  setTimer(minutes, hours, action = 'restart') {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    const totalMs = ((hours || 0) * 60 + (minutes || 0)) * 60 * 1000;

    if (totalMs > 0) {
      this.log('info', `定时器已设置: ${hours || 0}时${minutes || 0}分后${action}`, '⏰');

      this.timer = setTimeout(async () => {
        this.log('info', `定时器触发: ${action}`, '⏰');
        if (action === 'restart') {
          await this.restart();
        } else if (action === 'disconnect') {
          this.disconnect();
        }
      }, totalMs);
    }
  }

  async handleCommand(username, message) {
    const parts = message.trim().split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    if (this.commands[cmd]) {
      try {
        await this.commands[cmd](username, args);
        this.log('success', `指令执行成功: ${cmd}`, '✓');
      } catch (error) {
        this.log('error', `指令执行失败: ${error.message}`, '✗');
      }
    } else {
      this.bot.chat(`未知指令: ${cmd}，输入 !help 查看帮助`);
    }
  }

  async executeCommand(command) {
    if (this.bot) {
      this.bot.chat(command);
      this.log('info', `发送指令: ${command}`, '📤');
      return true;
    }
    throw new Error('机器人未连接');
  }

  // Command implementations
  cmdHelp(username) {
    const helpText = [
      '可用指令:',
      '!help - 显示帮助',
      '!come - 走向你',
      '!follow - 跟随你',
      '!stop - 停止移动',
      '!pos - 显示位置',
      '!ask [问题] - 问AI问题'
    ];
    helpText.forEach(line => this.bot.chat(line));
  }

  async cmdCome(username) {
    const player = this.bot.players[username];
    if (!player?.entity) {
      this.bot.chat('找不到你的位置');
      return;
    }

    const goal = new goals.GoalNear(
      player.entity.position.x,
      player.entity.position.y,
      player.entity.position.z,
      2
    );
    this.bot.pathfinder.setGoal(goal);
    this.bot.chat(`正在走向 ${username}`);
  }

  cmdFollow(username) {
    const player = this.bot.players[username];
    if (!player?.entity) {
      this.bot.chat('找不到你的位置');
      return;
    }

    const goal = new goals.GoalFollow(player.entity, 2);
    this.bot.pathfinder.setGoal(goal, true);
    this.bot.chat(`开始跟随 ${username}`);
  }

  cmdStop() {
    this.bot.pathfinder.stop();
    this.bot.chat('已停止');
  }

  cmdPosition() {
    const pos = this.bot.entity.position;
    this.bot.chat(`位置: X=${Math.floor(pos.x)} Y=${Math.floor(pos.y)} Z=${Math.floor(pos.z)}`);
  }

  async cmdAsk(username, args) {
    if (args.length === 0) {
      this.bot.chat('请输入问题，例如: !ask 今天天气怎么样');
      return;
    }

    const question = args.join(' ');
    this.log('info', `${username} 问: ${question}`, '🤖');

    try {
      const response = await this.aiService.chat(question, username);
      // Split long responses
      const maxLen = 100;
      for (let i = 0; i < response.length; i += maxLen) {
        this.bot.chat(response.substring(i, i + maxLen));
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (error) {
      this.bot.chat('AI 暂时无法回答，请稍后再试');
      this.log('error', `AI 错误: ${error.message}`, '✗');
    }
  }
}
