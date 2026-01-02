import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

import { BotManager } from './bot/BotManager.js';
import { AIService } from './services/AIService.js';
import { ConfigManager } from './services/ConfigManager.js';
import { AuthService } from './services/AuthService.js';

dotenv.config();

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
