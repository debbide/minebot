import express from 'express';
import axios from 'axios';
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
import { AuditService } from './services/AuditService.js';
import { SystemService } from './services/SystemService.js';
import { proxyService } from './services/ProxyService.js';
import { AgentRegistry } from './services/AgentRegistry.js';
import { AgentGateway } from './services/AgentGateway.js';

dotenv.config();

// Log masking utility to prevent sensitive data leakage
function maskSensitiveData(text) {
  if (typeof text !== 'string') return text;

  return text
    // Mask API keys
    .replace(/apiKey[=:\s]+[^\s,}]+/gi, 'apiKey=***')
    .replace(/api_key[=:\s]+[^\s,}]+/gi, 'api_key=***')
    .replace(/apikey[=:\s]+[^\s,}]+/gi, 'apikey=***')
    // Mask passwords
    .replace(/password[=:\s]+[^\s,}]+/gi, 'password=***')
    .replace(/passwd[=:\s]+[^\s,}]+/gi, 'passwd=***')
    // Mask JWT tokens and Bearer tokens
    .replace(/Bearer\s+[^\s,}]+/gi, 'Bearer ***')
    .replace(/token[=:\s]+[^\s,}]+/gi, 'token=***')
    // Mask SSH keys
    .replace(/privateKey[=:\s]+[^\s,}]+/gi, 'privateKey=***')
    .replace(/private_key[=:\s]+[^\s,}]+/gi, 'private_key=***')
    // Mask URLs with credentials
    .replace(/https?:\/\/[^:]+:[^@]+@/gi, 'https://***:***@')
    // Mask Pterodactyl URLs
    .replace(/(ptero[a-z]*url|panel[a-z]*url)[=:\s]+[^\s,}]+/gi, '$1=***');
}

// Override console methods to mask sensitive data
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = function (...args) {
  const maskedArgs = args.map(arg => maskSensitiveData(String(arg)));
  originalLog.apply(console, maskedArgs);
};

console.error = function (...args) {
  const maskedArgs = args.map(arg => maskSensitiveData(String(arg)));
  originalError.apply(console, maskedArgs);
};

console.warn = function (...args) {
  const maskedArgs = args.map(arg => maskSensitiveData(String(arg)));
  originalWarn.apply(console, maskedArgs);
};

// Capture uncaught exceptions, prevent process crash
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
const wss = new WebSocketServer({ noServer: true });

// Middleware
app.use(cors());
app.use(express.json());

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https: wss:; font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com;");
  next();
});

// Initialize services
const configManager = new ConfigManager();
const authService = new AuthService(configManager);
const aiService = new AIService(configManager);
const systemService = new SystemService();
const auditService = new AuditService();
const botManager = new BotManager(configManager, aiService, broadcast);
const agentRegistry = new AgentRegistry();
const agentGateway = new AgentGateway(agentRegistry);

const getAgentIdForBot = (bot) => {
  const agentId = bot?.status?.agentId;
  if (!agentId) return null;
  const status = agentGateway.getStatus(agentId);
  if (!status.connected) return null;
  return agentId;
};

// Initialize Proxy Service
const initializeProxy = async () => {
  const config = configManager.getFullConfig();
  if (config.proxyNodes && config.proxyNodes.length > 0) {
    await proxyService.restart(config.proxyNodes);
  }
};
initializeProxy();

// Apply auth middleware to all /api routes except auth and screenshots
// MUST be defined BEFORE API routes
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login' || req.path === '/auth/check' || req.path.startsWith('/screenshots/') || req.path.startsWith('/webhooks/')) {
    return next();
  }
  return authService.authMiddleware()(req, res, next);
});

