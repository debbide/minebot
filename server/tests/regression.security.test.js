import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

import { AuthService } from '../services/AuthService.js';
import { AIService } from '../services/AIService.js';
import { ConfigManager } from '../services/ConfigManager.js';
import { BotPool } from '../bot/BotPool.js';
import { BotInstance } from '../bot/BotInstance.js';
import { PanelInstance } from '../bot/PanelInstance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');

function createConfigManager(initial = {}) {
  const state = { ...initial };
  return {
    getFullConfig() {
      return state;
    },
    getConfig() {
      // 模拟对外打码：apiKey 永远是 ***
      return {
        ...state,
        ai: { ...(state.ai || {}), apiKey: state.ai?.apiKey ? '***' : '' }
      };
    },
    updateConfig(next) {
      Object.assign(state, next);
      return state;
    }
  };
}

// ---------------------------------------------------------------------------
// broadcastStatus 崩溃回归：disconnect / disconnectAll 必须广播且不抛错
// ---------------------------------------------------------------------------
test('regression: BotPool disconnect/disconnectAll broadcast without throwing', () => {
  const pool = Object.create(BotPool.prototype);
  pool.bots = new Map();
  const broadcasts = [];
  pool.broadcast = (type, data) => broadcasts.push([type, data]);

  const makeBot = (id) => ({
    disconnected: false,
    status: { connected: false, serverAddress: '', version: '', health: 0, food: 0, position: null, players: [] },
    disconnect() { this.disconnected = true; },
    getStatus() { return { id, connected: false }; }
  });
  const b1 = makeBot('s1');
  const b2 = makeBot('s2');
  pool.bots.set('s1', b1);
  pool.bots.set('s2', b2);

  assert.doesNotThrow(() => pool.disconnect('s1'));
  assert.equal(b1.disconnected, true);

  // 旧代码在第一个 bot 后就抛错，其余 bot 根本断不开
  assert.doesNotThrow(() => pool.disconnectAll());
  assert.equal(b2.disconnected, true);
  assert.ok(broadcasts.some(([t]) => t === 'bot_update'));
});

// ---------------------------------------------------------------------------
// 改密后旧 token 失效 + 退出吊销
// ---------------------------------------------------------------------------
test('regression: password change invalidates old tokens; revokeToken works', () => {
  const authService = new AuthService(createConfigManager({}));
  authService.updateCredentials('admin', 'StrongPass1!');

  const token = authService.generateToken('admin');
  assert.equal(authService.verifyToken(token)?.username, 'admin');

  // 改密后旧 token 必须失效（密码指纹对不上）
  authService.updateCredentials('admin', 'AnotherPass2!');
  assert.equal(authService.verifyToken(token), null);

  // 新密码登录的 token 可用，吊销后立即失效
  assert.equal(authService.validateCredentials('admin', 'AnotherPass2!', '127.0.0.1').valid, true);
  const token2 = authService.generateToken('admin');
  assert.ok(authService.verifyToken(token2));
  authService.revokeToken(token2);
  assert.equal(authService.verifyToken(token2), null);

  // 乱签的 token 不能用
  const forged = jwt.sign({ username: 'admin' }, 'some-wrong-secret');
  assert.equal(authService.verifyToken(forged), null);
});

// ---------------------------------------------------------------------------
// 设置页 AI Key：内部服务必须拿到未打码的真实 key
// ---------------------------------------------------------------------------
test('regression: AIService uses real API key, not masked ***', () => {
  const configManager = createConfigManager({
    ai: { apiKey: 'sk-real-key-for-test', baseURL: '', model: 'gpt-3.5-turbo', systemPrompt: 'x' }
  });
  const service = new AIService(configManager);
  assert.ok(service.openai, 'OpenAI client should be initialized');
  assert.equal(service.openai.apiKey, 'sk-real-key-for-test');
});

