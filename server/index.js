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
  res.json(botManager.getAllStatus());
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

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Default login: admin / admin123`);
  broadcast('log', {
    type: 'info',
    icon: '🚀',
    message: `服务器已启动，端口 ${PORT}`
  });
});