// Health check endpoint (before all middleware, for Docker health check)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Auth routes (before auth middleware)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  // Get client IP for rate limiting
  const clientIp = req.ip || req.connection.remoteAddress || '0.0.0.0';

  // Validate credentials (now includes rate limiting)
  const result = authService.validateCredentials(username, password, clientIp);

  if (result.valid) {
    const token = authService.generateToken(username);
    // Log successful login
    auditService.loginSuccess(username, clientIp);
    return res.json({
      success: true,
      token,
      expiresIn: 86400, // 24 hours in seconds
      user: { username }
    });
  }

  // Handle rate limiting and authentication errors
  if (result.rateLimited) {
    // Log rate limited attempt
    auditService.loginFailed(username, 'rate_limited', clientIp);
    return res.status(429).json({
      error: result.message,
      code: 'RATE_LIMITED'
    });
  }

  // Log failed authentication attempt
  auditService.loginFailed(username, 'invalid_credentials', clientIp);
  res.status(401).json({
    error: result.message || 'Invalid username or password',
    code: 'INVALID_AUTH'
  });
});

app.get('/api/auth/check', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.json({ authenticated: false });
  }

  const token = authHeader.substring(7);
  const decoded = authService.verifyToken(token);

  if (decoded) {
    res.json({
      authenticated: true,
      user: { username: decoded.username }
    });
  } else {
    res.json({ authenticated: false });
  }
});

// Password management endpoints (require authentication)
app.post('/api/auth/change-password', (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'New passwords do not match' });
  }

  const clientIp = req.ip || req.connection.remoteAddress || '0.0.0.0';
  const currentUser = req.user.username;

  // Verify current password
  const verifyResult = authService.validateCredentials(currentUser, currentPassword, clientIp);
  if (!verifyResult.valid) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  // Update password
  const updateResult = authService.updateCredentials(currentUser, newPassword);
  if (!updateResult.success) {
    return res.status(400).json({ error: updateResult.message });
  }

  // Log password change
  auditService.passwordChanged(currentUser, clientIp);

  res.json({
    success: true,
    message: 'Password changed successfully. Please login again.'
  });
});

app.post('/api/auth/logout', (req, res) => {
  // JWT logout is handled on client side by removing the token
  // But we can track logout if needed
  res.json({ success: true, message: 'Logged out successfully' });
});



// Serve static files
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
app.use(express.static(join(__dirname, '../dist')));
// Serve screenshots
app.use('/api/screenshots', express.static(join(process.cwd(), 'data', 'screenshots')));

// WebSocket connections
const clients = new Set();

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/agent/ws') {
    return agentGateway.handleUpgrade(req, socket, head);
  }
  return wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

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


// API Routes

// System status (memory monitoring)
app.get('/api/system/status', (req, res) => {
  res.json(systemService.getStatus());
});

app.get('/api/system/memory', (req, res) => {
  res.json(systemService.getMemoryStatus());
});

// Proxy Management
app.get('/api/proxy/nodes', (req, res) => {
  const config = configManager.getFullConfig();
  res.json(config.proxyNodes || []);
});