// ---------------------------------------------------------------------------
// 配置主密钥：保存后 config.json 里不许出现 masterKey
// ---------------------------------------------------------------------------
test('regression: saved config.json never contains masterKey', () => {
  const manager = new ConfigManager();
  manager.updateConfig({ ai: { ...(manager.getFullConfig().ai || {}), apiKey: 'sk-x' } });

  const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'config.json'), 'utf-8'));
  assert.equal(raw.encrypted, true);
  assert.equal('masterKey' in raw, false);
  assert.ok(fs.existsSync(path.join(DATA_DIR, 'master.key')));
});

// ---------------------------------------------------------------------------
// SFTP basePath 钳制：../ 与绝对路径不许逃出去
// ---------------------------------------------------------------------------
test('regression: SFTP paths are jailed under basePath', () => {
  const inst = new PanelInstance(
    't',
    { name: 'T', sftp: { basePath: '/srv/mc' } },
    () => {},
    () => {},
    null
  );
  assert.equal(inst.getSftpFullPath('plugins'), '/srv/mc/plugins');
  assert.equal(inst.getSftpFullPath('/plugins'), '/srv/mc/plugins');
  assert.equal(inst.getSftpFullPath('../../etc'), '/srv/mc');
  assert.equal(inst.getSftpFullPath('/etc/passwd'), '/srv/mc/etc/passwd');
});

// ---------------------------------------------------------------------------
// 删除后面板实例迟到轮询不得再广播（删卡复活回归）
// ---------------------------------------------------------------------------
test('regression: PanelInstance fetchServerStatus after disconnect stays silent', async () => {
  let statusCalls = 0;
  const inst = new PanelInstance(
    't',
    { name: 'T', pterodactyl: { url: 'http://127.0.0.1:1', serverId: 'x', apiKey: 'k' } },
    () => {},
    () => { statusCalls += 1; },
    null
  );
  inst.disconnect();
  const afterDisconnect = statusCalls;
  const result = await inst.fetchServerStatus();
  assert.equal(result, undefined);
  assert.equal(statusCalls, afterDisconnect);
});

// ---------------------------------------------------------------------------
// 连接在登录前失败时，connect() 必须结算而不是永久挂起
// ---------------------------------------------------------------------------
test('regression: BotInstance connect() rejects when connection fails pre-login', { timeout: 20000 }, async () => {
  const inst = new BotInstance(
    'srv_hang',
    { name: 'Hang', host: '127.0.0.1', port: 1, username: 'BotX', autoReconnect: false, version: '1.20.1' },
    null,
    () => {},
    () => {},
    null
  );
  await assert.rejects(inst.connect());
  inst.disconnect();
});

// ---------------------------------------------------------------------------
// 防溺水监控：启动后有 interval，cleanup 后清干净
// ---------------------------------------------------------------------------
test('regression: water rescue monitor starts and is cleaned up', () => {
  const inst = new BotInstance(
    'srv_water',
    { name: 'Water', host: '127.0.0.1', port: 25565, username: 'BotW', autoReconnect: false },
    null,
    () => {},
    () => {},
    null
  );
  inst.startWaterRescueMonitor();
  assert.ok(inst.waterRescueInterval);
  inst.cleanup();
  assert.equal(inst.waterRescueInterval, null);
});

// ---------------------------------------------------------------------------
// Webhook 源码防线：只有 trigger 接口免 JWT，且处理前必须校验密钥
// （handler 未导出，这里锁住路由层的不变量）
// ---------------------------------------------------------------------------
test('regression: webhook trigger requires secret and only trigger is auth-exempt', () => {
  const source = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf-8');
  assert.match(source, /req\.method === 'POST' && req\.path === '\/webhooks\/trigger'/);
  assert.match(source, /if \(!hasValidWebhookSecret\(req\)\)/);
  assert.ok(!source.includes("req.path.startsWith('/webhooks/')"), 'webhook prefix must not be blanket-exempt');
});
