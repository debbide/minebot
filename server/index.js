import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

import { BotManager } from './bot/BotPool.js';
import { AIService } from './services/AIService.js';
import { ConfigManager } from './services/ConfigManager.js';
import { AuthService } from './services/AuthService.js';
import { RenewalService } from './services/RenewalService.js';
import { SystemService } from './services/SystemService.js';

dotenv.config();

// 捕获未处理的异常，防止进程崩溃
process.on('uncaughtException', (err) => {
  console.error('[进程] 未捕获的异常:', err.message);
  // 对于 PartialReadError 等非致命错误，不退出进程
  if (err.name === 'PartialReadError' || err.message.includes('PartialReadError')) {
    console.error('[进程] PartialReadError - 忽略并继续运行');
    return;
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[进程] 未处理的 Promise 拒绝:', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());

// Initialize services
const configManager = new ConfigManager();
const authService = new AuthService(configManager);
const aiService = new AIService(configManager);
const systemService = new SystemService();
const botManager = new BotManager(configManager, aiService, broadcast);

// Auth routes (before auth middleware)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  if (authService.validateCredentials(username, password)) {
    const token = authService.generateToken(username);
    res.json({ success: true, token, username });
  } else {
    res.status(401).json({ error: '用户名或密码错误' });
  }
});

app.get('/api/auth/check', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.json({ authenticated: false });
  }

  const token = authHeader.substring(7);
  const decoded = authService.verifyToken(token);

  if (decoded) {
    res.json({ authenticated: true, username: decoded.username });
  } else {
    res.json({ authenticated: false });
  }
});

// Apply auth middleware to all /api routes except auth
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) {
    return next();
  }
  return authService.authMiddleware()(req, res, next);
});

// Serve static files
app.use(express.static(join(__dirname, '../dist')));

// WebSocket connections
const clients = new Set();

wss.on('connection', (ws, req) => {
  // Verify token for WebSocket connections
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (!token || !authService.verifyToken(token)) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  clients.add(ws);

  // Send current status on connection
  ws.send(JSON.stringify({
    type: 'status',
    data: botManager.getStatus()
  }));

  // Send recent logs
  ws.send(JSON.stringify({
    type: 'logs',
    data: botManager.getRecentLogs()
  }));

  ws.on('close', () => {
    clients.delete(ws);
  });
});