app.post('/api/proxy/nodes', async (req, res) => {
  const nodes = req.body;
  if (!Array.isArray(nodes)) {
    return res.status(400).json({ error: 'Nodes must be an array' });
  }

  try {
    configManager.updateConfig({ proxyNodes: nodes });

    // Restart proxy service with new nodes
    await proxyService.restart(nodes);

    // Broadcast status change if needed (e.g. to update frontend UI node list)
    // broadcast('config_updated', { proxyNodes: nodes });

    res.json({ success: true, message: 'Proxy nodes updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/proxy/parse-link', (req, res) => {
  const { link } = req.body;
  const node = proxyService.parseProxyLink(link);
  if (node) {
    res.json(node);
  } else {
    res.status(400).json({ error: 'Failed to parse proxy link' });
  }
});

app.post('/api/proxy/sync-subscription', async (req, res) => {
  const { url } = req.body;
  try {
    const nodes = await proxyService.syncSubscription(url);
    res.json(nodes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/proxy/test/:id', async (req, res) => {
  try {
    const latency = await proxyService.testNode(req.params.id);
    res.json({ success: latency >= 0, latency });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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

// Reorder servers
app.post('/api/bots/reorder', (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, error: 'orderedIds must be an array' });
    }
    const success = configManager.reorderServers(orderedIds);
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
    if (port !== undefined) updates.port = parseInt(port); // Allow 0 for SRV/Auto
    if (req.body.proxyNodeId !== undefined) updates.proxyNodeId = req.body.proxyNodeId;
    if (req.body.autoReconnect !== undefined) updates.autoReconnect = !!req.body.autoReconnect;

    const updatedConfig = configManager.updateServer(id, updates);

    // Update in bot manager
    const bot = botManager.bots.get(id);
    if (bot) {
      if (name !== undefined) {
        bot.status.serverName = name;
        bot.config.name = name;
      }
      if (username !== undefined) {
        bot.config.username = username;
        if (!bot.status.connected) {
          bot.status.username = username;
        }
      }
      if (host !== undefined) bot.config.host = host;
      if (port !== undefined) bot.config.port = parseInt(port); // Allow 0

      // Update proxy and autoReconnect
      if (req.body.proxyNodeId !== undefined) bot.config.proxyNodeId = req.body.proxyNodeId;
      if (req.body.autoReconnect !== undefined) {
        bot.status.autoReconnect = !!req.body.autoReconnect;
        bot.config.autoReconnect = !!req.body.autoReconnect;
      }

      // 对于纯面板服务器，如果 host/port 更新了，刷新状态检查
      if ((host !== undefined || port !== undefined) && bot.refreshStatusCheck) {
        bot.refreshStatusCheck();
      }
    }

    res.json({ success: true, config: updatedConfig });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 切换服务器类型（机器人 <-> 仅面板）
app.post('/api/bots/:id/switch-type', async (req, res) => {
  try {
    const id = req.params.id;
    const { type } = req.body; // 'minecraft' or 'panel'

    if (!['minecraft', 'panel'].includes(type)) {
      return res.status(400).json({ success: false, error: '无效的类型，只能是 minecraft 或 panel' });
    }

    const bot = botManager.bots.get(id);
    if (!bot) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    const currentType = bot.status.type || 'minecraft';
    if (currentType === type) {
      return res.json({ success: true, message: '类型未改变' });
    }

    // 获取当前配置
    const serverConfig = configManager.getServer(id);
    if (!serverConfig) {
      return res.status(404).json({ success: false, error: '服务器配置不存在' });
    }

    // 断开/停止当前实例
    if (bot.disconnect) {
      bot.disconnect();
    }
    if (bot.cleanup) {
      bot.cleanup();
    }

    // 更新配置
    const updatedConfig = configManager.updateServer(id, { type });

    // 删除旧实例
    botManager.bots.delete(id);

    // 创建新实例
    const newInstance = botManager.createInstance({ ...serverConfig, ...updatedConfig, id });
    botManager.bots.set(id, newInstance);

    // 如果是面板类型，自动连接
    if (type === 'panel') {
      newInstance.connect().catch(err => {
        console.log(`切换后连接失败: ${err.message}`);
      });
    }

    res.json({ success: true, message: `已切换为 ${type === 'panel' ? '仅面板管理' : '机器人'} 模式`, type });
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

// Update behavior settings for a specific bot
app.post('/api/bots/:id/behavior-settings', (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    if (typeof bot.updateBehaviorSettings !== 'function') {
      return res.status(400).json({ success: false, error: 'Bot does not support behavior settings' });
    }
    const result = bot.updateBehaviorSettings(req.body || {});
    res.json({ success: true, behaviorSettings: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Update command settings for a specific bot
app.post('/api/bots/:id/command-settings', (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    if (typeof bot.updateCommandSettings !== 'function') {
      return res.status(400).json({ success: false, error: 'Bot does not support command settings' });
    }
    const result = bot.updateCommandSettings(req.body || {});
    res.json({ success: true, commandSettings: result });
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

// Set RCON config for a bot
app.post('/api/bots/:id/rcon', (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const result = bot.setRconConfig(req.body || {});
    res.json({ success: true, rcon: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Set agent binding for a bot
app.post('/api/bots/:id/agent-binding', (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const { agentId } = req.body || {};
    const result = bot.setAgentId(agentId || null);
    res.json({ success: true, agentId: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Test RCON connection for a bot
app.post('/api/bots/:id/rcon-test', async (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const result = await bot.testRconConnection();
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Agent registry
app.get('/api/agents', (req, res) => {
  const agents = agentRegistry.list().map(agent => ({
    agentId: agent.agentId,
    name: agent.name || agent.agentId,
    status: agentGateway.getStatus(agent.agentId)
  }));
  res.json({ success: true, agents });
});

app.post('/api/agents', (req, res) => {
  const { agentId, token, name } = req.body || {};
  if (!agentId || !token) {
    return res.status(400).json({ success: false, error: 'agentId and token required' });
  }
  const agent = agentRegistry.upsert({ agentId, token, name: name || agentId });
  res.json({ success: true, agent: { agentId: agent.agentId, name: agent.name } });
});

app.post('/api/agents/:agentId/request', async (req, res) => {
  try {
    const { action, payload, timeoutMs } = req.body || {};
    if (!action) {
      return res.status(400).json({ success: false, error: 'action required' });
    }
    const result = await agentGateway.request(req.params.agentId, action, payload || {}, timeoutMs);
    res.json({ success: true, result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/agents/:agentId/host-stats', async (req, res) => {
  try {
    const result = await agentGateway.request(req.params.agentId, 'HOST_STATS', {});
    res.json({ success: result.success !== false, data: result.data || result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/agents/:agentId/processes', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const result = await agentGateway.request(req.params.agentId, 'PROCESS_LIST', { limit });
    res.json({ success: result.success !== false, data: result.data || result });
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
    const agentId = getAgentIdForBot(bot);
    if (agentId) {
      const result = await agentGateway.request(agentId, 'COMMAND', { serverId: bot.id, command });
      const payload = result?.data || result;
      return res.json({ success: result.success !== false, message: payload?.message || result?.message || 'ok' });
    }
    const fallback = await bot.sendPanelCommand(command);
    res.json(fallback);
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
    const agentId = getAgentIdForBot(bot);
    if (agentId) {
      const actionMap = { start: 'START', stop: 'STOP', restart: 'RESTART', kill: 'KILL' };
      const action = actionMap[signal] || 'RESTART';
      const result = await agentGateway.request(agentId, action, { serverId: bot.id });
      return res.json({ success: result.success !== false, message: result.message || 'ok' });
    }
    const fallback = await bot.sendPowerSignal(signal);
    res.json(fallback);
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
        rcon: bot.status.rcon,
        sftp: bot.status.sftp,
        fileAccessType: bot.status.fileAccessType,
        autoOp: bot.status.autoOp,
        agentId: bot.status.agentId,
        behaviorSettings: bot.behaviorSettings || null,
        commandSettings: bot.commandSettings || null
      }
    });
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
    const agentId = getAgentIdForBot(bot);
    if (agentId) {
      const result = await agentGateway.request(agentId, 'LIST', { serverId: bot.id, path: directory });
      return res.json({ success: result.success !== false, files: result.data || [], directory });
    }
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
    const agentId = getAgentIdForBot(bot);
    if (agentId) {
      const result = await agentGateway.request(agentId, 'READ', { serverId: bot.id, path: file });
      return res.json({ success: result.success !== false, content: result.data?.content || '' });
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
    const agentId = getAgentIdForBot(bot);
    if (agentId) {
      const result = await agentGateway.request(agentId, 'WRITE', { serverId: bot.id, path: file, content: req.body || '' });
      return res.json({ success: result.success !== false, message: result.message || 'ok' });
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
    const agentId = getAgentIdForBot(bot);
    if (agentId) {
      const init = await agentGateway.request(agentId, 'DOWNLOAD_INIT', { serverId: bot.id, path: file });
      const downloadId = init.data?.downloadId;
      if (!downloadId) {
        return res.status(400).json({ success: false, error: init.message || '下载失败' });
      }
      const fileName = file.split('/').pop();
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

      let index = 0;
      while (true) {
        const chunk = await agentGateway.request(agentId, 'DOWNLOAD_CHUNK', { downloadId, index });
        const data = chunk.data?.data || '';
        if (data) {
          res.write(Buffer.from(data, 'base64'));
        }
        if (chunk.data?.done) break;
        index += 1;
      }
      res.end();
      return;
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
    const agentId = getAgentIdForBot(bot);
    if (agentId) {
      return res.json({
        success: true,
        type: 'agent',
        endpoint: `/api/bots/${req.params.id}/files/upload-agent`
      });
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

// Agent 文件上传端点
app.post('/api/bots/:id/files/upload-agent', express.raw({ limit: '100mb', type: '*/*' }), async (req, res) => {
  try {
    const bot = botManager.bots.get(req.params.id);
    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    const agentId = getAgentIdForBot(bot);
    if (!agentId) {
      return res.status(400).json({ success: false, error: 'Agent not connected' });
    }
    const directory = req.query.directory || '/';
    const fileName = req.query.name;
    if (!fileName) {
      return res.status(400).json({ success: false, error: '缺少 name 参数' });
    }
    const fullPath = directory === '/' ? `/${fileName}` : `${directory}/${fileName}`;
    const size = req.body?.length || 0;
    const init = await agentGateway.request(agentId, 'UPLOAD_INIT', { serverId: bot.id, path: fullPath, size });
    const uploadId = init.data?.uploadId;
    if (!uploadId) {
      return res.status(400).json({ success: false, error: init.message || '上传失败' });
    }
    const chunkSize = 256 * 1024;
    let index = 0;
    for (let offset = 0; offset < size; offset += chunkSize) {
      const slice = req.body.slice(offset, offset + chunkSize);
      await agentGateway.request(agentId, 'UPLOAD_CHUNK', {
        uploadId,
        index,
        data: slice.toString('base64')
      });
      index += 1;
    }
    await agentGateway.request(agentId, 'UPLOAD_FINISH', { uploadId });
    res.json({ success: true, message: '上传成功' });
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
    const agentId = getAgentIdForBot(bot);
    if (agentId) {
      const result = await agentGateway.request(agentId, 'MKDIR', { serverId: bot.id, root: root || '/', name });
      return res.json({ success: result.success !== false, message: result.message || 'ok' });
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
    const agentId = getAgentIdForBot(bot);
    if (agentId) {
      const result = await agentGateway.request(agentId, 'DELETE', { serverId: bot.id, root: root || '/', files });
      return res.json({ success: result.success !== false, message: result.message || 'ok' });
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
    const agentId = getAgentIdForBot(bot);
    if (agentId) {
      const result = await agentGateway.request(agentId, 'RENAME', { serverId: bot.id, root: root || '/', from, to });
      return res.json({ success: result.success !== false, message: result.message || 'ok' });
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
    const agentId = getAgentIdForBot(bot);
    if (agentId) {
      const result = await agentGateway.request(agentId, 'COPY', { serverId: bot.id, location });
      return res.json({ success: result.success !== false, message: result.message || 'ok' });
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
    const agentId = getAgentIdForBot(bot);
    if (agentId) {
      const result = await agentGateway.request(agentId, 'COMPRESS', { serverId: bot.id, root: root || '/', files });
      return res.json({ success: result.success !== false, archive: result.data?.archive, message: result.message || 'ok' });
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
    const agentId = getAgentIdForBot(bot);
    if (agentId) {
      const result = await agentGateway.request(agentId, 'DECOMPRESS', { serverId: bot.id, root: root || '/', file });
      return res.json({ success: result.success !== false, message: result.message || 'ok' });
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


// Telegram Config Endpoints
app.get('/api/config/telegram', (req, res) => {
  const config = configManager.getConfig().telegram || {};
  res.json(config);
});

app.post('/api/config/telegram', (req, res) => {
  try {
    const { enabled, botToken, chatId } = req.body;
    const currentConfig = configManager.getFullConfig();
    const currentTelegram = currentConfig.telegram || {};

    const newTelegram = {
      enabled: enabled !== undefined ? enabled : currentTelegram.enabled,
      chatId: chatId !== undefined ? chatId : currentTelegram.chatId,
      botToken: (botToken && botToken !== '***') ? botToken : currentTelegram.botToken
    };

    configManager.updateConfig({ telegram: newTelegram });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../dist/index.html'));
});

// Webhook endpoint for auto power-on
app.post('/api/webhooks/trigger', async (req, res) => {
  try {
    const body = req.body;
    // 将整个 body 转为小写字符串以便匹配
    const content = JSON.stringify(body).toLowerCase();

    console.log('[Webhook] Received trigger:', content.substring(0, 200) + '...');

    // 广播到前端日志，方便用户调试
    broadcast('log', {
      type: 'info',
      icon: '🔔',
      message: `收到 Webhook: ${content.substring(0, 50)}...`,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false })
    });

    const matchedBots = [];

    // 遍历所有机器人实例
    for (const [id, bot] of botManager.bots) {
      // 获取服务器名称（优先用配置名，没有则用默认名）
      const serverName = (bot.config.name || bot.status.serverName || '').toLowerCase();

      // 如果服务器名字有效且出现在 webhook 内容中
      if (serverName && content.includes(serverName)) {
        // 检查是否有面板配置
        if (bot.status.pterodactyl?.url && bot.status.pterodactyl?.apiKey) {
          const msg = `Webhook 匹配到服务器: ${bot.config.name}，正在执行开机...`;
          console.log(`[Webhook] ${msg}`);
          broadcast('log', { type: 'success', icon: '⚡', message: msg, timestamp: new Date().toLocaleTimeString() });

          // 为了不阻塞响应，异步执行开机
          bot.sendPowerSignal('start')
            .then(async () => {
              // 成功开机后，发送 Telegram 通知
              const tgConfig = configManager.getFullConfig().telegram || {};
              const { enabled, botToken, chatId } = tgConfig;

              const finalToken = enabled && botToken ? botToken : process.env.TG_BOT_TOKEN;
              const finalChatId = enabled && chatId ? chatId : process.env.TG_CHAT_ID;

              if (finalToken && finalChatId) {
                try {
                  const message = `⚡电源信号已发送: [${bot.config.name}] 开机成功`;
                  await axios.post(`https://api.telegram.org/bot${finalToken}/sendMessage`, {
                    chat_id: finalChatId,
                    text: message
                  });
                  console.log(`[Telegram]这里是TG消息通知推送日志 Notification sent for ${serverName}`);
                } catch (tgError) {
                  console.error('[Telegram] Failed to send notification:', tgError.message);
                }
              }
            })
            .catch(e => {
              console.error(`[Webhook] Failed to start ${serverName}:`, e.message);
              broadcast('log', { type: 'error', icon: '❌', message: `开机失败: ${e.message}`, timestamp: new Date().toLocaleTimeString() });
            });

          matchedBots.push(serverName);
        } else {
          const msg = `Webhook 匹配到 ${bot.config.name} 但未配置翼龙面板信息`;
          console.log(`[Webhook] ${msg}`);
          broadcast('log', { type: 'warning', icon: '⚠️', message: msg, timestamp: new Date().toLocaleTimeString() });
        }
      }
    }

    if (matchedBots.length > 0) {
      res.json({ success: true, message: `Triggered start for: ${matchedBots.join(', ')}`, matched: matchedBots });
    } else {
      res.json({ success: false, message: 'No matching server found with panel config' });
    }
  } catch (error) {
    console.error('[Webhook] Error:', error);
    // 广播错误以便用户知道请求失败了
    broadcast('log', {
      type: 'error',
      icon: '💥',
      message: `Webhook 处理出错: ${error.message}`,
      timestamp: new Date().toLocaleTimeString()
    });
    res.status(500).json({ error: error.message });
  }
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

  // 服务器连接由 BotPool.loadSavedServers() 自动处理
  // 这里只做日志提示
  const servers = configManager.getServers();
  if (servers && servers.length > 0) {
    console.log(`发现 ${servers.length} 个保存的服务器，正在后台自动连接...`);
    broadcast('log', {
      type: 'info',
      icon: '🔄',
      message: `正在后台自动连接 ${servers.length} 个服务器...`
    });
  }
});