function broadcast(type, data) {
  const message = JSON.stringify({ type, data });
  clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

// Initialize renewal service (after broadcast is defined)
const renewalService = new RenewalService(configManager, broadcast);

// API Routes

// System status (memory monitoring)
app.get('/api/system/status', (req, res) => {
  res.json(systemService.getStatus());
});

app.get('/api/system/memory', (req, res) => {
  res.json(systemService.getMemoryStatus());
});

// Get bot status
app.get('/api/status', (req, res) => {
  res.json(botManager.getStatus());
});

// Get all configuration
app.get('/api/config', (req, res) => {
  res.json(configManager.getConfig());
});

// Get full configuration (for settings page)
app.get('/api/config/full', (req, res) => {
  const config = configManager.getFullConfig();
  // Hide sensitive data
  const safeConfig = {
    ...config,
    auth: config.auth ? { username: config.auth.username, password: '******' } : null,
    ai: config.ai ? { ...config.ai, apiKey: config.ai.apiKey ? '******' : '' } : null
  };
  res.json(safeConfig);
});

// Update configuration
app.post('/api/config', (req, res) => {
  try {
    configManager.updateConfig(req.body);
    res.json({ success: true, config: configManager.getConfig() });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Update all settings
app.post('/api/settings', (req, res) => {
  try {
    const { server, ai, auth, autoChat, autoRenew } = req.body;

    const updates = {};
    if (server) updates.server = server;
    if (ai) {
      updates.ai = {
        ...configManager.getFullConfig().ai,
        ...ai,
        // Only update apiKey if provided and not masked
        apiKey: ai.apiKey && ai.apiKey !== '******'
          ? ai.apiKey
          : configManager.getFullConfig().ai?.apiKey
      };
    }
    if (auth && auth.password !== '******') {
      updates.auth = auth;
    } else if (auth) {
      updates.auth = {
        username: auth.username,
        password: configManager.getFullConfig().auth?.password || 'admin123'
      };
    }
    if (autoChat) updates.autoChat = autoChat;
    if (autoRenew) updates.autoRenew = autoRenew;

    configManager.updateConfig(updates);

    // Reinitialize AI service if config changed
    if (ai) {
      aiService.updateConfig();
    }

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Save credentials
app.post('/api/credentials', (req, res) => {
  try {
    configManager.updateCredentials(req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Connect bot
app.post('/api/bot/connect', async (req, res) => {
  try {
    await botManager.connect(req.body);
    res.json({ success: true, status: botManager.getStatus() });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Disconnect bot
app.post('/api/bot/disconnect', (req, res) => {
  try {
    botManager.disconnect();
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Restart bot
app.post('/api/bot/restart', async (req, res) => {
  try {
    await botManager.restart();
    res.json({ success: true, status: botManager.getStatus() });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Toggle mode
app.post('/api/bot/mode', (req, res) => {
  try {
    const { mode, enabled } = req.body;
    botManager.setMode(mode, enabled);
    res.json({ success: true, modes: botManager.getModes() });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get modes
app.get('/api/bot/modes', (req, res) => {
  res.json(botManager.getModes());
});

// Set timer
app.post('/api/bot/timer', (req, res) => {
  try {
    const { minutes, hours, action } = req.body;
    botManager.setTimer(minutes, hours, action);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Execute command
app.post('/api/bot/command', async (req, res) => {
  try {
    const { command } = req.body;
    const result = await botManager.executeCommand(command);
    res.json({ success: true, result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// AI chat
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message } = req.body;
    const response = await aiService.chat(message);
    res.json({ success: true, response });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get logs
app.get('/api/logs', (req, res) => {
  res.json(botManager.getRecentLogs());
});

// ===== Multi-Server APIs =====

// Get all bots status
app.get('/api/bots', (req, res) => {
  const status = botManager.getAllStatus();
  console.log('[GET /api/bots] 返回状态:', JSON.stringify(status, null, 2));
  res.json(status);
});

// Add new server
app.post('/api/bots/add', async (req, res) => {
  try {
    // 尝试保存到配置（如果已存在会抛出错误）
    let serverConfig;
    try {
      serverConfig = configManager.addServer(req.body);
    } catch (e) {
      // 配置已存在，使用现有配置
      const servers = configManager.getServers();
      serverConfig = servers.find(s => s.id === req.body.id) || req.body;
    }
    const result = await botManager.addServer(serverConfig);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Remove server
app.delete('/api/bots/:id', (req, res) => {
  try {
    const success = botManager.removeServer(req.params.id);
    // Remove from config for persistence
    configManager.removeServer(req.params.id);
    res.json({ success });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Update server config (name, username, host, port)
app.put('/api/bots/:id', async (req, res) => {
  try {
    const { name, username, host, port } = req.body;
    const id = req.params.id;

    console.log(`[PUT /api/bots/${id}] 收到更新请求:`, { name, username, host, port });

    // Validate username format if provided
    if (username !== undefined && username !== '') {
      const usernameRegex = /^[a-zA-Z0-9_]{3,16}$/;
      if (!usernameRegex.test(username)) {
        return res.status(400).json({
          success: false,
          error: '用户名必须是3-16个字符，只能包含字母、数字和下划线'
        });
      }
    }

    // Update in config for persistence
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (username !== undefined) updates.username = username;
    if (host !== undefined) updates.host = host;
    if (port !== undefined) updates.port = parseInt(port) || 25565;

    console.log(`[PUT /api/bots/${id}] 更新配置:`, updates);

    const updatedConfig = configManager.updateServer(id, updates);
    console.log(`[PUT /api/bots/${id}] 配置已更新:`, updatedConfig);

    // Update in bot manager
    const bot = botManager.bots.get(id);
    if (bot) {
      console.log(`[PUT /api/bots/${id}] 更新 bot 实例`);
      if (name !== undefined) {
        bot.status.serverName = name;
        bot.config.name = name;
      }
      if (username !== undefined) {
        bot.config.username = username;
        // 只有未连接时才更新 status.username，连接后会自动设置
        if (!bot.status.connected) {
          bot.status.username = username;
        }
      }
      if (host !== undefined) bot.config.host = host;
      if (port !== undefined) bot.config.port = parseInt(port) || 25565;
      console.log(`[PUT /api/bots/${id}] bot.config 更新后:`, { name: bot.config.name, username: bot.config.username });
    } else {
      console.log(`[PUT /api/bots/${id}] 警告: bot 实例不存在`);
    }

    res.json({ success: true, config: updatedConfig });
  } catch (error) {
    console.error(`[PUT /api/bots/${id}] 错误:`, error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Connect all servers from config
app.post('/api/bots/connect-all', async (req, res) => {
  try {
    const results = await botManager.connectAll();
    res.json({ success: true, results });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Disconnect all servers
app.post('/api/bots/disconnect-all', (req, res) => {
  try {
    botManager.disconnectAll();
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Restart specific bot
app.post('/api/bots/:id/restart', async (req, res) => {
  try {
    const status = await botManager.restart(req.params.id);
    res.json({ success: true, status });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===== Behavior Control APIs =====

// Set behavior for a specific bot
app.post('/api/bots/:id/behavior', (req, res) => {
  try {
    const { behavior, enabled, options } = req.body;
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const result = bot.setBehavior(behavior, enabled, options || {});
    res.json({ success: result.success, message: result.message, status: bot.getStatus() });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Execute action for a specific bot
app.post('/api/bots/:id/action', (req, res) => {
  try {
    const { action, params } = req.body;
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const result = bot.doAction(action, params || {});
    res.json({ success: result.success, message: result.message });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Stop all behaviors for a specific bot
app.post('/api/bots/:id/stop-all', (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    if (bot.behaviors) {
      bot.behaviors.stopAll();
      bot.modes.follow = false;
      bot.modes.autoAttack = false;
      bot.modes.patrol = false;
      bot.modes.mining = false;
    }
    res.json({ success: true, status: bot.getStatus() });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get behavior status for a specific bot
app.get('/api/bots/:id/behaviors', (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    res.json({
      modes: bot.modes,
      behaviors: bot.behaviors?.getStatus() || null
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Set restart timer for a specific bot (send /restart command)
app.post('/api/bots/:id/restart-timer', (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const { minutes } = req.body;
    const result = bot.setRestartTimer(minutes || 0);
    res.json({ success: true, restartTimer: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Send /restart command immediately
app.post('/api/bots/:id/restart-command', (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const result = bot.sendRestartCommand();
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Toggle mode for a specific bot
app.post('/api/bots/:id/mode', (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const { mode, enabled } = req.body;
    bot.setMode(mode, enabled);
    res.json({ success: true, modes: bot.modes, status: bot.getStatus() });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Set Pterodactyl panel config for a bot
app.post('/api/bots/:id/pterodactyl', (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const result = bot.setPterodactylConfig(req.body);
    res.json({ success: true, pterodactyl: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Set SFTP config for a bot
app.post('/api/bots/:id/sftp', (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const result = bot.setSftpConfig(req.body);
    res.json({ success: true, sftp: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Set file access type for a bot
app.post('/api/bots/:id/file-access-type', (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const { type } = req.body;
    const result = bot.setFileAccessType(type);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Send console command via Pterodactyl panel
app.post('/api/bots/:id/panel-command', async (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const { command } = req.body;
    const result = await bot.sendPanelCommand(command);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Manually trigger auto-OP
app.post('/api/bots/:id/auto-op', async (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    await bot.autoOpSelf();
    res.json({ success: true, message: `已尝试给 ${bot.status.username} OP权限` });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get logs for specific bot
app.get('/api/bots/:id/logs', (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    res.json({ success: true, logs: bot.getLogs() });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Clear logs for specific bot
app.delete('/api/bots/:id/logs', (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    bot.clearLogs();
    res.json({ success: true, message: '日志已清空' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Send power signal via Pterodactyl panel (start/stop/restart/kill)
app.post('/api/bots/:id/power', async (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const { signal } = req.body;
    if (!signal) {
      return res.status(400).json({ success: false, error: '缺少 signal 参数 (start/stop/restart/kill)' });
    }
    const result = await bot.sendPowerSignal(signal);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Update auto-chat config for a specific bot
app.post('/api/bots/:id/auto-chat', (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const { enabled, interval, messages } = req.body;
    const config = {};
    if (enabled !== undefined) config.enabled = enabled;
    if (interval !== undefined) config.interval = interval;
    if (messages !== undefined) config.messages = messages;

    const result = bot.updateAutoChatConfig(config);

    // 同步更新模式状态
    if (enabled !== undefined) {
      bot.setMode('autoChat', enabled);
    }

    res.json({ success: true, autoChat: result, status: bot.getStatus() });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get full config for a specific bot
app.get('/api/bots/:id/config', (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    res.json({
      success: true,
      config: {
        id: bot.id,
        name: bot.status.serverName,
        modes: bot.modes,
        autoChat: bot.autoChatConfig,
        restartTimer: bot.status.restartTimer,
        pterodactyl: bot.status.pterodactyl,
        sftp: bot.status.sftp,
        fileAccessType: bot.status.fileAccessType,
        autoOp: bot.status.autoOp
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==================== 续期 API ====================

// 获取所有续期配置
app.get('/api/renewals', (req, res) => {
  try {
    res.json(renewalService.getStatus());
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 添加续期配置
app.post('/api/renewals', (req, res) => {
  try {
    const renewal = renewalService.addRenewal(req.body);
    res.json({ success: true, renewal });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 更新续期配置
app.put('/api/renewals/:id', (req, res) => {
  try {
    const renewal = renewalService.updateRenewal(req.params.id, req.body);
    res.json({ success: true, renewal });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 删除续期配置
app.delete('/api/renewals/:id', (req, res) => {
  try {
    const success = renewalService.removeRenewal(req.params.id);
    res.json({ success });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 测试续期
app.post('/api/renewals/:id/test', async (req, res) => {
  try {
    const result = await renewalService.testRenewal(req.params.id);
    res.json({ success: true, result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 测试代理连接
app.post('/api/renewals/test-proxy', async (req, res) => {
  try {
    const { proxyUrl, testUrl } = req.body;
    const result = await renewalService.testProxy(proxyUrl, testUrl);
    res.json({ success: result.success, result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 启动续期
app.post('/api/renewals/:id/start', (req, res) => {
  try {
    const success = renewalService.startRenewal(req.params.id);
    res.json({ success });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 停止续期
app.post('/api/renewals/:id/stop', (req, res) => {
  try {
    const success = renewalService.stopRenewal(req.params.id);
    res.json({ success });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 获取续期日志
app.get('/api/renewals/logs', (req, res) => {
  try {
    res.json(renewalService.getLogs());
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 获取单个续期的日志
app.get('/api/renewals/:id/logs', (req, res) => {
  try {
    const logs = renewalService.getRenewalLogs(req.params.id);
    res.json(logs);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 清除单个续期的日志
app.delete('/api/renewals/:id/logs', (req, res) => {
  try {
    renewalService.clearRenewalLogs(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==================== 文件管理 API ====================

// 列出目录文件
app.get('/api/bots/:id/files', async (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const directory = req.query.directory || '/';
    const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

    let result;
    if (fileAccessType === 'sftp') {
      result = await bot.listFilesSftp(directory);
    } else {
      result = await bot.listFiles(directory);
    }
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 获取文件内容
app.get('/api/bots/:id/files/contents', async (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const file = req.query.file;
    if (!file) {
      return res.status(400).json({ success: false, error: '缺少 file 参数' });
    }
    const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

    let result;
    if (fileAccessType === 'sftp') {
      result = await bot.getFileContentsSftp(file);
    } else {
      result = await bot.getFileContents(file);
    }
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 写入文件内容
app.post('/api/bots/:id/files/write', express.text({ limit: '50mb' }), async (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const file = req.query.file;
    if (!file) {
      return res.status(400).json({ success: false, error: '缺少 file 参数' });
    }
    const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

    let result;
    if (fileAccessType === 'sftp') {
      result = await bot.writeFileSftp(file, req.body);
    } else {
      result = await bot.writeFile(file, req.body);
    }
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 获取下载链接 (pterodactyl) 或直接下载文件 (sftp)
app.get('/api/bots/:id/files/download', async (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const file = req.query.file;
    if (!file) {
      return res.status(400).json({ success: false, error: '缺少 file 参数' });
    }
    const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

    if (fileAccessType === 'sftp') {
      // SFTP 模式：直接返回文件内容
      const result = await bot.getFileDownloadSftp(file);
      if (!result.success) {
        return res.status(400).json(result);
      }
      // 设置下载头
      const fileName = file.split('/').pop();
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
      res.send(result.content);
    } else {
      // Pterodactyl 模式：返回下载 URL
      const result = await bot.getDownloadUrl(file);
      res.json(result);
    }
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 获取上传链接 (pterodactyl) 或返回上传端点信息 (sftp)
app.get('/api/bots/:id/files/upload', async (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

    if (fileAccessType === 'sftp') {
      // SFTP 模式：返回上传端点信息
      res.json({
        success: true,
        type: 'sftp',
        endpoint: `/api/bots/${req.params.id}/files/upload-sftp`
      });
    } else {
      const result = await bot.getUploadUrl();
      res.json(result);
    }
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// SFTP 文件上传端点
app.post('/api/bots/:id/files/upload-sftp', express.raw({ limit: '100mb', type: '*/*' }), async (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const directory = req.query.directory || '/';
    const fileName = req.query.name;
    if (!fileName) {
      return res.status(400).json({ success: false, error: '缺少 name 参数' });
    }
    const result = await bot.uploadFileSftp(directory, fileName, req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 创建文件夹
app.post('/api/bots/:id/files/folder', async (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const { root, name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: '缺少 name 参数' });
    }
    const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

    let result;
    if (fileAccessType === 'sftp') {
      result = await bot.createFolderSftp(root || '/', name);
    } else {
      result = await bot.createFolder(root || '/', name);
    }
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 删除文件
app.post('/api/bots/:id/files/delete', async (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const { root, files } = req.body;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ success: false, error: '缺少 files 参数' });
    }
    const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

    let result;
    if (fileAccessType === 'sftp') {
      result = await bot.deleteFilesSftp(root || '/', files);
    } else {
      result = await bot.deleteFiles(root || '/', files);
    }
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 重命名文件
app.post('/api/bots/:id/files/rename', async (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const { root, from, to } = req.body;
    if (!from || !to) {
      return res.status(400).json({ success: false, error: '缺少 from 或 to 参数' });
    }
    const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

    let result;
    if (fileAccessType === 'sftp') {
      result = await bot.renameFileSftp(root || '/', from, to);
    } else {
      result = await bot.renameFile(root || '/', from, to);
    }
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 复制文件
app.post('/api/bots/:id/files/copy', async (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const { location } = req.body;
    if (!location) {
      return res.status(400).json({ success: false, error: '缺少 location 参数' });
    }
    const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

    let result;
    if (fileAccessType === 'sftp') {
      result = await bot.copyFileSftp(location);
    } else {
      result = await bot.copyFile(location);
    }
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 压缩文件 (仅 pterodactyl 支持)
app.post('/api/bots/:id/files/compress', async (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const { root, files } = req.body;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ success: false, error: '缺少 files 参数' });
    }
    const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

    if (fileAccessType === 'sftp') {
      return res.status(400).json({ success: false, error: 'SFTP 模式不支持压缩功能' });
    }
    const result = await bot.compressFiles(root || '/', files);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 解压文件 (仅 pterodactyl 支持)
app.post('/api/bots/:id/files/decompress', async (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const { root, file } = req.body;
    if (!file) {
      return res.status(400).json({ success: false, error: '缺少 file 参数' });
    }
    const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

    if (fileAccessType === 'sftp') {
      return res.status(400).json({ success: false, error: 'SFTP 模式不支持解压功能' });
    }
    const result = await bot.decompressFile(root || '/', file);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Default login: admin / admin123`);
  broadcast('log', {
    type: 'info',
    icon: '🚀',
    message: `服务器已启动，端口 ${PORT}`
  });

  // 自动加载并连接保存的服务器
  try {
    const servers = configManager.getServers();
    if (servers && servers.length > 0) {
      console.log(`发现 ${servers.length} 个保存的服务器，正在自动连接...`);
      broadcast('log', {
        type: 'info',
        icon: '🔄',
        message: `正在自动连接 ${servers.length} 个服务器...`
      });

      for (const serverConfig of servers) {
        try {
          await botManager.addServer(serverConfig);
          console.log(`已连接: ${serverConfig.name || serverConfig.host}`);
        } catch (err) {
          console.error(`连接失败 ${serverConfig.host}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error('自动连接失败:', err.message);
  }
});
