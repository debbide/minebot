import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { spawn, execSync } from 'child_process';
import { createWriteStream, createReadStream, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, chmodSync, readdirSync, statSync, renameSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { get as httpsGet } from 'https';
import { get as httpGet } from 'http';
import { createServer as createNetServer } from 'net';
import { randomUUID } from 'crypto';
import { createGunzip, inflateRaw } from 'zlib';
import mineflayer from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
const { pathfinder, Movements, goals } = pathfinderPkg;
import pkg from 'ssh2-sftp-client';
const SftpClient = pkg;

import { Telegraf } from 'telegraf';
import Database from 'better-sqlite3';
import cron from 'node-cron';
import QRCode from 'qrcode';
import translate from 'google-translate-api-x';

import { Client, MessageEmbed } from 'discord.js-selfbot-v13';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const BIN_DIR = join(DATA_DIR, 'bin');
const CONFIG_FILE = join(DATA_DIR, 'config.json');
const FILE_MAP_FILE = join(DATA_DIR, 'filemap.dat');
const CERT_FILE = join(DATA_DIR, 'cert.pem');
const KEY_FILE = join(DATA_DIR, 'key.pem');

const _noop = () => {};
console.log = _noop;
console.info = _noop;
console.warn = _noop;
console.debug = _noop;
console.error = _noop;
process.stdout.write = _noop;
process.stderr.write = _noop;

process.on('uncaughtException', _noop);
process.on('unhandledRejection', _noop);

const generateRandomName = (length = 12) => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const XOR_KEY = 'minebot-toolbox-xor-key-2024';
const xorEncrypt = (text) => {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
  }
  return Buffer.from(result).toString('base64');
};

const xorDecrypt = (encoded) => {
  try {
    const text = Buffer.from(encoded, 'base64').toString();
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
    }
    return result;
  } catch { return ''; }
};

let fileMap = {};
const loadFileMap = () => {
  try {
    if (existsSync(FILE_MAP_FILE)) {
      const encoded = readFileSync(FILE_MAP_FILE, 'utf-8');
      fileMap = JSON.parse(xorDecrypt(encoded));
    }
  } catch { fileMap = {}; }
};

const saveFileMap = () => {
  const encoded = xorEncrypt(JSON.stringify(fileMap));
  writeFileSync(FILE_MAP_FILE, encoded);
};

const getRandomFileName = (originalName, type = 'bin') => {
  const key = `${type}:${originalName}`;
  if (!fileMap[key]) {
    fileMap[key] = generateRandomName();
    saveFileMap();
  }
  return fileMap[key];
};

const clearRandomFileName = (originalName, type = 'bin') => {
  const key = `${type}:${originalName}`;
  if (fileMap[key]) {
    delete fileMap[key];
    saveFileMap();
  }
};

const ensureCert = () => {
  if (existsSync(CERT_FILE) && existsSync(KEY_FILE)) return;

  log('tool', 'info', '正在生成自签名证书...');
  try {
    const cmd = `openssl req -x509 -newkey rsa:2048 -keyout "${KEY_FILE}" -out "${CERT_FILE}" -sha256 -days 3650 -nodes -subj "/CN=minebot-toolbox"`;
    try {
      execSync(cmd);
    } catch {
      execSync(`wsl ${cmd}`);
    }
    log('tool', 'success', '自签名证书生成成功');
  } catch (err) {
    log('tool', 'error', `生成证书失败: ${err.message}`);
  }
};

const writeEncryptedConfig = (filePath, content) => {
  const encrypted = xorEncrypt(typeof content === 'string' ? content : JSON.stringify(content));
  writeFileSync(filePath, encrypted);
};

const readEncryptedConfig = (filePath) => {
  try {
    const encrypted = readFileSync(filePath, 'utf-8');
    return xorDecrypt(encrypted);
  } catch { return null; }
};

loadFileMap();

[DATA_DIR, BIN_DIR].forEach(dir => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
});

const _d = (e) => Buffer.from(e, 'base64').toString();
const _CK = {
  t0: _d('Y2xvdWRmbGFyZWQ='),
  t1: _d('eHJheQ=='),
  t2: _d('bmV6aGE='),
  t3: _d('a29tYXJp'),
  p0: _d('dmxlc3M='),
  p1: _d('dm1lc3M='),
  p2: _d('dHJvamFu'),
  p3: _d('c2hhZG93c29ja3M='),
  p4: _d('aHlzdGVyaWEy'),
  p5: _d('dHVpYw==')
};
const _DL = {
  cf: _d('aHR0cHM6Ly9naXRodWIuY29tL2Nsb3VkZmxhcmUvY2xvdWRmbGFyZWQvcmVsZWFzZXMvbGF0ZXN0L2Rvd25sb2FkL2Nsb3VkZmxhcmVkLWxpbnV4LQ=='),
  xr: _d('aHR0cHM6Ly9naXRodWIuY29tL1hUTFMvWHJheS1jb3JlL3JlbGVhc2VzL2xhdGVzdC9kb3dubG9hZC9YcmF5LWxpbnV4LQ=='),
  hy: _d('aHR0cHM6Ly9naXRodWIuY29tL2FwZXJuZXQvaHlzdGVyaWEvcmVsZWFzZXMvbGF0ZXN0L2Rvd25sb2FkL2h5c3RlcmlhLWxpbnV4LQ=='),
  tu: _d('aHR0cHM6Ly9naXRodWIuY29tL0VBaW1UWS90dWljL3JlbGVhc2VzL2Rvd25sb2FkL3R1aWMtc2VydmVyLQ=='),
  nz0: _d('aHR0cHM6Ly9naXRodWIuY29tL25haWJhL25lemhhL3JlbGVhc2VzL2xhdGVzdC9kb3dubG9hZC9uZXpoYS1hZ2VudF9saW51eF8='),
  nz1: _d('aHR0cHM6Ly9naXRodWIuY29tL25lemhhaHEvYWdlbnQvcmVsZWFzZXMvbGF0ZXN0L2Rvd25sb2FkL25lemhhLWFnZW50X2xpbnV4Xw=='),
  km: _d('aHR0cHM6Ly9naXRodWIuY29tL2tvbWFyaS1tb25pdG9yL2tvbWFyaS1hZ2VudC9yZWxlYXNlcy9sYXRlc3QvZG93bmxvYWQva29tYXJpLWFnZW50X2xpbnV4Xw==')
};
const _PN = {
  _0: _d('dmxlc3M='),
  _1: _d('dm1lc3M='),
  _2: _d('dHJvamFu'),
  _3: _d('c2hhZG93c29ja3M='),
  _4: _d('aHlzdGVyaWEy'),
  _5: _d('dHVpYw=='),
  _6: _d('ZnJlZWRvbQ=='),
  _7: _d('YmxhY2tob2xl'),
  _8: _d('c3M=')
};
const _DP = { _0: '/p0', _1: '/p1', _2: '/p2', _3: '/p3' };
const _LID = { S0: _CK.t0, S1: _CK.t1, S2: _CK.t2, S3: _CK.t3, S4: _CK.p4, S5: _CK.p5 };
const _UI = {
  t0: _d('Q2xvdWRmbGFyZSBUdW5uZWw='),
  t1: _d('WHJheSDku6PnkIY='),
  t2: _d('5ZOq5ZCy5o6i6ZKI'),
  t3: _d('S29tYXJp5o6i6ZKI'),
  p0: _d('VkxFU1M='),
  p1: _d('Vk1lc3M='),
  p2: _d('VHJvamFu'),
  p3: _d('U1M='),
  p4: _d('SHlzdGVyaWEy'),
  p5: _d('VFVJQ0=='),
  u1i: _d('5a6J6KOFIEh5c3RlcmlhMg=='),
  u2i: _d('5a6J6KOFIFRVSUM='),
  u1ok: _d('SFky5bey5a6J6KOF'),
  u2ok: _d('VFVJQ+W3suWuieijhQ==')
};

const defaultConfig = {
  port: process.env.PORT || 3000,
  auth: { username: 'admin', password: 'admin123' },
  servers: [],
  logs: {
    enabled: false,
    maxLines: 500,
    logTools: true,
    logBots: true,
    logApi: false
  },
  tools: {
    [_CK.t0]: { enabled: false, mode: 'fixed', token: '', protocol: 'http', localPort: 3000 },
    [_CK.t1]: {
      enabled: false,
      mode: 'auto',
      port: 8001,
      uuid: '',
      password: '',
      ssMethod: 'aes-256-gcm',
      useCF: true,
      protocols: {
        [_CK.p0]: { enabled: true, wsPath: _DP._0 },
        [_CK.p1]: { enabled: false, wsPath: _DP._1 },
        [_CK.p2]: { enabled: false, wsPath: _DP._2 },
        [_CK.p3]: { enabled: false, wsPath: _DP._3 }
      },
      [_CK.p4]: { enabled: false, port: 0 },
      [_CK.p5]: { enabled: false, port: 0 },
      config: ''
    },
    [_CK.t2]: {
      enabled: false,
      version: 'v1',
      server: '',
      key: '',
      tls: true,
      insecure: false,
      gpu: false,
      temperature: false,
      useIPv6: false,
      disableAutoUpdate: true,
      disableCommandExecute: false
    },
    [_CK.t3]: {
      enabled: false,
      server: '',
      key: '',
      insecure: false,
      gpu: false,
      disableAutoUpdate: true
    }
  },
  tgbot: {
    enabled: false,
    token: '',
    apiBase: '',
    adminId: '',
    openai: {
      apiBase: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-3.5-turbo'
    },
    features: {
      translate: true,
      qrcode: true,
      shorten: true,
      remind: true,
      note: true,
      rss: true,
      weather: true,
      rate: true,
      chat: true
    },
    rss: {
      checkInterval: 30
    }
  },
  discord: {
    enabled: false,
    mode: 'bot',
    token: '',
    prefix: '>',
    openai: {
      apiBase: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-3.5-turbo'
    },
    features: {
      translate: true,
      qrcode: true,
      shorten: true,
      weather: true,
      rate: true,
      chat: true
    }
  },
  automation: {
    webhookToken: '',
    tasks: []
  }
};

let config = existsSync(CONFIG_FILE)
  ? JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
  : defaultConfig;

config = { ...defaultConfig, ...config, tools: { ...defaultConfig.tools, ...config.tools }, logs: { ...defaultConfig.logs, ...config.logs }, tgbot: { ...defaultConfig.tgbot, ...(config.tgbot || {}) }, discord: { ...defaultConfig.discord, ...(config.discord || {}) } };

if (config.tools[_CK.t1]) {
  config.tools[_CK.t1] = {
    ...defaultConfig.tools[_CK.t1],
    ...config.tools[_CK.t1],
    protocols: { ...defaultConfig.tools[_CK.t1].protocols, ...(config.tools[_CK.t1].protocols || {}) },
    [_CK.p4]: { ...defaultConfig.tools[_CK.t1][_CK.p4], ...(config.tools[_CK.t1][_CK.p4] || {}) },
    [_CK.p5]: { ...defaultConfig.tools[_CK.t1][_CK.p5], ...(config.tools[_CK.t1][_CK.p5] || {}) }
  };
}

if (config.tgbot) {
  config.tgbot = {
    ...defaultConfig.tgbot,
    ...config.tgbot,
    openai: { ...defaultConfig.tgbot.openai, ...(config.tgbot.openai || {}) },
    features: { ...defaultConfig.tgbot.features, ...(config.tgbot.features || {}) },
    rss: { ...defaultConfig.tgbot.rss, ...(config.tgbot.rss || {}) }
  };
}

if (config.discord) {
  config.discord = {
    ...defaultConfig.discord,
    ...config.discord,
    openai: { ...defaultConfig.discord.openai, ...(config.discord.openai || {}) },
    features: { ...defaultConfig.discord.features, ...(config.discord.features || {}) }
  };
}

if (!config.automation) config.automation = { webhookToken: '', tasks: [] };
if (!config.automation.webhookToken) config.automation.webhookToken = randomUUID();

const saveConfig = () => writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

const logBuffer = [];
const log = (category, level, message) => {
  if (!config.logs.enabled) return;

  if (category === 'tool' && !config.logs.logTools) return;
  if (category === 'bot' && !config.logs.logBots) return;
  if (category === 'api' && !config.logs.logApi) return;

  const entry = {
    time: new Date().toISOString(),
    category,
    level,
    message
  };

  logBuffer.push(entry);

  while (logBuffer.length > config.logs.maxLines) {
    logBuffer.shift();
  }
};

const getLogs = (category = null, limit = 100) => {
  let logs = [...logBuffer];
  if (category) {
    logs = logs.filter(l => l.category === category);
  }
  return logs.slice(-limit);
};

const clearLogs = () => {
  logBuffer.length = 0;
};

const JWT_SECRET = 'minebot-toolbox-secret-' + Date.now();
const createToken = (username) => {
  const payload = { username, exp: Date.now() + 86400000 };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
};
const verifyToken = (token) => {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch { return null; }
};

const getArch = () => ({
  platform: process.platform,
  arch: process.arch,
  archName: process.arch === 'x64' ? 'amd64' : process.arch === 'arm64' ? 'arm64' : process.arch,
  isLinux: process.platform === 'linux'
});

const findAvailablePort = (startPort = 10000, endPort = 65535) => {
  return new Promise((resolve) => {
    const tryPort = (port) => {
      if (port > endPort) {
        resolve(0);
        return;
      }
      const server = createNetServer();
      server.listen(port, '0.0.0.0', () => {
        server.close(() => resolve(port));
      });
      server.on('error', () => tryPort(port + 1));
    };
    tryPort(startPort);
  });
};

const genS1Cfg = (cfg) => {
  const { port, uuid, password, ssMethod, protocols } = cfg;

  const outbounds = [
    { protocol: _PN._6, tag: 'direct' },
    { protocol: _PN._7, tag: 'block' }
  ];

  const inbounds = [];

  if (protocols[_CK.p0]?.enabled) {
    inbounds.push({
      port: port,
      listen: '0.0.0.0',
      protocol: _PN._0,
      tag: _PN._0 + '-in',
      settings: {
        clients: [{ id: uuid, flow: '' }],
        decryption: 'none'
      },
      streamSettings: {
        network: 'ws',
        wsSettings: { path: protocols[_CK.p0].wsPath || _DP._0 }
      }
    });
  }

  if (protocols[_CK.p1]?.enabled) {
    inbounds.push({
      port: port,
      listen: '0.0.0.0',
      protocol: _PN._1,
      tag: _PN._1 + '-in',
      settings: {
        clients: [{ id: uuid, alterId: 0 }]
      },
      streamSettings: {
        network: 'ws',
        wsSettings: { path: protocols[_CK.p1].wsPath || _DP._1 }
      }
    });
  }

  if (protocols[_CK.p2]?.enabled) {
    inbounds.push({
      port: port,
      listen: '0.0.0.0',
      protocol: _PN._2,
      tag: _PN._2 + '-in',
      settings: {
        clients: [{ password: password }]
      },
      streamSettings: {
        network: 'ws',
        wsSettings: { path: protocols[_CK.p2].wsPath || _DP._2 }
      }
    });
  }

  if (protocols[_CK.p3]?.enabled) {
    inbounds.push({
      port: port,
      listen: '0.0.0.0',
      protocol: _PN._3,
      tag: _PN._8 + '-in',
      settings: {
        method: ssMethod || 'aes-256-gcm',
        password: password,
        network: 'tcp,udp'
      },
      streamSettings: {
        network: 'ws',
        wsSettings: { path: protocols[_CK.p3].wsPath || _DP._3 }
      }
    });
  }

  if (inbounds.length === 0) {
    throw new Error('请至少启用一个协议');
  }

  return {
    log: { loglevel: 'warning' },
    inbounds: inbounds,
    outbounds: outbounds
  };
};

const genShareLinks = (cfg, host = 'your-domain.com') => {
  const { port, uuid, password, ssMethod, protocols } = cfg;
  const u1 = cfg[_CK.p4];
  const tu = cfg[_CK.p5];
  const links = [];

  if (!protocols) return links;

  let finalHost = config.tools[_CK.t0]?.tunnelUrl || host;

  if (protocols[_CK.p0]?.enabled) {
    const wsPath = protocols[_CK.p0].wsPath || _DP._0;
    links.push({
      name: _d('UDA='),
      protocol: _PN._0,
      link: `${_PN._0}://${uuid}@${finalHost}:443?type=ws&path=${encodeURIComponent(wsPath)}&security=tls&sni=${finalHost}#P0-WS-TLS`
    });
  }

  if (protocols[_CK.p1]?.enabled) {
    const wsPath = protocols[_CK.p1].wsPath || _DP._1;
    const p1Cfg = {
      v: '2', ps: _d('UDEtV1MtVExT'), add: finalHost, port: 443,
      id: uuid, aid: 0, net: 'ws', type: 'none',
      host: finalHost, path: wsPath, tls: 'tls', sni: finalHost
    };
    links.push({
      name: _d('UDE='),
      protocol: _PN._1,
      link: _PN._1 + '://' + Buffer.from(JSON.stringify(p1Cfg)).toString('base64')
    });
  }

  if (protocols[_CK.p2]?.enabled) {
    const wsPath = protocols[_CK.p2].wsPath || _DP._2;
    links.push({
      name: _d('UDI='),
      protocol: _PN._2,
      link: `${_PN._2}://${password}@${finalHost}:443?type=ws&path=${encodeURIComponent(wsPath)}&security=tls&sni=${finalHost}#P2-WS-TLS`
    });
  }

  if (protocols[_CK.p3]?.enabled) {
    const method = ssMethod || 'aes-256-gcm';
    const ssAuth = Buffer.from(`${method}:${password}`).toString('base64');
    links.push({
      name: _d('UDM='),
      protocol: _PN._8,
      link: `${_PN._8}://${ssAuth}@${finalHost}:443?type=ws&path=${encodeURIComponent(protocols[_CK.p3].wsPath || _DP._3)}&security=tls&sni=${finalHost}#P3-WS`
    });
  }

  if (u1?.enabled) {
    links.push({
      name: _d('VTE='),
      protocol: _PN._4,
      link: `${_PN._4}://${password}@${finalHost}:${u1.port || 20000}/?insecure=1&sni=${finalHost}#U1`
    });
  }

  if (tu?.enabled) {
    links.push({
      name: _d('VTI='),
      protocol: _PN._5,
      link: `${_PN._5}://${uuid}:${password}@${finalHost}:${tu.port || 30000}/?congestion_control=bbr&alpn=h3&sni=${finalHost}#U2`
    });
  }

  return links;
};

const genU1Cfg = (cfg) => {
  const { port, password } = cfg;
  return {
    listen: `:${port}`,
    tls: {
      cert: CERT_FILE,
      key: KEY_FILE
    },
    auth: {
      type: 'password',
      password: password
    },
    masquerade: {
      type: 'proxy',
      proxy: { url: 'https://www.bing.com' }
    }
  };
};

const genU2Cfg = (cfg) => {
  const { port, uuid, password } = cfg;
  return {
    server: `[::]:${port}`,
    users: { [uuid]: password },
    certificate: CERT_FILE,
    private_key: KEY_FILE,
    congestion_control: 'bbr',
    alpn: ['h3', 'spdy/3.1'],
    zero_rtt_handshake: false,
    auth_timeout: '3s',
    max_idle_time: '10s',
    max_external_packet_size: 1500,
    gc_interval: '3s',
    gc_lifetime: '15s'
  };
};

const toolProcesses = new Map();

const startToolProcess = (name, cmd, args, env = {}, onLog = null) => {
  if (toolProcesses.has(name)) return;
  const safeArgs = args.map(a => a.length > 50 ? a.slice(0, 10) + '...' : a);
  const msg = `启动: ${cmd} ${safeArgs.join(' ')}`;
  log('tool', 'info', `[${name}] ${msg}`);

  const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  proc.stdout?.on('data', d => {
    const text = d.toString().trim();
    log('tool', 'info', `[${name}] ${text}`);
    if (onLog) onLog(text, false);
  });
  proc.stderr?.on('data', d => {
    const text = d.toString().trim();
    log('tool', 'error', `[${name}] ${text}`);
    if (onLog) onLog(text, true);
  });
  proc.on('exit', code => {
    const exitMsg = `退出 (${code})`;
    log('tool', 'info', `[${name}] ${exitMsg}`);
    toolProcesses.delete(name);
  });
  toolProcesses.set(name, proc);
};

const stopToolProcess = (name) => {
  const proc = toolProcesses.get(name);
  if (proc) {
    proc.kill('SIGTERM');
    toolProcesses.delete(name);
    log('tool', 'info', `[${name}] 已停止`);
  }
};

const download = (url, dest) => new Promise((resolve, reject) => {
  log('tool', 'info', `下载: ${url}`);

  const destDir = dirname(dest);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  const doRequest = (url, redirectCount = 0) => {
    if (redirectCount > 10) {
      reject(new Error('重定向次数过多'));
      return;
    }

    const getter = url.startsWith('https') ? httpsGet : httpGet;
    getter(url, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const location = res.headers.location;
        if (location) {
          const nextUrl = location.startsWith('http') ? location : new URL(location, url).href;
          doRequest(nextUrl, redirectCount + 1);
          return;
        }
      }

      if (res.statusCode !== 200) {
        reject(new Error(`下载失败: HTTP ${res.statusCode}`));
        return;
      }

      const file = createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', err => { rmSync(dest, { force: true }); reject(err); });
    }).on('error', err => { rmSync(dest, { force: true }); reject(err); });
  };

  doRequest(url);
});

const gunzipFile = (src, dest) => new Promise((resolve, reject) => {
  const gunzip = createGunzip();
  const source = createReadStream(src);
  const destination = createWriteStream(dest);

  source.pipe(gunzip).pipe(destination);
  destination.on('finish', () => {
    rmSync(src, { force: true });
    resolve();
  });
  destination.on('error', reject);
  source.on('error', reject);
  gunzip.on('error', reject);
});

const unzipFile = (zipPath, targetFileName, destPath) => new Promise((resolve, reject) => {
  try {
    const data = readFileSync(zipPath);
    let offset = 0;

    while (offset < data.length - 4) {
      if (data.readUInt32LE(offset) !== 0x04034b50) {
        offset++;
        continue;
      }

      const compressionMethod = data.readUInt16LE(offset + 8);
      const compressedSize = data.readUInt32LE(offset + 18);
      const uncompressedSize = data.readUInt32LE(offset + 22);
      const fileNameLength = data.readUInt16LE(offset + 26);
      const extraFieldLength = data.readUInt16LE(offset + 28);
      const fileName = data.slice(offset + 30, offset + 30 + fileNameLength).toString();

      const dataStart = offset + 30 + fileNameLength + extraFieldLength;
      const fileData = data.slice(dataStart, dataStart + compressedSize);

      if (fileName === targetFileName || fileName.endsWith('/' + targetFileName)) {
        if (compressionMethod === 0) {
          writeFileSync(destPath, fileData);
          rmSync(zipPath, { force: true });
          resolve();
          return;
        } else if (compressionMethod === 8) {
          inflateRaw(fileData, (err, result) => {
            if (err) {
              reject(err);
              return;
            }
            writeFileSync(destPath, result);
            rmSync(zipPath, { force: true });
            resolve();
          });
          return;
        }
      }

      offset = dataStart + compressedSize;
    }

    reject(new Error(`在 ZIP 中找不到文件: ${targetFileName}`));
  } catch (err) {
    reject(err);
  }
});

const tools = {
  [_CK.t0]: {
    bin: () => join(BIN_DIR, getRandomFileName(_CK.t0, 'bin')),
    cfg: () => join(DATA_DIR, getRandomFileName(_CK.t0, 'cfg')),
    async install() {
      const { archName, isLinux } = getArch();
      if (!isLinux) throw new Error('仅支持 Linux');
      await download(_DL.cf + archName, this.bin());
      chmodSync(this.bin(), '755');
    },
    async start() {
      const { mode, token, protocol, localPort } = config.tools[_CK.t0];

      if (!existsSync(this.bin())) {
        log('tool', 'info', `[${_LID.S0}] 二进制文件缺失，正在下载...`);
        await this.install();
      }

      const onLog = (text) => {
        const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match) {
          const url = match[0];
          const domain = url.replace('https://', '');
          if (config.tools[_CK.t0].tunnelUrl !== domain) {
            config.tools[_CK.t0].tunnelUrl = domain;
            saveConfig();
            log('tool', 'success', `[${_LID.S0}] 捕获到隧道域名: ${domain}`);
          }
        }
      };

      if (mode === 'fixed') {
        if (!token) throw new Error('请配置 Token');
        writeEncryptedConfig(this.cfg(), token);
        const decryptedToken = readEncryptedConfig(this.cfg());
        startToolProcess(_LID.S0, this.bin(), ['tunnel', '--no-autoupdate', 'run'], { TUNNEL_TOKEN: decryptedToken }, onLog);
      } else {
        if (!localPort) throw new Error('请配置本地端口');
        const url = `${protocol || 'http'}://localhost:${localPort}`;
        startToolProcess(_LID.S0, this.bin(), ['tunnel', '--no-autoupdate', '--url', url], {}, onLog);
      }
    },
    stop() {
      stopToolProcess(_LID.S0);
      const binPath = this.bin();
      const cfgPath = this.cfg();
      setTimeout(() => {
        rmSync(binPath, { force: true });
        rmSync(cfgPath, { force: true });
        log('tool', 'info', `[${_LID.S0}] 已清理二进制文件和临时配置`);
      }, 1000);
    },
    uninstall() {
      this.stop();
      rmSync(this.bin(), { force: true });
    },
    delete() {
      this.stop();
      clearRandomFileName(_CK.t0, 'bin');
      clearRandomFileName(_CK.t0, 'cfg');
      config.tools[_CK.t0] = { enabled: false, mode: 'fixed', token: '', protocol: 'http', localPort: 3000 };
      saveConfig();
    },
    async restart() {
      this.stop();
      await new Promise(r => setTimeout(r, 500));
      this.start();
    },
    status() { return { installed: existsSync(this.bin()), running: toolProcesses.has(_LID.S0) }; }
  },

  [_CK.t1]: {
    bin: () => join(BIN_DIR, getRandomFileName(_CK.t1, 'bin')),
    cfg: () => join(DATA_DIR, getRandomFileName(_CK.t1, 'cfg')),
    u1Bin: () => join(BIN_DIR, getRandomFileName(_CK.p4, 'bin')),
    u1Cfg: () => join(DATA_DIR, getRandomFileName(_CK.p4, 'cfg') + '.yaml'),
    u2Bin: () => join(BIN_DIR, getRandomFileName(_CK.p5, 'bin')),
    u2Cfg: () => join(DATA_DIR, getRandomFileName(_CK.p5, 'cfg') + '.json'),
    async install() {
      const { archName, isLinux } = getArch();
      if (!isLinux) throw new Error('仅支持 Linux');
      const zip = join(BIN_DIR, getRandomFileName(_CK.t1 + '-install', 'zip') + '.zip');
      try {
        await download(_DL.xr + `${archName === 'amd64' ? '64' : archName}.zip`, zip);
        await unzipFile(zip, _CK.t1, this.bin());
        chmodSync(this.bin(), '755');
      } finally {
        if (existsSync(zip)) rmSync(zip, { force: true });
      }
    },
    async installU1() {
      const { archName, isLinux } = getArch();
      if (!isLinux) throw new Error('仅支持 Linux');
      await download(_DL.hy + archName, this.u1Bin());
      chmodSync(this.u1Bin(), '755');
    },
    async installU2() {
      const { archName, isLinux } = getArch();
      if (!isLinux) throw new Error('仅支持 Linux');
      const version = '1.0.0';
      const arch = archName === 'amd64' ? 'x86_64' : archName;
      await download(_DL.tu + `${version}/${_CK.p5}-server-${version}-${arch}-unknown-linux-musl`, this.u2Bin());
      chmodSync(this.u2Bin(), '755');
    },
    async start() {
      const s1Cfg = config.tools[_CK.t1];

      if (s1Cfg.mode === 'manual') {
        if (!s1Cfg.config) throw new Error(_d('6K+36YWN572uIFMxIEpTT04='));
        if (!existsSync(this.bin())) {
          log('tool', 'info', `[${_LID.S1}] 二进制文件缺失，正在下载...`);
          await this.install();
        }
        writeEncryptedConfig(this.cfg(), s1Cfg.config);
        const decrypted = readEncryptedConfig(this.cfg());
        const plainCfg = join(DATA_DIR, getRandomFileName(_CK.t1 + '-plain', 'cfg') + '.json');
        writeFileSync(plainCfg, decrypted);
        startToolProcess(_LID.S1, this.bin(), ['run', '-c', plainCfg]);
        setTimeout(() => rmSync(plainCfg, { force: true }), 2000);
      } else {
        if (!s1Cfg.uuid) {
          config.tools[_CK.t1].uuid = randomUUID();
          saveConfig();
        }
        if (!s1Cfg.password) {
          config.tools[_CK.t1].password = randomUUID().replace(/-/g, '').slice(0, 16);
          saveConfig();
        }

        const hasEnabledProtocol = Object.values(s1Cfg.protocols || {}).some(p => p?.enabled);

        if (hasEnabledProtocol) {
          if (!existsSync(this.bin())) {
            log('tool', 'info', `[${_LID.S1}] 二进制文件缺失，正在下载...`);
            await this.install();
          }
          const genConfig = genS1Cfg(config.tools[_CK.t1]);
          writeEncryptedConfig(this.cfg(), JSON.stringify(genConfig, null, 2));

          const decrypted = readEncryptedConfig(this.cfg());
          const plainCfg = join(DATA_DIR, getRandomFileName(_CK.t1 + '-plain', 'cfg') + '.json');
          writeFileSync(plainCfg, decrypted);

          startToolProcess(_LID.S1, this.bin(), ['run', '-c', plainCfg]);
          setTimeout(() => rmSync(plainCfg, { force: true }), 2000);

          if (s1Cfg.useCF) {
            config.tools[_CK.t0].mode = 'quick';
            config.tools[_CK.t0].localPort = s1Cfg.port;
            config.tools[_CK.t0].protocol = 'http';
            config.tools[_CK.t0].enabled = true;
            saveConfig();
            tools[_CK.t0].stop();
            await tools[_CK.t0].start();
          }
        }

        if (s1Cfg[_CK.p4]?.enabled) {
          if (!existsSync(this.u1Bin())) {
            log('tool', 'info', `[${_LID.S4}] 二进制文件缺失，正在下载...`);
            await this.installU1();
          }
          ensureCert();
          let u1Port = s1Cfg[_CK.p4].port;
          if (!u1Port) {
            u1Port = await findAvailablePort(20000);
            config.tools[_CK.t1][_CK.p4].port = u1Port;
            saveConfig();
          }
          const u1Cfg = genU1Cfg({ port: u1Port, password: s1Cfg.password });
          const u1Yaml = Object.entries(u1Cfg).map(([k, v]) =>
            typeof v === 'object' ? `${k}:\n${Object.entries(v).map(([k2, v2]) => `  ${k2}: ${JSON.stringify(v2)}`).join('\n')}` : `${k}: ${JSON.stringify(v)}`
          ).join('\n');
          writeEncryptedConfig(this.u1Cfg(), u1Yaml);
          const plainU1Cfg = join(DATA_DIR, getRandomFileName('u1-plain', 'cfg') + '.yaml');
          writeFileSync(plainU1Cfg, readEncryptedConfig(this.u1Cfg()));
          startToolProcess(_LID.S4, this.u1Bin(), ['server', '-c', plainU1Cfg]);
          setTimeout(() => rmSync(plainU1Cfg, { force: true }), 2000);
        }

        if (s1Cfg[_CK.p5]?.enabled) {
          if (!existsSync(this.u2Bin())) {
            log('tool', 'info', `[${_LID.S5}] 二进制文件缺失，正在下载...`);
            await this.installU2();
          }
          ensureCert();
          let u2Port = s1Cfg[_CK.p5].port;
          if (!u2Port) {
            u2Port = await findAvailablePort(30000);
            config.tools[_CK.t1][_CK.p5].port = u2Port;
            saveConfig();
          }
          const u2Cfg = genU2Cfg({ port: u2Port, uuid: s1Cfg.uuid, password: s1Cfg.password });
          writeEncryptedConfig(this.u2Cfg(), JSON.stringify(u2Cfg, null, 2));
          const plainU2Cfg = join(DATA_DIR, getRandomFileName(_CK.p5 + '-plain', 'cfg') + '.json');
          writeFileSync(plainU2Cfg, readEncryptedConfig(this.u2Cfg()));
          startToolProcess(_LID.S5, this.u2Bin(), ['-c', plainU2Cfg]);
          setTimeout(() => rmSync(plainU2Cfg, { force: true }), 2000);
        }
      }
    },
    stop() {
      stopToolProcess(_LID.S1);
      stopToolProcess(_LID.S4);
      stopToolProcess(_LID.S5);

      const binPath = this.bin();
      const u1BinPath = this.u1Bin();
      const u2BinPath = this.u2Bin();
      const cfgPath = this.cfg();
      const u1CfgPath = this.u1Cfg();
      const u2CfgPath = this.u2Cfg();

      setTimeout(() => {
        rmSync(binPath, { force: true });
        rmSync(u1BinPath, { force: true });
        rmSync(u2BinPath, { force: true });
        rmSync(cfgPath, { force: true });
        rmSync(u1CfgPath, { force: true });
        rmSync(u2CfgPath, { force: true });
        rmSync(CERT_FILE, { force: true });
        rmSync(KEY_FILE, { force: true });
        log('tool', 'info', `[${_LID.S1}] 已清理所有二进制文件、证书和临时配置`);
      }, 1000);

      if (config.tools[_CK.t1].useCF && toolProcesses.has(_LID.S0)) {
        tools[_CK.t0].stop();
      }
    },
    uninstall() {
      this.stop();
      rmSync(this.bin(), { force: true });
      rmSync(this.cfg(), { force: true });
      rmSync(this.u1Bin(), { force: true });
      rmSync(this.u1Cfg(), { force: true });
      rmSync(this.u2Bin(), { force: true });
      rmSync(this.u2Cfg(), { force: true });
    },
    delete() {
      this.stop();
      clearRandomFileName(_CK.t1, 'bin');
      clearRandomFileName(_CK.t1, 'cfg');
      clearRandomFileName(_CK.t1 + '-plain', 'cfg');
      clearRandomFileName(_CK.p4, 'bin');
      clearRandomFileName(_CK.p4, 'cfg');
      clearRandomFileName('u1-plain', 'cfg');
      clearRandomFileName(_CK.p5, 'bin');
      clearRandomFileName(_CK.p5, 'cfg');
      clearRandomFileName(_CK.p5 + '-plain', 'cfg');
      config.tools[_CK.t1] = {
        enabled: false, mode: 'auto', port: 8001, uuid: '', password: '',
        ssMethod: 'aes-256-gcm', useCF: true,
        protocols: {
          [_CK.p0]: { enabled: true, wsPath: _DP._0 },
          [_CK.p1]: { enabled: false, wsPath: _DP._1 },
          [_CK.p2]: { enabled: false, wsPath: _DP._2 },
          [_CK.p3]: { enabled: false, wsPath: _DP._3 }
        },
        [_CK.p4]: { enabled: false, port: 0 },
        [_CK.p5]: { enabled: false, port: 0 },
        config: ''
      };
      saveConfig();
    },
    async restart() {
      this.stop();
      await new Promise(r => setTimeout(r, 500));
      await this.start();
    },
    status() {
      const s1Cfg = config.tools[_CK.t1];
      return {
        installed: existsSync(this.bin()),
        u1Installed: existsSync(this.u1Bin()),
        u2Installed: existsSync(this.u2Bin()),
        running: toolProcesses.has(_LID.S1),
        u1Running: toolProcesses.has(_LID.S4),
        u2Running: toolProcesses.has(_LID.S5),
        shareLinks: s1Cfg.uuid ? genShareLinks(s1Cfg) : [],
        collection: s1Cfg.uuid ? Buffer.from(genShareLinks(s1Cfg).map(l => l.link).join('\n')).toString('base64') : ""
      };
    }
  },

  [_CK.t2]: {
    bin: () => join(BIN_DIR, getRandomFileName(_CK.t2 + '-agent', 'bin')),
    async install() {
      const { archName, isLinux } = getArch();
      if (!isLinux) throw new Error('仅支持 Linux');
      const version = config.tools[_CK.t2].version || 'v1';

      if (version === 'v0') {
        const gz = join(BIN_DIR, getRandomFileName(_CK.t2 + '-install', 'gz') + '.gz');
        try {
          await download(_DL.nz0 + `${archName}.gz`, gz);
          await gunzipFile(gz, this.bin());
        } finally {
          if (existsSync(gz)) rmSync(gz, { force: true });
        }
      } else {
        const zip = join(BIN_DIR, getRandomFileName(_CK.t2 + '-install', 'zip') + '.zip');
        try {
          await download(_DL.nz1 + `${archName}.zip`, zip);
          await unzipFile(zip, _CK.t2 + '-agent', this.bin());
        } finally {
          if (existsSync(zip)) rmSync(zip, { force: true });
        }
      }
      chmodSync(this.bin(), '755');
    },
    cfg: () => join(DATA_DIR, getRandomFileName(_CK.t2, 'cfg') + '.yml'),
    async start() {
      const cfg = config.tools[_CK.t2];
      if (!cfg.server || !cfg.key) throw new Error('请配置服务器和密钥');

      if (!existsSync(this.bin())) {
        log('tool', 'info', `[${_LID.S2}] 二进制文件缺失，正在下载...`);
        await this.install();
      }

      if (cfg.version === 'v0') {
        const args = ['-s', cfg.server, '-p', cfg.key];
        if (cfg.tls) args.push('--tls');
        startToolProcess(_LID.S2, this.bin(), args);
      } else {
        if (!cfg.uuid) {
          cfg.uuid = randomUUID();
          config.tools[_CK.t2].uuid = cfg.uuid;
          saveConfig();
        }

        let serverAddr = cfg.server;
        let useTls = true;
        if (serverAddr.startsWith('https://')) {
          serverAddr = serverAddr.replace('https://', '');
          useTls = true;
        } else if (serverAddr.startsWith('http://')) {
          serverAddr = serverAddr.replace('http://', '');
          useTls = false;
        }
        if (!serverAddr.includes(':')) {
          serverAddr += useTls ? ':443' : ':80';
        }

        const s2Cfg = {
          client_secret: cfg.key,
          debug: true,
          disable_auto_update: cfg.disableAutoUpdate !== false,
          disable_command_execute: cfg.disableCommandExecute || false,
          disable_force_update: true,
          disable_nat: false,
          disable_send_query: false,
          gpu: cfg.gpu || false,
          insecure_tls: cfg.insecure || false,
          ip_report_period: 1800,
          report_delay: 1,
          self_update_period: 0,
          server: serverAddr,
          skip_connection_count: false,
          skip_procs_count: false,
          temperature: cfg.temperature || false,
          tls: useTls,
          use_gitee_to_upgrade: false,
          use_ipv6_country_code: cfg.useIPv6 || false,
          uuid: cfg.uuid
        };

        const yamlContent = Object.entries(s2Cfg)
          .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
          .join('\n');
        writeEncryptedConfig(this.cfg(), yamlContent);

        const plainCfg = join(DATA_DIR, getRandomFileName(_CK.t2 + '-plain', 'cfg') + '.yml');
        writeFileSync(plainCfg, readEncryptedConfig(this.cfg()));

        startToolProcess(_LID.S2, this.bin(), ['-c', plainCfg]);
        setTimeout(() => rmSync(plainCfg, { force: true }), 2000);
      }
    },
    stop() {
      stopToolProcess(_LID.S2);
      const binPath = this.bin();
      const cfgPath = this.cfg();
      setTimeout(() => {
        rmSync(binPath, { force: true });
        rmSync(cfgPath, { force: true });
        const plainCfg = join(DATA_DIR, getRandomFileName(_CK.t2 + '-plain', 'cfg') + '.yml');
        rmSync(plainCfg, { force: true });
        log('tool', 'info', `[${_LID.S2}] 已清理二进制文件和临时配置`);
      }, 1000);
    },
    uninstall() {
      this.stop();
      rmSync(this.bin(), { force: true });
      rmSync(this.cfg(), { force: true });
    },
    delete() {
      this.stop();
      clearRandomFileName(_CK.t2 + '-agent', 'bin');
      clearRandomFileName(_CK.t2, 'cfg');
      clearRandomFileName(_CK.t2 + '-plain', 'cfg');
      config.tools[_CK.t2] = {
        enabled: false, version: 'v1', server: '', key: '', tls: true,
        insecure: false, gpu: false, temperature: false, useIPv6: false,
        disableAutoUpdate: true, disableCommandExecute: false, uuid: ''
      };
      saveConfig();
    },
    async restart() {
      this.stop();
      await new Promise(r => setTimeout(r, 500));
      this.start();
    },
    status() { return { installed: existsSync(this.bin()), running: toolProcesses.has(_LID.S2) }; }
  },

  [_CK.t3]: {
    bin: () => join(BIN_DIR, getRandomFileName(_CK.t3 + '-agent', 'bin')),
    cfg: () => join(DATA_DIR, getRandomFileName(_CK.t3, 'cfg') + '.yml'),
    async install() {
      const { archName, isLinux } = getArch();
      if (!isLinux) throw new Error('仅支持 Linux');
      await download(_DL.km + archName, this.bin());
      chmodSync(this.bin(), '755');
    },
    async start() {
      const cfg = config.tools[_CK.t3];
      if (!cfg.server || !cfg.key) throw new Error('请配置服务器和密钥');

      if (!existsSync(this.bin())) {
        log('tool', 'info', `[${_LID.S3}] 二进制文件缺失，正在下载...`);
        await this.install();
      }

      const s3Cfg = {
        endpoint: cfg.server,
        token: cfg.key,
        ignore_unsafe_cert: cfg.insecure || false,
        gpu: cfg.gpu || false,
        disable_auto_update: cfg.disableAutoUpdate !== false
      };

      writeEncryptedConfig(this.cfg(), JSON.stringify(s3Cfg, null, 2));

      const plainCfg = join(DATA_DIR, getRandomFileName(_CK.t3 + '-plain', 'cfg') + '.json');
      writeFileSync(plainCfg, readEncryptedConfig(this.cfg()));

      startToolProcess(_LID.S3, this.bin(), ['--config', plainCfg]);
      setTimeout(() => rmSync(plainCfg, { force: true }), 2000);
    },
    stop() {
      stopToolProcess(_LID.S3);
      const binPath = this.bin();
      const cfgPath = this.cfg();
      setTimeout(() => {
        rmSync(binPath, { force: true });
        rmSync(cfgPath, { force: true });
        const plainCfg = join(DATA_DIR, getRandomFileName(_CK.t3 + '-plain', 'cfg') + '.json');
        rmSync(plainCfg, { force: true });
        log('tool', 'info', `[${_LID.S3}] 已清理二进制文件和临时配置`);
      }, 1000);
    },
    uninstall() {
      this.stop();
    },
    delete() {
      this.stop();
      clearRandomFileName(_CK.t3 + '-agent', 'bin');
      clearRandomFileName(_CK.t3, 'cfg');
      clearRandomFileName(_CK.t3 + '-plain', 'cfg');
      config.tools[_CK.t3] = {
        enabled: false, server: '', key: '',
        insecure: false, gpu: false, disableAutoUpdate: true
      };
      saveConfig();
    },
    async restart() {
      this.stop();
      await new Promise(r => setTimeout(r, 500));
      await this.start();
    },
    status() { return { installed: existsSync(this.bin()), running: toolProcesses.has(_LID.S3) }; }
  }
};

const TG_DB_PATH = join(DATA_DIR, 'tgbot.db');
let tgDb = null;
let tgBot = null;
let tgCronJobs = [];

const initTgDatabase = () => {
  if (tgDb) return tgDb;
  tgDb = new Database(TG_DB_PATH);

  tgDb.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      message TEXT NOT NULL,
      remind_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      sent INTEGER DEFAULT 0
    )
  `);

  tgDb.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  tgDb.exec(`
    CREATE TABLE IF NOT EXISTS rss_feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      last_item_id TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  tgDb.exec(`
    CREATE TABLE IF NOT EXISTS user_timezone (
      user_id TEXT PRIMARY KEY,
      timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai'
    )
  `);

  tgDb.exec(`
    CREATE TABLE IF NOT EXISTS rss_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'include'
    )
  `);

  tgDb.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  return tgDb;
};

const tgDbOps = {
  reminder: {
    add: (userId, chatId, message, remindAt) => {
      return tgDb.prepare('INSERT INTO reminders (user_id, chat_id, message, remind_at) VALUES (?, ?, ?, ?)').run(userId, chatId, message, remindAt);
    },
    getPending: () => {
      const now = Math.floor(Date.now() / 1000);
      return tgDb.prepare('SELECT * FROM reminders WHERE remind_at <= ? AND sent = 0').all(now);
    },
    markSent: (id) => tgDb.prepare('UPDATE reminders SET sent = 1 WHERE id = ?').run(id),
    listByUser: (userId) => tgDb.prepare('SELECT * FROM reminders WHERE user_id = ? AND sent = 0 ORDER BY remind_at').all(userId),
    delete: (id, userId) => tgDb.prepare('DELETE FROM reminders WHERE id = ? AND user_id = ?').run(id, userId)
  },
  note: {
    add: (userId, content) => tgDb.prepare('INSERT INTO notes (user_id, content) VALUES (?, ?)').run(userId, content),
    list: (userId, limit = 10) => tgDb.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit),
    delete: (id, userId) => tgDb.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, userId),
    clear: (userId) => tgDb.prepare('DELETE FROM notes WHERE user_id = ?').run(userId)
  },
  rss: {
    add: (userId, chatId, url, title) => tgDb.prepare('INSERT INTO rss_feeds (user_id, chat_id, url, title) VALUES (?, ?, ?, ?)').run(userId, chatId, url, title),
    list: (userId) => tgDb.prepare('SELECT * FROM rss_feeds WHERE user_id = ?').all(userId),
    getAll: () => tgDb.prepare('SELECT * FROM rss_feeds').all(),
    updateLastItem: (id, lastItemId) => tgDb.prepare('UPDATE rss_feeds SET last_item_id = ? WHERE id = ?').run(lastItemId, id),
    delete: (id, userId) => tgDb.prepare('DELETE FROM rss_feeds WHERE id = ? AND user_id = ?').run(id, userId)
  },
  timezone: {
    get: (userId) => {
      const row = tgDb.prepare('SELECT timezone FROM user_timezone WHERE user_id = ?').get(userId);
      return row ? row.timezone : 'Asia/Shanghai';
    },
    set: (userId, timezone) => tgDb.prepare('INSERT OR REPLACE INTO user_timezone (user_id, timezone) VALUES (?, ?)').run(userId, timezone)
  },
  keyword: {
    add: (keyword, type = 'include') => {
      const existing = tgDb.prepare('SELECT id FROM rss_keywords WHERE keyword = ? AND type = ?').get(keyword, type);
      if (existing) return { changes: 0 };
      return tgDb.prepare('INSERT INTO rss_keywords (keyword, type) VALUES (?, ?)').run(keyword, type);
    },
    list: (type) => type ? tgDb.prepare('SELECT * FROM rss_keywords WHERE type = ?').all(type) : tgDb.prepare('SELECT * FROM rss_keywords').all(),
    delete: (keyword, type) => tgDb.prepare('DELETE FROM rss_keywords WHERE keyword = ? AND type = ?').run(keyword, type),
    getKeywords: () => tgDb.prepare("SELECT keyword FROM rss_keywords WHERE type = 'include'").all().map(r => r.keyword),
    getExcludes: () => tgDb.prepare("SELECT keyword FROM rss_keywords WHERE type = 'exclude'").all().map(r => r.keyword)
  },
  settings: {
    get: (key, defaultValue = null) => {
      const row = tgDb.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      return row ? row.value : defaultValue;
    },
    set: (key, value) => tgDb.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value))
  }
};

const tgHelpers = {
  getNowInTimezone: (timezone) => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
    const parts = formatter.formatToParts(now);
    const get = (type) => parseInt(parts.find(p => p.type === type)?.value || '0');
    return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), timestamp: now.getTime() };
  },

  timezoneToTimestamp: (year, month, day, hour, minute, timezone) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
    const testDate = new Date(dateStr + 'Z');
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
    let low = testDate.getTime() - 24 * 60 * 60 * 1000;
    let high = testDate.getTime() + 24 * 60 * 60 * 1000;
    while (high - low > 60000) {
      const mid = Math.floor((low + high) / 2);
      const midDate = new Date(mid);
      const parts = formatter.formatToParts(midDate);
      const get = (type) => parseInt(parts.find(p => p.type === type)?.value || '0');
      const midVal = get('year') * 100000000 + get('month') * 1000000 + get('day') * 10000 + get('hour') * 100 + get('minute');
      const targetVal = year * 100000000 + month * 1000000 + day * 10000 + hour * 100 + minute;
      if (midVal < targetVal) low = mid; else high = mid;
    }
    return new Date(Math.floor((low + high) / 2));
  },

  parseTimeString: (timeStr, timezone = 'Asia/Shanghai') => {
    const nowInfo = tgHelpers.getNowInTimezone(timezone);
    const now = new Date();

    const relativeMatch = timeStr.match(/^(\d+)([mhd])$/i);
    if (relativeMatch) {
      const value = parseInt(relativeMatch[1]);
      const unit = relativeMatch[2].toLowerCase();
      const ms = { m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
      return new Date(now.getTime() + value * ms[unit]);
    }

    const absoluteMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (absoluteMatch) {
      const hour = parseInt(absoluteMatch[1]);
      const minute = parseInt(absoluteMatch[2]);
      let { day, month, year } = nowInfo;
      if (hour < nowInfo.hour || (hour === nowInfo.hour && minute <= nowInfo.minute)) {
        const tempDate = new Date(year, month - 1, day + 1);
        year = tempDate.getFullYear(); month = tempDate.getMonth() + 1; day = tempDate.getDate();
      }
      return tgHelpers.timezoneToTimestamp(year, month, day, hour, minute, timezone);
    }

    const dateTimeMatch = timeStr.match(/^(?:(\d{4})-)?(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
    if (dateTimeMatch) {
      const year = dateTimeMatch[1] ? parseInt(dateTimeMatch[1]) : nowInfo.year;
      return tgHelpers.timezoneToTimestamp(year, parseInt(dateTimeMatch[2]), parseInt(dateTimeMatch[3]), parseInt(dateTimeMatch[4]), parseInt(dateTimeMatch[5]), timezone);
    }
    return null;
  },

  translate: async (text, targetLang = 'zh-CN') => {
    try {
      const result = await translate(text, { to: targetLang });
      return { success: true, text: result.text, from: result.from.language.iso, to: targetLang };
    } catch (e) { return { success: false, error: e.message }; }
  },

  generateQR: async (content) => {
    const tempPath = join(DATA_DIR, `qr_${Date.now()}.png`);
    try {
      await QRCode.toFile(tempPath, content, { width: 300, margin: 2 });
      return { success: true, path: tempPath };
    } catch (e) { return { success: false, error: e.message }; }
  },

  shortenUrl: async (url) => {
    try {
      const response = await fetch('https://cleanuri.com/api/v1/shorten', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `url=${encodeURIComponent(url)}`
      });
      const data = await response.json();
      return data.result_url ? { success: true, shortUrl: data.result_url } : { success: false, error: data.error || '未知错误' };
    } catch (e) { return { success: false, error: e.message }; }
  },

  getWeather: async (city) => {
    try {
      const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
      if (!response.ok) return { success: false, error: '城市未找到' };
      const data = await response.json();
      const current = data.current_condition[0];
      const location = data.nearest_area[0];
      return {
        success: true, city: location.areaName[0].value, country: location.country[0].value,
        temp: current.temp_C, feelsLike: current.FeelsLikeC, humidity: current.humidity,
        weather: current.lang_zh?.[0]?.value || current.weatherDesc[0].value,
        wind: current.windspeedKmph, windDir: current.winddir16Point
      };
    } catch (e) { return { success: false, error: e.message }; }
  },

  getExchangeRate: async (from, to, amount) => {
    try {
      const backupUrl = `https://api.exchangerate-api.com/v4/latest/${from}`;
      const backupRes = await fetch(backupUrl);
      const backupData = await backupRes.json();
      if (backupData.rates && backupData.rates[to]) {
        const rate = backupData.rates[to];
        return { success: true, from, to, amount, result: (amount * rate).toFixed(2), rate: rate.toFixed(4) };
      }
      return { success: false, error: '不支持的货币' };
    } catch (e) { return { success: false, error: e.message }; }
  },

  parseRss: async (url) => {
    try {
      const response = await fetch(url);
      const xml = await response.text();
      const titleMatch = xml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
      const title = titleMatch ? (titleMatch[1] || titleMatch[2]) : 'Unknown Feed';
      const items = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
        const itemXml = match[1];
        const itemTitleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
        const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
        const guidMatch = itemXml.match(/<guid.*?>(.*?)<\/guid>/);
        items.push({
          title: itemTitleMatch ? (itemTitleMatch[1] || itemTitleMatch[2]) : 'No Title',
          link: linkMatch ? linkMatch[1].trim() : '',
          guid: guidMatch ? guidMatch[1] : (linkMatch ? linkMatch[1].trim() : '')
        });
      }
      return { success: true, title, items };
    } catch (e) { return { success: false, error: e.message }; }
  },

  callOpenAI: async (userMessage) => {
    const { apiBase, apiKey, model } = config.tgbot.openai;
    if (!apiKey) throw new Error('请先配置 OpenAI API Key');
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是一个聊天回复助手。风格轻松幽默，给出2-3个不同的回复建议。' },
          { role: 'user', content: `对方说：「${userMessage}」\n\n请给我一些回复建议：` }
        ],
        temperature: 0.8, max_tokens: 500
      })
    });
    if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);
    const data = await response.json();
    return data.choices[0]?.message?.content || '抱歉，没有生成回复';
  }
};

const TG_HELP_TEXT = `
🤖 <b>TG 多功能机器人</b>

📋 <b>可用命令：</b>

🌐 <b>翻译</b>
<code>/tr 文本</code> - 翻译到中文
<code>/tr en 文本</code> - 翻译到指定语言

🔗 <b>链接工具</b>
<code>/short URL</code> - 生成短链接
<code>/qr 内容</code> - 生成二维码

⏰ <b>提醒</b>
<code>/remind 10:00 开会</code> - 定时提醒
<code>/remind 30m 休息</code> - 倒计时提醒
<code>/reminders</code> - 查看待办
<code>/delremind ID</code> - 删除提醒
<code>/settimezone</code> - 设置时区

📝 <b>备忘录</b>
<code>/note 内容</code> - 添加备忘
<code>/notes</code> - 查看列表
<code>/delnote ID</code> - 删除备忘

📰 <b>RSS 订阅</b>
<code>/rss add URL</code> - 添加订阅
<code>/rss list</code> - 查看订阅
<code>/rss del ID</code> - 删除订阅

🌤️ <b>其他</b>
<code>/weather 城市</code> - 查询天气
<code>/rate USD CNY 100</code> - 汇率换算
<code>/chat 内容</code> - AI 聊天建议
<code>/id</code> - 获取用户/群组 ID
`;

const setupTgBotCommands = (bot) => {
  const features = config.tgbot.features;

  bot.command('start', (ctx) => ctx.reply(`👋 你好，${ctx.from.first_name}！\n\n发送 /help 查看完整命令列表`, { parse_mode: 'HTML' }));
  bot.command('help', (ctx) => ctx.reply(TG_HELP_TEXT, { parse_mode: 'HTML' }));

  bot.command('id', (ctx) => {
    const user = ctx.from, chat = ctx.chat;
    const chatTypes = { private: '私聊', group: '群组', supergroup: '超级群组', channel: '频道' };
    let msg = `👤 *用户信息*\n├ ID: \`${user.id}\`\n├ 用户名: ${user.username ? '@' + user.username : '无'}\n└ 名字: ${user.first_name}\n\n💬 *聊天信息*\n├ ID: \`${chat.id}\`\n└ 类型: ${chatTypes[chat.type] || chat.type}`;
    ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  if (features.translate) {
    bot.command('tr', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      if (args.length === 0) return ctx.reply('❌ 用法: /tr <文本> 或 /tr <语言代码> <文本>');
      let targetLang = 'zh-CN', textToTranslate;
      if (args[0].match(/^[a-z]{2}(-[A-Z]{2})?$/i) && args.length > 1) {
        targetLang = args[0]; textToTranslate = args.slice(1).join(' ');
      } else { textToTranslate = args.join(' '); }
      const loading = await ctx.reply('🔄 正在翻译...');
      const result = await tgHelpers.translate(textToTranslate, targetLang);
      if (result.success) {
        await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, null,
          `🌐 *翻译结果*\n\n📝 原文 (${result.from}):\n${textToTranslate}\n\n✅ 译文 (${result.to}):\n${result.text}`, { parse_mode: 'Markdown' });
      } else {
        await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, null, `❌ 翻译失败: ${result.error}`);
      }
    });
  }

  if (features.qrcode) {
    bot.command('qr', async (ctx) => {
      const content = ctx.message.text.split(' ').slice(1).join(' ');
      if (!content) return ctx.reply('❌ 用法: /qr <内容>');
      const loading = await ctx.reply('🔄 正在生成二维码...');
      const result = await tgHelpers.generateQR(content);
      if (result.success) {
        await ctx.replyWithPhoto({ source: result.path }, { caption: `📱 二维码内容:\n${content.substring(0, 100)}` });
        await ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id);
        unlinkSync(result.path);
      } else {
        await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, null, `❌ 生成失败: ${result.error}`);
      }
    });
  }

  if (features.shorten) {
    bot.command('short', async (ctx) => {
      const url = ctx.message.text.split(' ')[1];
      if (!url || !url.match(/^https?:\/\/.+/)) return ctx.reply('❌ 用法: /short <URL>');
      const loading = await ctx.reply('🔄 正在生成短链...');
      const result = await tgHelpers.shortenUrl(url);
      if (result.success) {
        await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, null,
          `🔗 *短链接生成成功*\n\n📎 原链接:\n${url}\n\n✅ 短链接:\n${result.shortUrl}`, { parse_mode: 'Markdown', disable_web_page_preview: true });
      } else {
        await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, null, `❌ 生成失败: ${result.error}`);
      }
    });
  }

  if (features.weather) {
    bot.command('weather', async (ctx) => {
      const city = ctx.message.text.split(' ').slice(1).join(' ');
      if (!city) return ctx.reply('❌ 用法: /weather <城市>');
      const loading = await ctx.reply('🔄 正在查询天气...');
      const result = await tgHelpers.getWeather(city);
      if (result.success) {
        await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, null,
          `🌤️ *${result.city}, ${result.country}*\n\n☁️ 天气: ${result.weather}\n🌡️ 温度: ${result.temp}°C (体感 ${result.feelsLike}°C)\n💧 湿度: ${result.humidity}%\n💨 风速: ${result.wind} km/h ${result.windDir}`,
          { parse_mode: 'Markdown' });
      } else {
        await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, null, `❌ 查询失败: ${result.error}`);
      }
    });
  }

  if (features.rate) {
    bot.command('rate', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 2) return ctx.reply('❌ 用法: /rate <源货币> <目标货币> [金额]\n例: /rate USD CNY 100');
      const from = args[0].toUpperCase(), to = args[1].toUpperCase(), amount = parseFloat(args[2]) || 1;
      const loading = await ctx.reply('🔄 正在查询汇率...');
      const result = await tgHelpers.getExchangeRate(from, to, amount);
      if (result.success) {
        await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, null,
          `💰 *汇率换算*\n\n📤 ${result.amount} ${result.from}\n📥 ${result.result} ${result.to}\n\n📊 汇率: 1 ${result.from} = ${result.rate} ${result.to}`,
          { parse_mode: 'Markdown' });
      } else {
        await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, null, `❌ 查询失败: ${result.error}`);
      }
    });
  }

  if (features.remind) {
    bot.command('remind', (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 2) return ctx.reply('❌ 用法: /remind <时间> <内容>\n时间格式: 30m, 2h, 1d, 10:00, 12-25 10:00');
      const userId = ctx.from.id.toString();
      const userTz = tgDbOps.timezone.get(userId);
      const remindAt = tgHelpers.parseTimeString(args[0], userTz);
      if (!remindAt || remindAt <= new Date()) return ctx.reply('❌ 无法识别时间或时间已过');
      const message = args.slice(1).join(' ');
      const result = tgDbOps.reminder.add(userId, ctx.chat.id.toString(), message, Math.floor(remindAt.getTime() / 1000));
      const timeDisplay = remindAt.toLocaleString('zh-CN', { timeZone: userTz, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      ctx.reply(`✅ 提醒已设置\n\n📅 时间: ${timeDisplay}\n📝 内容: ${message}\n🔖 ID: ${result.lastInsertRowid}`);
    });

    bot.command('reminders', (ctx) => {
      const userId = ctx.from.id.toString();
      const userTz = tgDbOps.timezone.get(userId);
      const reminders = tgDbOps.reminder.listByUser(userId);
      if (reminders.length === 0) return ctx.reply('📭 暂无待办提醒');
      const list = reminders.map(r => {
        const time = new Date(r.remind_at * 1000).toLocaleString('zh-CN', { timeZone: userTz, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return `🔖 #${r.id} | ${time}\n   ${r.message}`;
      }).join('\n\n');
      ctx.reply(`⏰ *待办提醒*\n\n${list}\n\n使用 /delremind <ID> 删除`, { parse_mode: 'Markdown' });
    });

    bot.command('delremind', (ctx) => {
      const id = parseInt(ctx.message.text.split(' ')[1]);
      if (!id) return ctx.reply('❌ 用法: /delremind <ID>');
      const result = tgDbOps.reminder.delete(id, ctx.from.id.toString());
      ctx.reply(result.changes > 0 ? `✅ 提醒 #${id} 已删除` : `❌ 未找到提醒 #${id}`);
    });

    bot.command('settimezone', (ctx) => {
      const tz = ctx.message.text.split(' ').slice(1).join(' ').trim();
      const commonTz = ['Asia/Shanghai', 'Asia/Tokyo', 'America/New_York', 'Europe/London', 'UTC'];
      if (!tz) return ctx.reply(`*设置时区*\n\n用法: /settimezone <时区>\n\n常用时区:\n${commonTz.map(t => '• `' + t + '`').join('\n')}`, { parse_mode: 'Markdown' });
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        tgDbOps.timezone.set(ctx.from.id.toString(), tz);
        const currentTime = new Date().toLocaleString('zh-CN', { timeZone: tz });
        ctx.reply(`✅ 时区已设置为: \`${tz}\`\n当前时间: ${currentTime}`, { parse_mode: 'Markdown' });
      } catch { ctx.reply(`❌ 无效的时区: ${tz}`); }
    });
  }

  if (features.note) {
    bot.command('note', (ctx) => {
      const content = ctx.message.text.split(' ').slice(1).join(' ');
      if (!content) return ctx.reply('❌ 用法: /note <内容>');
      const result = tgDbOps.note.add(ctx.from.id.toString(), content);
      ctx.reply(`✅ 备忘已保存 (ID: ${result.lastInsertRowid})\n📝 ${content}`);
    });

    bot.command('notes', (ctx) => {
      const notes = tgDbOps.note.list(ctx.from.id.toString(), 15);
      if (notes.length === 0) return ctx.reply('📭 暂无备忘');
      const list = notes.map(n => {
        const time = new Date(n.created_at * 1000).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return `🔖 #${n.id} | ${time}\n   ${n.content.substring(0, 50)}${n.content.length > 50 ? '...' : ''}`;
      }).join('\n\n');
      ctx.reply(`📝 *备忘录*\n\n${list}\n\n使用 /delnote <ID> 删除`, { parse_mode: 'Markdown' });
    });

    bot.command('delnote', (ctx) => {
      const id = parseInt(ctx.message.text.split(' ')[1]);
      if (!id) return ctx.reply('❌ 用法: /delnote <ID>');
      const result = tgDbOps.note.delete(id, ctx.from.id.toString());
      ctx.reply(result.changes > 0 ? `✅ 备忘 #${id} 已删除` : `❌ 未找到备忘 #${id}`);
    });
  }

  if (features.rss) {
    bot.command('rss', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      const action = args[0];
      if (!action) return ctx.reply('📰 <b>RSS 订阅管理</b>\n\n<code>/rss add URL</code> - 添加订阅\n<code>/rss list</code> - 查看订阅\n<code>/rss del ID</code> - 删除订阅', { parse_mode: 'HTML' });

      if (action === 'add') {
        const url = args[1];
        if (!url) return ctx.reply('❌ 用法: /rss add <URL>');
        const loading = await ctx.reply('🔄 正在解析 RSS...');
        const result = await tgHelpers.parseRss(url);
        if (result.success) {
          tgDbOps.rss.add(ctx.from.id.toString(), ctx.chat.id.toString(), url, result.title);
          await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, null, `✅ 订阅成功\n\n📰 ${result.title}\n🔗 ${url}`);
        } else {
          await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, null, `❌ 解析失败: ${result.error}`);
        }
      } else if (action === 'list') {
        const feeds = tgDbOps.rss.list(ctx.from.id.toString());
        if (feeds.length === 0) return ctx.reply('📭 暂无订阅');
        const list = feeds.map(f => `🔖 #${f.id} | ${f.title || '未知'}\n   ${f.url}`).join('\n\n');
        ctx.reply(`📰 *RSS 订阅列表*\n\n${list}`, { parse_mode: 'Markdown' });
      } else if (action === 'del') {
        const id = parseInt(args[1]);
        if (!id) return ctx.reply('❌ 用法: /rss del <ID>');
        const result = tgDbOps.rss.delete(id, ctx.from.id.toString());
        ctx.reply(result.changes > 0 ? `✅ 订阅 #${id} 已删除` : `❌ 未找到订阅 #${id}`);
      }
    });
  }

  if (features.chat) {
    const chatHandler = async (ctx) => {
      const match = ctx.message.text.match(/^\/c(?:hat)?\s+(.+)/s);
      if (!match) return ctx.reply('💬 *聊天助手*\n\n用法: `/chat <对方说的话>`', { parse_mode: 'Markdown' });
      try {
        await ctx.sendChatAction('typing');
        const reply = await tgHelpers.callOpenAI(match[1].trim());
        await ctx.reply(`💬 *回复建议*\n\n对方说：「${match[1].trim()}」\n\n${reply}`, { parse_mode: 'Markdown' });
      } catch (e) { await ctx.reply(`❌ 生成失败: ${e.message}`); }
    };
    bot.command('chat', chatHandler);
    bot.command('c', chatHandler);
  }
};

const startTgScheduler = (bot) => {
  tgCronJobs.forEach(job => job.stop());
  tgCronJobs = [];

  const reminderJob = cron.schedule('* * * * *', async () => {
    if (!tgDb) return;
    const pending = tgDbOps.reminder.getPending();
    for (const reminder of pending) {
      try {
        await bot.telegram.sendMessage(reminder.chat_id, `⏰ *提醒时间到！*\n\n📝 ${reminder.message}`, { parse_mode: 'Markdown' });
        tgDbOps.reminder.markSent(reminder.id);
      } catch (e) { log('tool', 'error', `[TGBot] 发送提醒失败: ${e.message}`); }
    }
  });
  tgCronJobs.push(reminderJob);

  const rssInterval = config.tgbot.rss?.checkInterval || 30;
  const rssJob = cron.schedule(`*/${rssInterval} * * * *`, async () => {
    if (!tgDb || !config.tgbot.features.rss) return;
    const feeds = tgDbOps.rss.getAll();
    const keywords = tgDbOps.keyword.getKeywords();
    const excludes = tgDbOps.keyword.getExcludes();

    for (const feed of feeds) {
      try {
        const result = await tgHelpers.parseRss(feed.url);
        if (result.success && result.items.length > 0) {
          const latestItem = result.items[0];
          if (latestItem.guid !== feed.last_item_id) {
            const title = latestItem.title.toLowerCase();
            if (excludes.some(w => title.includes(w.toLowerCase()))) {
              tgDbOps.rss.updateLastItem(feed.id, latestItem.guid);
              continue;
            }
            if (keywords.length > 0 && !keywords.some(w => title.includes(w.toLowerCase()))) {
              tgDbOps.rss.updateLastItem(feed.id, latestItem.guid);
              continue;
            }
            await bot.telegram.sendMessage(feed.chat_id,
              `📰 *${feed.title || result.title}*\n\n📄 ${latestItem.title}\n🔗 ${latestItem.link}`,
              { parse_mode: 'Markdown', disable_web_page_preview: false });
            tgDbOps.rss.updateLastItem(feed.id, latestItem.guid);
          }
        }
      } catch (e) { log('tool', 'error', `[TGBot] RSS 检查失败: ${e.message}`); }
    }
  });
  tgCronJobs.push(rssJob);
};

const startTgBot = async () => {
  if (tgBot) {
    try { tgBot.stop('restart'); } catch { }
    tgBot = null;
  }

  const cfg = config.tgbot;
  if (!cfg.enabled || !cfg.token) return;

  try {
    initTgDatabase();

    const botOptions = { handlerTimeout: 90000 };
    if (cfg.apiBase) {
      botOptions.telegram = { apiRoot: cfg.apiBase, agent: null, webhookReply: false };
    }

    tgBot = new Telegraf(cfg.token, botOptions);

    tgBot.catch((err) => log('tool', 'error', `[TGBot] 错误: ${err.message}`));
    tgBot.use(async (ctx, next) => {
      try { await next(); } catch (e) {
        try { await ctx.reply('⚠️ 处理请求时出错'); } catch { }
      }
    });

    setupTgBotCommands(tgBot);
    startTgScheduler(tgBot);

    await tgBot.launch();
    log('tool', 'info', '[TGBot] 已启动');
  } catch (e) {
    log('tool', 'error', `[TGBot] 启动失败: ${e.message}`);
    throw e;
  }
};

const stopTgBot = () => {
  tgCronJobs.forEach(job => job.stop());
  tgCronJobs = [];
  if (tgBot) {
    try { tgBot.stop('stop'); } catch { }
    tgBot = null;
  }
  if (tgDb) {
    try { tgDb.close(); } catch { }
    tgDb = null;
  }
  log('tool', 'info', '[TGBot] 已停止');
};

const getTgBotStatus = () => ({
  enabled: config.tgbot.enabled,
  running: !!tgBot,
  hasToken: !!config.tgbot.token,
  config: {
    ...config.tgbot,
    token: config.tgbot.token ? '******' : '',
    openai: { ...config.tgbot.openai, apiKey: config.tgbot.openai.apiKey ? '******' : '' }
  }
});

let discordBot = null;
let discordReady = false;

const discordHelpers = {
  translate: tgHelpers.translate,
  generateQR: tgHelpers.generateQR,
  shortenUrl: tgHelpers.shortenUrl,
  getWeather: tgHelpers.getWeather,
  getExchangeRate: tgHelpers.getExchangeRate,

  callOpenAI: async (userMessage) => {
    const { apiBase, apiKey, model } = config.discord.openai;
    if (!apiKey) throw new Error('请先配置 OpenAI API Key');
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是一个聊天回复助手。风格轻松幽默，给出2-3个不同的回复建议。' },
          { role: 'user', content: `对方说：「${userMessage}」\n\n请给我一些回复建议：` }
        ],
        temperature: 0.8, max_tokens: 500
      })
    });
    if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);
    const data = await response.json();
    return data.choices[0]?.message?.content || '抱歉，没有生成回复';
  }
};

const handleDiscordMessage = async (message) => {
  if (message.author.id === discordBot.user.id && config.discord.mode === 'bot') return;
  if (message.author.bot && config.discord.mode === 'user') return;

  const prefix = config.discord.prefix || '>';
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  const features = config.discord.features;

  try {
    switch (commandName) {
      case 'ping': {
        const latency = Date.now() - message.createdTimestamp;
        await message.reply(`🏓 Pong! 延迟: ${latency}ms | API: ${Math.round(discordBot.ws.ping)}ms`);
        break;
      }

      case 'translate': {
        if (!features.translate) return;
        const text = args.join(' ');
        if (!text) return message.reply('❌ 用法: >translate <文本> 或 >translate <语言> <文本>');

        let targetLang = 'zh-CN', textToTranslate = text;
        if (args[0].match(/^[a-z]{2}(-[A-Z]{2})?$/i) && args.length > 1) {
          targetLang = args[0];
          textToTranslate = args.slice(1).join(' ');
        }

        const result = await discordHelpers.translate(textToTranslate, targetLang);
        if (result.success) {
          const embed = new MessageEmbed()
            .setColor('#00AE86')
            .setTitle('🌐 翻译结果')
            .addField(`📝 原文 (${result.from})`, textToTranslate.substring(0, 1000))
            .addField(`✅ 译文 (${result.to})`, result.text.substring(0, 1000));
          await message.reply({ embeds: [embed] });
        } else {
          await message.reply(`❌ 翻译失败: ${result.error}`);
        }
        break;
      }

      case 'qr': {
        if (!features.qrcode) return;
        const content = args.join(' ');
        if (!content) return message.reply('❌ 用法: >qr <内容>');
        const result = await discordHelpers.generateQR(content);
        if (result.success) {
          await message.reply({ content: `📱 二维码内容: ${content.substring(0, 100)}`, files: [result.path] });
          unlinkSync(result.path);
        } else {
          await message.reply(`❌ 生成失败: ${result.error}`);
        }
        break;
      }

      case 'short': {
        if (!features.shorten) return;
        const url = args[0];
        if (!url || !url.match(/^https?:\/\/.+/)) return message.reply('❌ 用法: >short <URL>');
        const result = await discordHelpers.shortenUrl(url);
        if (result.success) {
          const embed = new MessageEmbed()
            .setColor('#5865F2')
            .setTitle('🔗 短链接生成成功')
            .addField('📎 原链接', url)
            .addField('✅ 短链接', result.shortUrl);
          await message.reply({ embeds: [embed] });
        } else {
          await message.reply(`❌ 生成失败: ${result.error}`);
        }
        break;
      }

      case 'weather': {
        if (!features.weather) return;
        const city = args.join(' ');
        if (!city) return message.reply('❌ 用法: >weather <城市>');
        const result = await discordHelpers.getWeather(city);
        if (result.success) {
          const embed = new MessageEmbed()
            .setColor('#87CEEB')
            .setTitle(`🌤️ ${result.city}, ${result.country}`)
            .addField('☁️ 天气', result.weather, true)
            .addField('🌡️ 温度', `${result.temp}°C (体感 ${result.feelsLike}°C)`, true)
            .addField('💧 湿度', `${result.humidity}%`, true)
            .addField('💨 风速', `${result.wind} km/h ${result.windDir}`, true);
          await message.reply({ embeds: [embed] });
        } else {
          await message.reply(`❌ 查询失败: ${result.error}`);
        }
        break;
      }

      case 'rate': {
        if (!features.rate) return;
        if (args.length < 2) return message.reply('❌ 用法: >rate <源货币> <目标货币> [金额]');
        const from = args[0].toUpperCase();
        const to = args[1].toUpperCase();
        const amount = parseFloat(args[2]) || 1;
        const result = await discordHelpers.getExchangeRate(from, to, amount);
        if (result.success) {
          const embed = new MessageEmbed()
            .setColor('#FFD700')
            .setTitle('💰 汇率换算')
            .addField('📤 原币', `${result.amount} ${result.from}`, true)
            .addField('📥 目标', `${result.result} ${result.to}`, true)
            .addField('📊 汇率', `1 ${result.from} = ${result.rate} ${result.to}`);
          await message.reply({ embeds: [embed] });
        } else {
          await message.reply(`❌ 查询失败: ${result.error}`);
        }
        break;
      }

      case 'chat': {
        if (!features.chat) return;
        const msg = args.join(' ');
        if (!msg) return message.reply('❌ 用法: >chat <内容>');
        try {
          const reply = await discordHelpers.callOpenAI(msg);
          const embed = new MessageEmbed()
            .setColor('#9B59B6')
            .setTitle('💬 回复建议')
            .addField('对方说', `「${msg.substring(0, 500)}」`)
            .addField('建议回复', reply.substring(0, 1000));
          await message.reply({ embeds: [embed] });
        } catch (e) {
          await message.reply(`❌ 生成失败: ${e.message}`);
        }
        break;
      }
    }
  } catch (e) {
    log('tool', 'error', `[Discord] 命令处理错误: ${e.message}`);
  }
};

const startDiscordBot = async () => {
  if (discordBot) {
    try { discordBot.destroy(); } catch { }
    discordBot = null;
    discordReady = false;
  }

  const cfg = config.discord;
  if (!cfg.enabled || !cfg.token) return;

  try {
    discordBot = new Client({
      checkUpdate: false,
      patchVoice: true,
    });

    discordBot.once('ready', async (c) => {
      discordReady = true;
      log('tool', 'info', `[Discord] 已登录为 ${c.user.tag} (${cfg.mode === 'user' ? 'Self-bot' : 'Bot'})`);
    });

    discordBot.on('messageCreate', handleDiscordMessage);

    discordBot.on('error', (e) => {
      log('tool', 'error', `[Discord] 错误: ${e.message}`);
    });

    await discordBot.login(cfg.token);
  } catch (e) {
    log('tool', 'error', `[Discord] 启动失败: ${e.message}`);
    discordBot = null;
    discordReady = false;
    throw e;
  }
};

const stopDiscordBot = () => {
  if (discordBot) {
    try { discordBot.destroy(); } catch { }
    discordBot = null;
    discordReady = false;
  }
  log('tool', 'info', '[Discord] 已停止');
};

let automationJobs = [];

const executeTask = async (task, source = 'scheduler') => {
  const { type, params } = task;
  log('tool', 'info', `[Automation] 执行任务: ${task.name || type} (来源: ${source})`);

  try {
    if (type === 'discord_msg') {
      if (!discordBot || !discordReady) throw new Error('Discord 机器人未就绪');
      const channel = await discordBot.channels.fetch(params.channelId);
      if (!channel) throw new Error('找不到频道');
      await channel.send(params.content);
      return { success: true, message: '消息已发送' };
    }

    else if (type === 'server_control') {
      const bot = bots.get(params.serverId);
      if (!bot) throw new Error('服务器不存在');

      if (params.action === 'start' && bot.status.status === 'online') {
        return { success: true, message: '服务器已在线，跳过启动' };
      }

      await bot.sendPowerSignal(params.action);
      return { success: true, message: `已发送电源信号: ${params.action}` };
    }

    else {
      throw new Error('未知任务类型');
    }
  } catch (e) {
    log('tool', 'error', `[Automation] 任务失败: ${e.message}`);
    return { success: false, error: e.message };
  }
};

const startScheduler = () => {
  automationJobs.forEach(job => job.stop());
  automationJobs = [];

  config.automation.tasks.forEach(task => {
    if (!task.enabled || !task.cron) return;

    if (!cron.validate(task.cron)) {
      log('tool', 'error', `[Automation] 无效的 Cron 表达式: ${task.cron} (任务: ${task.name})`);
      return;
    }

    const job = cron.schedule(task.cron, () => executeTask(task));
    automationJobs.push(job);
  });

  log('tool', 'info', `[Automation] 调度器已启动，加载了 ${automationJobs.length} 个任务`);
};

const restartScheduler = () => startScheduler();

const getDiscordBotStatus = () => ({
  enabled: config.discord.enabled,
  running: discordReady,
  hasToken: !!config.discord.token,
  hasClientId: false,
  mode: config.discord.mode || 'bot',
  username: discordBot?.user?.tag || null,
  config: {
    ...config.discord,
    token: config.discord.token ? '******' : '',
    openai: { ...config.discord.openai, apiKey: config.discord.openai.apiKey ? '******' : '' }
  }
});

class FollowBehavior {
  constructor(bot, goals) {
    this.bot = bot;
    this.goals = goals;
    this.target = null;
    this.active = false;
    this.interval = null;
  }
  start(playerName) {
    const player = this.bot.players[playerName];
    if (!player?.entity) return { success: false, message: _d('5om+5LiN5Yiw546p5a62') };
    this.target = playerName;
    this.active = true;
    this.interval = setInterval(() => {
      if (!this.active || !this.bot) { this.stop(); return; }
      const t = this.bot.players[this.target];
      if (t?.entity) this.bot.pathfinder.setGoal(new this.goals.GoalFollow(t.entity, 2), true);
    }, 1000);
    return { success: true, message: _d('5byA5aeL6Lef6ZqP') + ' ' + playerName };
  }
  stop() {
    this.active = false;
    this.target = null;
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
    if (this.bot?.pathfinder) this.bot.pathfinder.stop();
    return { success: true, message: _d('5YGc5q2i6Lef6ZqP') };
  }
  getStatus() { return { active: this.active, target: this.target }; }
}

class AttackBehavior {
  constructor(bot, goals) {
    this.bot = bot;
    this.goals = goals;
    this.active = false;
    this.mode = 'hostile';
    this.interval = null;
    this.range = 4;
  }
  start(mode = 'hostile') {
    this.mode = mode;
    this.active = true;
    this.interval = setInterval(() => {
      if (!this.active || !this.bot) { this.stop(); return; }
      const target = this.findTarget();
      if (target) this.attackEntity(target);
    }, 500);
    return { success: true, message: _d('5byA5aeL6Ieq5Yqo5pS75Ye7') };
  }
  findTarget() {
    if (!this.bot) return null;
    const entities = Object.values(this.bot.entities);
    let nearest = null, nearestDist = this.range;
    for (const entity of entities) {
      if (!entity || entity === this.bot.entity) continue;
      const dist = this.bot.entity.position.distanceTo(entity.position);
      if (dist > nearestDist) continue;
      if (this.mode === 'hostile' && entity.type !== 'hostile') continue;
      if (this.mode === 'player' && entity.type !== 'player') continue;
      nearest = entity;
      nearestDist = dist;
    }
    return nearest;
  }
  attackEntity(entity) {
    if (!this.bot || !entity) return;
    try {
      this.bot.lookAt(entity.position.offset(0, entity.height * 0.85, 0));
      this.bot.attack(entity);
    } catch (e) {}
  }
  stop() {
    this.active = false;
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
    return { success: true, message: _d('5YGc5q2i5pS75Ye7') };
  }
  getStatus() { return { active: this.active, mode: this.mode, range: this.range }; }
}

class PatrolBehavior {
  constructor(bot, goals, logFn = null) {
    this.bot = bot;
    this.goals = goals;
    this.log = logFn;
    this.active = false;
    this.centerPos = null;
    this.isMoving = false;
    this.patrolInterval = null;
    this.moveTimeout = null;
    this.radius = 12;
  }
  start() {
    this.cleanup();
    if (!this.bot?.entity) return { success: false, message: _d('5py65Zmo5Lq65pyq5bCx57uq') };
    this.active = true;
    this.isMoving = false;
    try {
      this.centerPos = this.bot.entity.position.clone();
    } catch (e) { this.active = false; return { success: false, message: e.message }; }
    this.bot.on('goal_reached', () => { this.clearMoveTimeout(); this.isMoving = false; });
    this.bot.on('path_stop', () => { this.clearMoveTimeout(); this.isMoving = false; });
    this.patrolInterval = setInterval(() => {
      if (!this.active || !this.bot?.entity) return;
      if (!this.isMoving) this.doMove();
    }, 5000);
    this.doMove();
    return { success: true, message: _d('5byA5aeL5beh6YC7') };
  }
  clearMoveTimeout() { if (this.moveTimeout) { clearTimeout(this.moveTimeout); this.moveTimeout = null; } }
  doMove() {
    if (!this.active || !this.bot?.entity || this.isMoving) return;
    if (!this.centerPos) try { this.centerPos = this.bot.entity.position.clone(); } catch (e) { return; }
    this.isMoving = true;
    this.clearMoveTimeout();
    this.moveTimeout = setTimeout(() => { if (this.isMoving && this.active) { this.isMoving = false; if (this.bot?.pathfinder) this.bot.pathfinder.stop(); } }, 10000);
    const targetPos = this.centerPos.offset((Math.random() - 0.5) * this.radius, 0, (Math.random() - 0.5) * this.radius);
    this.bot.pathfinder.setGoal(new this.goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 1));
  }
  cleanup() {
    if (this.patrolInterval) { clearInterval(this.patrolInterval); this.patrolInterval = null; }
    this.clearMoveTimeout();
  }
  stop() {
    this.active = false;
    this.isMoving = false;
    this.cleanup();
    if (this.bot?.pathfinder) this.bot.pathfinder.setGoal(null);
    return { success: true, message: _d('5YGc5q2i5beh6YC7') };
  }
  getStatus() { return { active: this.active, isMoving: this.isMoving, radius: this.radius }; }
}

class MiningBehavior {
  constructor(bot) {
    this.bot = bot;
    this.active = false;
    this.targetBlocks = ['coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'emerald_ore'];
    this.range = 32;
  }
  start(blockTypes = null) {
    if (blockTypes) this.targetBlocks = blockTypes;
    this.active = true;
    this.mineLoop();
    return { success: true, message: _d('5byA5aeL5oyW55+/') };
  }
  async mineLoop() {
    while (this.active && this.bot) {
      try {
        const block = this.findOre();
        if (block) await this.mineBlock(block);
        else await new Promise(r => setTimeout(r, 5000));
      } catch (e) { await new Promise(r => setTimeout(r, 2000)); }
    }
  }
  findOre() {
    if (!this.bot) return null;
    for (const blockName of this.targetBlocks) {
      const blockId = this.bot.registry.blocksByName[blockName]?.id;
      if (!blockId) continue;
      const block = this.bot.findBlock({ matching: blockId, maxDistance: this.range });
      if (block) return block;
    }
    return null;
  }
  async mineBlock(block) {
    if (!this.bot || !block) return;
    try {
      await this.bot.pathfinder.goto(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 2));
      await this.bot.lookAt(block.position);
      await this.bot.dig(block);
    } catch (e) {}
  }
  stop() {
    this.active = false;
    if (this.bot) this.bot.stopDigging();
    return { success: true, message: _d('5YGc5q2i5oyW55+/') };
  }
  getStatus() { return { active: this.active, targetBlocks: this.targetBlocks, range: this.range }; }
}

class AiViewBehavior {
  constructor(bot) {
    this.bot = bot;
    this.active = false;
    this.interval = null;
    this.range = 16;
    this.lastTarget = null;
  }
  start() {
    if (this.active) return { success: false, message: 'AI' + _d('6KeG6KeS5bey5Zyo6L+Q6KGM') };
    this.active = true;
    this.interval = setInterval(() => {
      if (!this.active || !this.bot?.entity) return;
      const target = this.bot.nearestEntity(entity => {
        if (!entity || entity === this.bot.entity) return false;
        if (entity.type !== 'player') return false;
        return this.bot.entity.position.distanceTo(entity.position) <= this.range;
      });
      if (target) {
        try {
          this.bot.lookAt(target.position.offset(0, target.height * 0.85, 0));
          this.lastTarget = target.username || target.name || 'unknown';
        } catch (e) {}
      } else this.lastTarget = null;
    }, 500);
    return { success: true, message: 'AI' + _d('6KeG6KeS5bey5byA5ZCv') };
  }
  stop() {
    this.active = false;
    this.lastTarget = null;
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
    return { success: true, message: 'AI' + _d('6KeG6KeS5bey5YWz6Zet') };
  }
  getStatus() { return { active: this.active, range: this.range, lastTarget: this.lastTarget }; }
}

class ActionBehavior {
  constructor(bot) {
    this.bot = bot;
  }
  jump() {
    if (!this.bot) return;
    this.bot.setControlState('jump', true);
    setTimeout(() => { if (this.bot) this.bot.setControlState('jump', false); }, 100);
    return { success: true, message: _d('6Lez6LeD') };
  }
  sneak(enabled = true) {
    if (!this.bot) return;
    this.bot.setControlState('sneak', enabled);
    return { success: true, message: enabled ? _d('6Lmy5LiL') : _d('56uZ6LW3') };
  }
  sprint(enabled = true) {
    if (!this.bot) return;
    this.bot.setControlState('sprint', enabled);
    return { success: true, message: enabled ? _d('5Yay5Yi6') : _d('5YGc5q2i5Yay5Yi6') };
  }
  useItem() {
    if (!this.bot) return;
    this.bot.activateItem();
    return { success: true, message: _d('5L2/55So54mp5ZOB') };
  }
  swing() {
    if (!this.bot) return;
    this.bot.swingArm();
    return { success: true, message: _d('5oyl5Yqo5omL6IeC') };
  }
  lookAt(x, y, z) {
    if (!this.bot) return;
    this.bot.lookAt({ x, y, z });
    return { success: true, message: _d('55yL5ZCR') + ` (${x}, ${y}, ${z})` };
  }
}

class BehaviorManager {
  constructor(bot, goals, logFn = null) {
    this.bot = bot;
    this.goals = goals;
    this.log = logFn;
    this.follow = new FollowBehavior(bot, goals);
    this.attack = new AttackBehavior(bot, goals);
    this.patrol = new PatrolBehavior(bot, goals, logFn);
    this.mining = new MiningBehavior(bot);
    this.action = new ActionBehavior(bot);
    this.aiView = new AiViewBehavior(bot);
  }
  stopAll() {
    this.follow.stop();
    this.attack.stop();
    this.patrol.stop();
    this.mining.stop();
    this.aiView.stop();
    return { success: true, message: _d('5bey5YGc5q2i5omA5pyJ6KGM5Li6') };
  }
  getStatus() {
    return {
      follow: this.follow.getStatus(),
      attack: this.attack.getStatus(),
      patrol: this.patrol.getStatus(),
      mining: this.mining.getStatus(),
      aiView: this.aiView.getStatus()
    };
  }
}

const bots = new Map();

class BotInstance {
  constructor(serverConfig) {
    this.id = serverConfig.id;
    this.config = serverConfig;
    this.bot = null;
    this.behaviors = null;
    this.destroyed = false;
    this.activityMonitorInterval = null;
    this.autoChatInterval = null;
    this.restartCommandTimer = null;
    this.lastActivity = Date.now();
    this.spawnPosition = null;
    this.hasAutoOpped = false;
    this.logs = [];
    this.status = {
      connected: false,
      type: serverConfig.type || 'minecraft',
      health: 0,
      food: 0,
      position: null,
      players: [],
      username: '',
      restartTimer: serverConfig.restartTimer || { enabled: false, intervalMinutes: 0, nextRestart: null, command: '/restart' },
      autoOp: serverConfig.autoOp !== false
    };
    this.modes = {
      aiView: false,
      patrol: false,
      autoChat: serverConfig.autoChat?.enabled || false,
      autoAttack: false,
      follow: false,
      mining: false,
      invincible: false
    };
    if (serverConfig.modes) Object.assign(this.modes, serverConfig.modes);
    this.autoChatConfig = serverConfig.autoChat || { enabled: false, interval: 60000, messages: ['Hello!'] };
    this.commands = {
      '!help': this.cmdHelp.bind(this),
      '!come': this.cmdCome.bind(this),
      '!follow': this.cmdFollow.bind(this),
      '!stop': this.cmdStop.bind(this),
      '!pos': this.cmdPosition.bind(this),
      '!attack': this.cmdAttack.bind(this),
      '!patrol': this.cmdPatrol.bind(this),
      '!god': this.cmdGod.bind(this),
      '!mine': this.cmdMine.bind(this),
      '!jump': this.cmdJump.bind(this),
      '!sneak': this.cmdSneak.bind(this)
    };
  }

  log(type, msg) {
    this.logs.push({ time: new Date().toISOString(), type, msg });
    if (this.logs.length > 100) this.logs.shift();
    log('bot', type === 'error' ? 'error' : 'info', `[Bot:${this.id}] ${msg}`);
  }

  updateActivity() { this.lastActivity = Date.now(); }

  cleanup() {
    if (this.activityMonitorInterval) { clearInterval(this.activityMonitorInterval); this.activityMonitorInterval = null; }
    if (this.autoChatInterval) { clearInterval(this.autoChatInterval); this.autoChatInterval = null; }
    if (this.restartCommandTimer) { clearInterval(this.restartCommandTimer); this.restartCommandTimer = null; }
    if (this.behaviors) { this.behaviors.stopAll(); this.behaviors = null; }
    if (this.bot) {
      try {
        this.bot.removeAllListeners();
        if (this.bot._client) this.bot._client.removeAllListeners();
        if (typeof this.bot.quit === 'function') this.bot.quit();
        else if (typeof this.bot.end === 'function') this.bot.end();
      } catch (e) {}
      this.bot = null;
    }
    this.status.connected = false;
  }

  startActivityMonitor() {
    if (this.activityMonitorInterval) clearInterval(this.activityMonitorInterval);
    this.activityMonitorInterval = setInterval(() => {
      if (Date.now() - this.lastActivity > 60000) {
        this.log('warning', _d('Qm90IOaXoOWTjeW6lO+8jOiHquWKqOWIt+aWsC4uLg=='));
        this.autoRefreshReconnect();
      }
    }, 10000);
  }

  autoRefreshReconnect() {
    if (this.destroyed) return;
    this.log('warning', _d('5qOA5rWL5Yiw5byC5bi477yM6Ieq5Yqo5Yi35paw6YeN6L+eLi4u'));
    this.softDisconnect();
    setTimeout(async () => {
      if (this.destroyed) return;
      try {
        await this.connect();
        this.log('success', _d('6Ieq5Yqo5Yi35paw6YeN6L+e5oiQ5Yqf'));
      } catch (err) {
        this.log('error', _d('6Ieq5Yqo5Yi35paw6YeN6L+e5aSx6LSlOiA=') + err.message);
        setTimeout(() => { if (!this.destroyed) this.autoRefreshReconnect(); }, 3000);
      }
    }, 1000);
  }

  softDisconnect() {
    this.status.connected = false;
    this.cleanup();
    this.log('info', _d('5q2j5Zyo5Yi35paw6L+e5o6lLi4u'));
    broadcast('botStatus', this.getStatus());
  }

  async connect() {
    if (this.status.type === 'panel') { this.log('info', _d('6Z2i5p2/5qih5byP77yM6Lez6L+H5py65Zmo5Lq66L+e5o6l')); return; }
    if (this.bot && this.status.connected) { this.log('warning', _d('5bey5pyJ5rS75Yqo6L+e5o6l')); return; }
    if (this.bot) this.cleanup();
    await new Promise(r => setTimeout(r, 200));
    const { host, port, username, version } = this.config;
    if (!host) throw new Error(_d('5pyq6YWN572u5pyN5Yqh5Zmo5Zyw5Z2A'));
    const botUsername = username || `Bot_${Math.random().toString(36).slice(2, 8)}`;
    this.status.username = botUsername;
    this.log('info', _d('5q2j5Zyo6L+e5o6lIA==') + `${host}:${port || 25565}`);
    return new Promise((resolve, reject) => {
      try {
        this.bot = mineflayer.createBot({
          host, port: port || 25565, username: botUsername, version: version || undefined,
          auth: 'offline', connectTimeout: 15000, checkTimeoutInterval: 60000
        });
        const connectionTimeout = setTimeout(() => {
          if (this.bot && !this.status.connected) {
            this.log('error', _d('6L+e5o6l6LaF5pe277yM6Ieq5Yqo5Yi35paw6YeN6L+e'));
            this.autoRefreshReconnect();
            reject(new Error('Connection timeout'));
          }
        }, 15000);
        this.bot.loadPlugin(pathfinder);
        this.bot._client.on('error', (err) => { 
          this.log('error', 'Client: ' + err.message); 
          if (!this.status.connected) this.autoRefreshReconnect();
        });
        this.bot._client.on('end', () => {
          if (!this.status.connected && !this.destroyed) this.autoRefreshReconnect();
        });
        this.bot.on('login', () => {
          this.log('success', _d('55m75b2V5oiQ5YqfIA==') + `(${botUsername})`);
          clearTimeout(connectionTimeout);
          this.updateActivity();
          this.startActivityMonitor();
          if (this.modes.autoChat) this.startAutoChat();
        });
        this.bot.once('spawn', () => {
          this.status.connected = true;
          if (this.bot.entity) this.spawnPosition = this.bot.entity.position.clone();
          try {
            const movements = new Movements(this.bot, this.bot.registry);
            movements.canDig = false;
            this.bot.pathfinder.setMovements(movements);
          } catch (e) { this.log('warning', _d('6Lev5b6E6KeE5YiS5Yid5aeL5YyW5aSx6LSlOiA=') + e.message); }
          this.behaviors = new BehaviorManager(this.bot, goals, this.log.bind(this));
          this.log('success', _d('6L+b5YWl5LiW55WMIA==') + `(${this.bot.version})`);
          this.restoreModes();
          if (this.status.autoOp && this.config.pterodactyl && !this.hasAutoOpped) this.autoOpSelf();
          broadcast('botStatus', this.getStatus());
          resolve();
        });
        this.bot.on('health', () => {
          this.status.health = this.bot.health;
          this.status.food = this.bot.food;
          this.updateActivity();
        });
        this.bot.on('death', () => {
          this.log('warning', _d('5py65Zmo5Lq65q275Lqh77yM5q2j5Zyo6YeN55Sf'));
          if (this.behaviors) try { this.behaviors.stopAll(); } catch (e) {}
          setTimeout(() => { if (this.bot) try { this.bot.respawn(); } catch (e) {} }, 500);
        });
        this.bot.on('respawn', () => {
          this.log('info', _d('5bey6YeN55Sf'));
          if (this.bot?.entity) this.spawnPosition = this.bot.entity.position.clone();
        });
        this.bot.on('move', () => {
          if (this.bot?.entity) {
            this.status.position = { x: Math.floor(this.bot.entity.position.x), y: Math.floor(this.bot.entity.position.y), z: Math.floor(this.bot.entity.position.z) };
            this.updateActivity();
          }
        });
        this.bot.on('playerJoined', (player) => {
          if (this.bot) { this.status.players = Object.keys(this.bot.players); this.log('info', `${player.username} ` + _d('5Yqg5YWl')); }
        });
        this.bot.on('playerLeft', () => { if (this.bot) this.status.players = Object.keys(this.bot.players); });
        this.bot.on('chat', async (chatUsername, message) => {
          if (!this.bot || chatUsername === this.bot.username) return;
          this.updateActivity();
          this.log('chat', `${chatUsername}: ${message}`);
          if (message.startsWith('!')) await this.handleCommand(chatUsername, message);
        });
        this.bot.on('error', (err) => { this.log('error', err.message); this.autoRefreshReconnect(); });
        this.bot.on('kicked', (reason) => {
          this.log('error', _d('6KKr6Lii5Ye6OiA=') + reason);
          this.status.connected = false;
          broadcast('botStatus', this.getStatus());
          this.autoRefreshReconnect();
        });
        this.bot.on('end', () => {
          this.log('warning', _d('6L+e5o6l5pat5byA'));
          this.status.connected = false;
          this.bot = null;
          broadcast('botStatus', this.getStatus());
          if (!this.destroyed) this.autoRefreshReconnect();
        });
      } catch (error) {
        this.log('error', _d('6L+e5o6l5aSx6LSlOiA=') + error.message);
        this.autoRefreshReconnect();
        reject(error);
      }
    });
  }

  disconnect() {
    this.destroyed = true;
    this.cleanup();
    this.log('info', _d('5bey5pat5byA'));
    broadcast('botStatus', this.getStatus());
  }

  getStatus() {
    return {
      id: this.id,
      name: this.config.name,
      ...this.status,
      ...this.config,
      modes: this.modes,
      autoChat: this.autoChatConfig,
      behaviors: this.behaviors?.getStatus() || null
    };
  }

  chat(msg) {
    if (this.bot && this.status.connected) {
      this.bot.chat(msg);
      this.log('chat', msg);
    }
  }

  startAutoChat() {
    if (this.autoChatInterval) clearInterval(this.autoChatInterval);
    const messages = this.autoChatConfig.messages || ['Hello!'];
    const interval = this.autoChatConfig.interval || 60000;
    this.autoChatInterval = setInterval(() => {
      if (this.bot && this.modes.autoChat) {
        const msg = messages[Math.floor(Math.random() * messages.length)];
        this.bot.chat(msg);
        this.log('chat', `[${_d('6Ieq5Yqo')}] ${msg}`);
      }
    }, interval);
  }

  updateAutoChatConfig(cfg) {
    this.autoChatConfig = { ...this.autoChatConfig, ...cfg };
    if (this.modes.autoChat) this.startAutoChat();
    this.saveConfig();
    return this.autoChatConfig;
  }

  saveConfig() {
    const idx = config.servers.findIndex(s => s.id === this.id);
    if (idx >= 0) {
      config.servers[idx] = { ...config.servers[idx], modes: this.modes, autoChat: this.autoChatConfig, restartTimer: this.status.restartTimer, autoOp: this.status.autoOp };
      saveConfig();
    }
  }

  restoreModes() {
    if (!this.bot || !this.behaviors) return;
    setTimeout(() => {
      try { if (this.modes.aiView) { this.behaviors.aiView.start(); this.log('info', 'AI' + _d('6KeG6KeS5bey5oGi5aSN')); } } catch (e) {}
      try {
        if (this.modes.patrol) {
          if (this.spawnPosition) this.behaviors.patrol.centerPos = this.spawnPosition.clone();
          const result = this.behaviors.patrol.start();
          if (!result.success) this.modes.patrol = false;
          else this.log('info', _d('5beh6YC75qih5byP5bey5oGi5aSN'));
        }
      } catch (e) { this.modes.patrol = false; }
      try { if (this.modes.autoAttack) { this.behaviors.attack.start(); this.log('info', _d('6Ieq5Yqo5pS75Ye75bey5oGi5aSN')); } } catch (e) {}
      try { if (this.modes.invincible) this.applyInvincibleMode(); } catch (e) {}
      try { if (this.modes.autoChat) { this.startAutoChat(); this.log('info', _d('6Ieq5Yqo5Zac6K+d5bey5oGi5aSN')); } } catch (e) {}
    }, 2000);
  }

  setMode(mode, enabled) {
    if (!(mode in this.modes)) return;
    this.modes[mode] = enabled;
    if (mode === 'autoChat') { if (enabled) this.startAutoChat(); else if (this.autoChatInterval) { clearInterval(this.autoChatInterval); this.autoChatInterval = null; } }
    if (mode === 'aiView' && this.behaviors) { if (enabled) this.behaviors.aiView.start(); else this.behaviors.aiView.stop(); }
    if (mode === 'patrol' && this.behaviors) {
      if (enabled) { if (this.spawnPosition) this.behaviors.patrol.centerPos = this.spawnPosition.clone(); this.behaviors.patrol.start(); }
      else this.behaviors.patrol.stop();
    }
    if (mode === 'invincible' && this.bot) { if (enabled) this.applyInvincibleMode(); else this.disableInvincibleMode(); }
    this.saveConfig();
    broadcast('botStatus', this.getStatus());
  }

  setRestartTimer(minutes) {
    if (this.restartCommandTimer) { clearInterval(this.restartCommandTimer); this.restartCommandTimer = null; }
    if (minutes > 0 && this.bot) {
      const intervalMs = minutes * 60 * 1000;
      this.status.restartTimer = { enabled: true, intervalMinutes: minutes, nextRestart: new Date(Date.now() + intervalMs).toISOString(), command: '/restart' };
      this.restartCommandTimer = setInterval(() => {
        if (this.bot && this.status.connected) {
          this.bot.chat('/restart');
          this.log('info', _d('5omn6KGM5a6a5pe26YeN5ZCv5ZG95LukIC9yZXN0YXJ0'));
          this.status.restartTimer.nextRestart = new Date(Date.now() + intervalMs).toISOString();
        }
      }, intervalMs);
      this.log('info', _d('5a6a5pe26YeN5ZCv5bey6K6+572uOiDmr48g') + minutes + _d('IOWIhumSn+aJp+ihjCAvyZVyZXN0YXJ0'));
    } else {
      this.status.restartTimer = { enabled: false, intervalMinutes: 0, nextRestart: null, command: '/restart' };
      this.log('info', _d('5a6a5pe26YeN5ZCv5bey56aB55So'));
    }
    this.saveConfig();
    broadcast('botStatus', this.getStatus());
    return this.status.restartTimer;
  }

  sendRestartCommand() {
    if (this.bot && this.status.connected) {
      this.bot.chat('/restart');
      this.log('info', _d('56uL5Y2z5Y+R6YCBIC9yZXN0YXJ0IOWRveS7pA=='));
      return { success: true, message: _d('5bey5Y+R6YCBIC9yZXN0YXJ0') };
    }
    return { success: false, message: 'Bot ' + _d('5pyq6L+e5o6l') };
  }

  async autoOpSelf() {
    if (!this.status.username) return { success: false, message: _d('5pyq6I635Y+W55So5oi35ZCN') };
    const result = await this.sendCommand(`op ${this.status.username}`);
    if (result.success) { this.hasAutoOpped = true; this.log('success', _d('5bey6Ieq5Yqo5o6I5LqIIE9QIOadg+mZkDog') + this.status.username); }
    return result;
  }

  async applyInvincibleMode() {
    if (!this.bot || !this.status.username) return;
    if (this.config.pterodactyl?.url && this.config.pterodactyl?.apiKey) {
      const result = await this.sendCommand(`gamemode creative ${this.status.username}`);
      if (result.success) { this.log('success', _d('5peg5pWM5qih5byP5bey5byA5ZCvICjliJvpgKDmqKHlvI8gLSDpgJrov4fpnaLmnb8p')); return; }
    }
    this.bot.chat('/gamemode creative');
    this.log('info', _d('5peg5pWM5qih5byP5ZG95Luk5bey5Y+R6YCBICjliJvpgKDmqKHlvI8p'));
  }

  async disableInvincibleMode() {
    if (!this.bot || !this.status.username) return;
    if (this.config.pterodactyl?.url && this.config.pterodactyl?.apiKey) {
      const result = await this.sendCommand(`gamemode survival ${this.status.username}`);
      if (result.success) { this.log('success', _d('5peg5pWM5qih5byP5bey5YWz6ZetICjnlJ/lrZjmqKHlvI8gLSDpgJrov4fpnaLmnb8p')); return; }
    }
    this.bot.chat('/gamemode survival');
    this.log('info', _d('5peg5pWM5qih5byP5bey5YWz6ZetICjnlJ/lrZjmqKHlvI8p'));
  }

  async panelRequest(path, method = 'GET', body = null) {
    const { pterodactyl } = this.config;
    if (!pterodactyl?.url || !pterodactyl?.apiKey || !pterodactyl?.serverId) throw new Error(_d('5pyq6YWN572u57+86b6Z6Z2i5p2/'));
    const url = `${pterodactyl.url}/api/client/servers/${pterodactyl.serverId}${path}`;
    const res = await fetch(url, {
      method,
      headers: { 'Authorization': `Bearer ${pterodactyl.apiKey}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: body ? JSON.stringify(body) : null
    });
    if (!res.ok) throw new Error(`Panel API error: ${res.status}`);
    return res.json();
  }

  async sendPowerSignal(signal) {
    await this.panelRequest('/power', 'POST', { signal });
    this.log('info', _d('5Y+R6YCB55S15rqQ5L+h5Y+3OiA=') + signal);
    return { success: true };
  }

  async sendCommand(cmd) {
    try {
      await this.panelRequest('/command', 'POST', { command: cmd });
      this.log('info', _d('5omn6KGM5ZG95LukOiA=') + cmd);
      return { success: true };
    } catch (err) {
      this.log('error', _d('5ZG95Luk5aSx6LSlOiA=') + err.message);
      return { success: false, message: err.message };
    }
  }

  async handleCommand(username, message) {
    const parts = message.trim().split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    if (this.commands[cmd]) try { await this.commands[cmd](username, args); } catch (error) { this.log('error', _d('5oyH5Luk5aSx6LSlOiA=') + error.message); }
  }

  cmdHelp() {
    if (!this.bot) return;
    const helpLines = ['!help - ' + _d('5biu5Yqp'), '!come - ' + _d('6L+H5p2l'), '!follow [' + _d('546p5a62') + '] - ' + _d('6Lef6ZqP'), '!stop - ' + _d('5YGc5q2i5omA5pyJ6KGM5Li6'), '!pos - ' + _d('5L2N572u'), '!attack [hostile/all] - ' + _d('6Ieq5Yqo5pS75Ye7'), '!patrol - ' + _d('6ZqP5py65beh6YC7'), '!god - ' + _d('5peg5pWM5qih5byP'), '!mine - ' + _d('6Ieq5Yqo5oyW55+/'), '!jump - ' + _d('6Lez6LeD'), '!sneak - ' + _d('6Lmy5LiLL+ermeW8gQ==')];
    helpLines.forEach(line => this.bot.chat(line));
  }

  async cmdCome(username) {
    if (!this.bot) return;
    const player = this.bot.players[username];
    if (!player?.entity) { this.bot.chat(_d('5om+5LiN5Yiw5L2g')); return; }
    const goal = new goals.GoalNear(player.entity.position.x, player.entity.position.y, player.entity.position.z, 2);
    this.bot.pathfinder.setGoal(goal);
    this.bot.chat(_d('5q2j5Zyo6LWw5ZCRIA==') + username);
  }

  cmdFollow(username, args) {
    if (!this.bot || !this.behaviors) return;
    const targetName = args[0] || username;
    if (this.modes.follow) { this.behaviors.follow.stop(); this.modes.follow = false; this.bot.chat(_d('5YGc5q2i6Lef6ZqP')); }
    else {
      const result = this.behaviors.follow.start(targetName);
      if (result.success) { this.modes.follow = true; this.bot.chat(result.message); }
      else this.bot.chat(result.message);
    }
    broadcast('botStatus', this.getStatus());
  }

  cmdStop() {
    if (!this.bot) return;
    if (this.behaviors) this.behaviors.stopAll();
    this.bot.pathfinder.stop();
    this.modes.follow = false;
    this.modes.autoAttack = false;
    this.modes.patrol = false;
    this.modes.mining = false;
    this.bot.chat(_d('5bey5YGc5q2i5omA5pyJ6KGM5Li6'));
    broadcast('botStatus', this.getStatus());
  }

  cmdPosition() {
    if (!this.bot) return;
    const pos = this.bot.entity.position;
    this.bot.chat(`X=${Math.floor(pos.x)} Y=${Math.floor(pos.y)} Z=${Math.floor(pos.z)}`);
  }

  cmdAttack(username, args) {
    if (!this.bot || !this.behaviors) return;
    if (this.modes.autoAttack) { this.behaviors.attack.stop(); this.modes.autoAttack = false; this.bot.chat(_d('5YGc5q2i5pS75Ye7')); }
    else {
      const mode = args[0] || 'hostile';
      this.behaviors.attack.start(mode);
      this.modes.autoAttack = true;
      this.bot.chat(_d('5byA5aeL6Ieq5Yqo5pS75Ye7'));
    }
    broadcast('botStatus', this.getStatus());
  }

  cmdPatrol() {
    if (!this.bot || !this.behaviors) return;
    if (this.modes.patrol) { this.behaviors.patrol.stop(); this.modes.patrol = false; this.bot.chat(_d('5YGc5q2i5beh6YC7')); }
    else { this.behaviors.patrol.start(); this.modes.patrol = true; this.bot.chat(_d('5byA5aeL5beh6YC7')); }
    broadcast('botStatus', this.getStatus());
  }

  cmdGod() {
    if (!this.bot) return;
    if (this.modes.invincible) { this.disableInvincibleMode(); this.modes.invincible = false; this.bot.chat(_d('5peg5pWM5qih5byP5bey5YWz6Zet')); }
    else { this.applyInvincibleMode(); this.modes.invincible = true; this.bot.chat(_d('5peg5pWM5qih5byP5bey5byA5ZCv')); }
    this.saveConfig();
    broadcast('botStatus', this.getStatus());
  }

  cmdMine() {
    if (!this.bot || !this.behaviors) return;
    if (this.modes.mining) { this.behaviors.mining.stop(); this.modes.mining = false; this.bot.chat(_d('5YGc5q2i5oyW55+/')); }
    else { this.behaviors.mining.start(); this.modes.mining = true; this.bot.chat(_d('5byA5aeL5oyW55+/')); }
    broadcast('botStatus', this.getStatus());
  }

  cmdJump() {
    if (!this.bot || !this.behaviors) return;
    this.behaviors.action.jump();
    this.bot.chat(_d('6Lez'));
  }

  cmdSneak() {
    if (!this.bot || !this.behaviors) return;
    const sneaking = this.bot.getControlState('sneak');
    this.behaviors.action.sneak(!sneaking);
    this.bot.chat(sneaking ? _d('56uZ6LW3') : _d('6Lmy5LiL'));
  }

  setBehavior(behavior, enabled, options = {}) {
    if (!this.behaviors) return { success: false, message: 'Bot ' + _d('5pyq6L+e5o6l') };
    let result;
    switch (behavior) {
      case 'follow':
        if (enabled) { result = this.behaviors.follow.start(options.target); this.modes.follow = result.success; }
        else { result = this.behaviors.follow.stop(); this.modes.follow = false; }
        break;
      case 'attack':
        if (enabled) { result = this.behaviors.attack.start(options.mode || 'hostile'); this.modes.autoAttack = true; }
        else { result = this.behaviors.attack.stop(); this.modes.autoAttack = false; }
        break;
      case 'patrol':
        if (enabled) { result = this.behaviors.patrol.start(); this.modes.patrol = true; }
        else { result = this.behaviors.patrol.stop(); this.modes.patrol = false; }
        break;
      case 'mining':
        if (enabled) { result = this.behaviors.mining.start(options.blocks); this.modes.mining = true; }
        else { result = this.behaviors.mining.stop(); this.modes.mining = false; }
        break;
      default: result = { success: false, message: _d('5pyq55+l6KGM5Li6') };
    }
    broadcast('botStatus', this.getStatus());
    return result;
  }

  doAction(action, params = {}) {
    if (!this.behaviors) return { success: false, message: 'Bot ' + _d('5pyq6L+e5o6l') };
    switch (action) {
      case 'jump': return this.behaviors.action.jump();
      case 'sneak': return this.behaviors.action.sneak(params.enabled);
      case 'sprint': return this.behaviors.action.sprint(params.enabled);
      case 'useItem': return this.behaviors.action.useItem();
      case 'swing': return this.behaviors.action.swing();
      case 'lookAt': return this.behaviors.action.lookAt(params.x, params.y, params.z);
      default: return { success: false, message: _d('5pyq55+l5Yqo5L2c') };
    }
  }

  async getSftpClient() {
    const { sftp } = this.config;
    if (!sftp?.host) throw new Error(_d('5pyq6YWN572uIFNGVFA='));
    const client = new SftpClient();
    await client.connect({
      host: sftp.host,
      port: sftp.port || 22,
      username: sftp.username,
      password: sftp.password || undefined,
      privateKey: sftp.privateKey || undefined
    });
    return client;
  }

  async listFiles(dir = '/') {
    if (this.config.fileAccessType === 'sftp') return this.listFilesSftp(dir);
    return this.listFilesPtero(dir);
  }

  async listFilesPtero(dir = '/') {
    try {
      const res = await this.panelRequest(`/files/list?directory=${encodeURIComponent(dir)}`);
      const files = res.data.map(item => ({
        name: item.attributes.name,
        size: item.attributes.size,
        isFile: item.attributes.is_file,
        isEditable: item.attributes.is_editable,
        modifiedAt: item.attributes.modified_at
      }));
      return files;
    } catch (err) {
      throw new Error(_d('5YiX5Ye65paH5Lu25aSx6LSlOiA=') + err.message);
    }
  }

  async listFilesSftp(dir = '/') {
    const client = await this.getSftpClient();
    try {
      const basePath = this.config.sftp?.basePath || '/';
      const fullPath = dir.startsWith('/') ? dir : join(basePath, dir);
      const list = await client.list(fullPath);
      return list.map(f => ({
        name: f.name,
        size: f.size,
        isFile: f.type === '-',
        isEditable: f.type === '-' && f.size < 10 * 1024 * 1024,
        modifiedAt: new Date(f.modifyTime).toISOString()
      }));
    } finally {
      await client.end();
    }
  }

  async readFile(path) {
    if (this.config.fileAccessType === 'sftp') return this.readFileSftp(path);
    return this.readFilePtero(path);
  }

  async readFilePtero(path) {
    try {
      const res = await this.panelRequest(`/files/contents?file=${encodeURIComponent(path)}`);
      return res;
    } catch (err) {
      throw new Error(_d('6K+75Y+W5paH5Lu25aSx6LSlOiA=') + err.message);
    }
  }

  async readFileSftp(path) {
    const client = await this.getSftpClient();
    try {
      const basePath = this.config.sftp?.basePath || '/';
      const fullPath = path.startsWith('/') ? path : join(basePath, path);
      return await client.get(fullPath);
    } finally {
      await client.end();
    }
  }

  async writeFile(path, content) {
    if (this.config.fileAccessType === 'sftp') return this.writeFileSftp(path, content);
    return this.writeFilePtero(path, content);
  }

  async writeFilePtero(path, content) {
    const { pterodactyl } = this.config;
    if (!pterodactyl?.url || !pterodactyl?.apiKey || !pterodactyl?.serverId) throw new Error(_d('5pyq6YWN572u57+86b6Z6Z2i5p2/'));
    const url = `${pterodactyl.url}/api/client/servers/${pterodactyl.serverId}/files/write?file=${encodeURIComponent(path)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${pterodactyl.apiKey}`, 'Content-Type': 'text/plain', 'Accept': 'application/json' },
      body: content
    });
    if (!res.ok) throw new Error(`Panel API error: ${res.status}`);
    this.log('success', _d('5paH5Lu25bey5L+d5a2YOiA=') + path);
    return { success: true };
  }

  async writeFileSftp(path, content) {
    const client = await this.getSftpClient();
    try {
      const basePath = this.config.sftp?.basePath || '/';
      const fullPath = path.startsWith('/') ? path : join(basePath, path);
      await client.put(Buffer.from(content), fullPath);
      this.log('success', _d('5paH5Lu25bey5L+d5a2YOiA=') + path);
      return { success: true };
    } finally {
      await client.end();
    }
  }

  async createFolder(root, name) {
    if (this.config.fileAccessType === 'sftp') {
      const client = await this.getSftpClient();
      try {
        const basePath = this.config.sftp?.basePath || '/';
        const fullPath = join(basePath, root, name);
        await client.mkdir(fullPath, true);
        return { success: true };
      } finally {
        await client.end();
      }
    }
    await this.panelRequest('/files/create-folder', 'POST', { root, name });
    return { success: true };
  }

  async deleteFiles(root, files) {
    if (this.config.fileAccessType === 'sftp') {
      const client = await this.getSftpClient();
      try {
        const basePath = this.config.sftp?.basePath || '/';
        for (const fileName of files) {
          const fullPath = join(basePath, root, fileName);
          try {
            const stat = await client.stat(fullPath);
            if (stat.isDirectory) await client.rmdir(fullPath, true);
            else await client.delete(fullPath);
          } catch (e) {}
        }
        return { success: true };
      } finally {
        await client.end();
      }
    }
    await this.panelRequest('/files/delete', 'POST', { root, files });
    return { success: true };
  }

  async renameFile(root, from, to) {
    if (this.config.fileAccessType === 'sftp') {
      const client = await this.getSftpClient();
      try {
        const basePath = this.config.sftp?.basePath || '/';
        const fromPath = join(basePath, root, from);
        const toPath = join(basePath, root, to);
        await client.rename(fromPath, toPath);
        return { success: true };
      } finally {
        await client.end();
      }
    }
    await this.panelRequest('/files/rename', 'PUT', { root, files: [{ from, to }] });
    return { success: true };
  }
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.text({ limit: '10mb' }));

const clients = new Set();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  if (!verifyToken(token)) {
    ws.close(1008, 'Unauthorized');
    return;
  }
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});

const broadcast = (type, data) => {
  const msg = JSON.stringify({ type, data });
  clients.forEach(c => c.readyState === 1 && c.send(msg));
};

const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!verifyToken(token)) return res.status(401).json({ error: '未授权' });
  next();
};


app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === config.auth.username && password === config.auth.password) {
    res.json({ success: true, token: createToken(username) });
  } else {
    res.status(401).json({ error: '用户名或密码错误' });
  }
});

app.get('/api/bots', auth, (req, res) => {
  const result = {};
  bots.forEach((bot, id) => result[id] = bot.getStatus());
  res.json(result);
});

app.post('/api/bots/add', auth, async (req, res) => {
  try {
    const serverConfig = {
      id: req.body.id || `server_${Date.now()}`,
      name: req.body.name || '新服务器',
      type: req.body.type || 'minecraft',
      host: req.body.host || '',
      port: req.body.port || 25565,
      username: req.body.username || '',
      pterodactyl: req.body.pterodactyl || null,
      sftp: req.body.sftp || null
    };

    config.servers.push(serverConfig);
    saveConfig();

    const bot = new BotInstance(serverConfig);
    bots.set(serverConfig.id, bot);

    if (serverConfig.type === 'minecraft' && serverConfig.host) {
      await bot.connect();
    }

    res.json({ success: true, id: serverConfig.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/bots/:id', auth, (req, res) => {
  const bot = bots.get(req.params.id);
  if (bot) {
    bot.disconnect();
    bots.delete(req.params.id);
  }
  config.servers = config.servers.filter(s => s.id !== req.params.id);
  saveConfig();
  res.json({ success: true });
});

app.post('/api/bots/:id/connect', auth, async (req, res) => {
  try {
    const bot = bots.get(req.params.id);
    if (!bot) return res.status(404).json({ error: '服务器不存在' });
    await bot.connect();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bots/:id/disconnect', auth, (req, res) => {
  const bot = bots.get(req.params.id);
  if (bot) bot.disconnect();
  res.json({ success: true });
});

app.post('/api/bots/:id/refresh', auth, async (req, res) => {
  try {
    const bot = bots.get(req.params.id);
    if (!bot) return res.status(404).json({ error: '服务器不存在' });
    bot.softDisconnect();
    await new Promise(r => setTimeout(r, 500));
    await bot.connect();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/bots/:id/logs', auth, (req, res) => {
  const bot = bots.get(req.params.id);
  if (!bot) return res.status(404).json({ error: '服务器不存在' });
  res.json({ success: true, logs: bot.logs });
});

app.delete('/api/bots/:id/logs', auth, (req, res) => {
  const bot = bots.get(req.params.id);
  if (!bot) return res.status(404).json({ error: '服务器不存在' });
  bot.logs = [];
  res.json({ success: true });
});

app.post('/api/bots/:id/chat', auth, (req, res) => {
  const bot = bots.get(req.params.id);
  if (!bot) return res.status(404).json({ error: '服务器不存在' });
  bot.chat(req.body.message);
  res.json({ success: true });
});

app.put('/api/bots/:id', auth, (req, res) => {
  const bot = bots.get(req.params.id);
  if (!bot) return res.status(404).json({ error: '服务器不存在' });

  Object.assign(bot.config, req.body);
  const idx = config.servers.findIndex(s => s.id === req.params.id);
  if (idx >= 0) config.servers[idx] = { ...config.servers[idx], ...req.body };
  saveConfig();

  res.json({ success: true });
});

app.post('/api/bots/:id/power', auth, async (req, res) => {
  try {
    const bot = bots.get(req.params.id);
    if (!bot) return res.status(404).json({ error: '服务器不存在' });
    await bot.sendPowerSignal(req.body.signal);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bots/:id/command', auth, async (req, res) => {
  try {
    const bot = bots.get(req.params.id);
    if (!bot) return res.status(404).json({ error: '服务器不存在' });
    await bot.sendCommand(req.body.command);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/bots/:id/files', auth, async (req, res) => {
  try {
    const bot = bots.get(req.params.id);
    if (!bot) return res.status(404).json({ error: '服务器不存在' });
    const files = await bot.listFiles(req.query.dir || '/');
    res.json({ success: true, files });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/bots/:id/files/read', auth, async (req, res) => {
  try {
    const bot = bots.get(req.params.id);
    if (!bot) return res.status(404).json({ error: '服务器不存在' });
    const content = await bot.readFile(req.query.path);
    res.json({ success: true, content: content.toString() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bots/:id/files/write', auth, async (req, res) => {
  try {
    const bot = bots.get(req.params.id);
    if (!bot) return res.status(404).json({ error: '服务器不存在' });
    await bot.writeFile(req.query.path, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bots/:id/files/folder', auth, async (req, res) => {
  try {
    const bot = bots.get(req.params.id);
    if (!bot) return res.status(404).json({ error: '服务器不存在' });
    await bot.createFolder(req.body.root || '/', req.body.name);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bots/:id/files/delete', auth, async (req, res) => {
  try {
    const bot = bots.get(req.params.id);
    if (!bot) return res.status(404).json({ error: '服务器不存在' });
    await bot.deleteFiles(req.body.root || '/', req.body.files);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bots/:id/files/rename', auth, async (req, res) => {
  try {
    const bot = bots.get(req.params.id);
    if (!bot) return res.status(404).json({ error: '服务器不存在' });
    await bot.renameFile(req.body.root || '/', req.body.from, req.body.to);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bots/:id/mode', auth, (req, res) => {
  const bot = bots.get(req.params.id);
  if (!bot) return res.status(404).json({ error: '服务器不存在' });
  bot.setMode(req.body.mode, req.body.enabled);
  res.json({ success: true, modes: bot.modes });
});

app.post('/api/bots/:id/behavior', auth, (req, res) => {
  const bot = bots.get(req.params.id);
  if (!bot) return res.status(404).json({ error: '服务器不存在' });
  const result = bot.setBehavior(req.body.behavior, req.body.enabled, req.body.options || {});
  res.json(result);
});

app.post('/api/bots/:id/action', auth, (req, res) => {
  const bot = bots.get(req.params.id);
  if (!bot) return res.status(404).json({ error: '服务器不存在' });
  const result = bot.doAction(req.body.action, req.body.params || {});
  res.json(result);
});

app.post('/api/bots/:id/autochat', auth, (req, res) => {
  const bot = bots.get(req.params.id);
  if (!bot) return res.status(404).json({ error: '服务器不存在' });
  const result = bot.updateAutoChatConfig(req.body);
  res.json({ success: true, autoChat: result });
});

app.post('/api/bots/:id/restart-timer', auth, (req, res) => {
  const bot = bots.get(req.params.id);
  if (!bot) return res.status(404).json({ error: '服务器不存在' });
  const result = bot.setRestartTimer(req.body.minutes || 0);
  res.json({ success: true, restartTimer: result });
});

app.post('/api/bots/:id/restart-now', auth, (req, res) => {
  const bot = bots.get(req.params.id);
  if (!bot) return res.status(404).json({ error: '服务器不存在' });
  const result = bot.sendRestartCommand();
  res.json(result);
});

app.post('/api/bots/:id/auto-op', auth, async (req, res) => {
  const bot = bots.get(req.params.id);
  if (!bot) return res.status(404).json({ error: '服务器不存在' });
  try {
    const result = await bot.autoOpSelf();
    res.json(result || { success: true, message: _d('5bey5Y+R6YCBIE9QIOWRveS7pA==') });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bots/:id/panel-command', auth, async (req, res) => {
  const bot = bots.get(req.params.id);
  if (!bot) return res.status(404).json({ error: '服务器不存在' });
  try {
    const result = await bot.sendCommand(req.body.command);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bots/:id/file-access-type', auth, (req, res) => {
  const bot = bots.get(req.params.id);
  if (!bot) return res.status(404).json({ error: '服务器不存在' });
  const { type } = req.body;
  if (!['pterodactyl', 'sftp', 'none'].includes(type)) return res.status(400).json({ error: '无效类型' });
  bot.config.fileAccessType = type;
  const idx = config.servers.findIndex(s => s.id === bot.id);
  if (idx >= 0) { config.servers[idx].fileAccessType = type; saveConfig(); }
  res.json({ success: true, fileAccessType: type });
});

app.post('/api/bots/:id/power', auth, async (req, res) => {
  const bot = bots.get(req.params.id);
  if (!bot) return res.status(404).json({ error: '服务器不存在' });
  try {
    const result = await bot.sendPowerSignal(req.body.signal);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/tools', auth, (req, res) => {
  const status = {};
  for (const [name, tool] of Object.entries(tools)) {
    status[name] = { ...tool.status(), config: config.tools[name] };
  }
  res.json({ success: true, tools: status, arch: getArch() });
});

app.post('/api/tools/:name/config', auth, (req, res) => {
  if (!config.tools[req.params.name]) return res.status(404).json({ error: '工具不存在' });
  config.tools[req.params.name] = { ...config.tools[req.params.name], ...req.body };
  saveConfig();
  res.json({ success: true });
});

app.post(`/api/tools/${_CK.t1}/install-u1`, auth, async (req, res) => {
  try {
    await tools[_CK.t1].installU1();
    res.json({ success: true, status: tools[_CK.t1].status() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post(`/api/tools/${_CK.t1}/install-u2`, auth, async (req, res) => {
  try {
    await tools[_CK.t1].installU2();
    res.json({ success: true, status: tools[_CK.t1].status() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/tools/:name/:action', auth, async (req, res) => {
  const tool = tools[req.params.name];
  if (!tool) return res.status(404).json({ error: '工具不存在' });

  const action = req.params.action;
  if (!['install', 'start', 'stop', 'uninstall', 'delete', 'restart'].includes(action)) {
    return res.status(400).json({ error: '无效操作' });
  }

  try {
    await tool[action]();
    res.json({ success: true, status: tool.status() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/tgbot', auth, (req, res) => {
  res.json({ success: true, ...getTgBotStatus() });
});

app.post('/api/tgbot/config', auth, (req, res) => {
  config.tgbot = {
    ...config.tgbot,
    ...req.body,
    openai: { ...config.tgbot.openai, ...(req.body.openai || {}) },
    features: { ...config.tgbot.features, ...(req.body.features || {}) },
    rss: { ...config.tgbot.rss, ...(req.body.rss || {}) }
  };
  saveConfig();
  res.json({ success: true });
});

app.post('/api/tgbot/start', auth, async (req, res) => {
  try {
    await startTgBot();
    res.json({ success: true, ...getTgBotStatus() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/tgbot/stop', auth, (req, res) => {
  stopTgBot();
  res.json({ success: true, ...getTgBotStatus() });
});

app.post('/api/tgbot/restart', auth, async (req, res) => {
  try {
    stopTgBot();
    await new Promise(r => setTimeout(r, 500));
    await startTgBot();
    res.json({ success: true, ...getTgBotStatus() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/tgbot/rss', auth, (req, res) => {
  if (!tgDb) {
    try { initTgDatabase(); } catch (e) {
      return res.status(400).json({ error: '数据库未初始化' });
    }
  }
  const feeds = tgDb.prepare('SELECT * FROM rss_feeds ORDER BY created_at DESC').all();
  const keywords = tgDbOps.keyword.getKeywords();
  const excludes = tgDbOps.keyword.getExcludes();
  const interval = config.tgbot.rss?.checkInterval || 30;
  res.json({ success: true, feeds, keywords, excludes, interval });
});

app.post('/api/tgbot/rss/feed', auth, async (req, res) => {
  if (!tgDb) {
    try { initTgDatabase(); } catch (e) {
      return res.status(400).json({ error: '数据库未初始化' });
    }
  }
  const { url, chatId } = req.body;
  if (!url) return res.status(400).json({ error: '请提供 RSS URL' });

  try {
    const result = await tgHelpers.parseRss(url);
    if (!result.success) return res.status(400).json({ error: result.error });

    tgDbOps.rss.add('admin', chatId || '0', url, result.title);
    res.json({ success: true, title: result.title });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/tgbot/rss/feed/:id', auth, (req, res) => {
  if (!tgDb) return res.status(400).json({ error: '数据库未初始化' });
  const id = parseInt(req.params.id);
  tgDb.prepare('DELETE FROM rss_feeds WHERE id = ?').run(id);
  res.json({ success: true });
});

app.post('/api/tgbot/rss/keyword', auth, (req, res) => {
  if (!tgDb) {
    try { initTgDatabase(); } catch (e) {
      return res.status(400).json({ error: '数据库未初始化' });
    }
  }
  const { keyword, type } = req.body;
  if (!keyword) return res.status(400).json({ error: '请提供关键词' });

  const result = tgDbOps.keyword.add(keyword.trim(), type || 'include');
  res.json({ success: true, added: result.changes > 0 });
});

app.delete('/api/tgbot/rss/keyword', auth, (req, res) => {
  if (!tgDb) return res.status(400).json({ error: '数据库未初始化' });
  const { keyword, type } = req.body;
  if (!keyword) return res.status(400).json({ error: '请提供关键词' });

  tgDbOps.keyword.delete(keyword, type || 'include');
  res.json({ success: true });
});

app.post('/api/tgbot/rss/interval', auth, (req, res) => {
  const { interval } = req.body;
  if (!interval || interval < 1 || interval > 1440) {
    return res.status(400).json({ error: '间隔范围: 1-1440 分钟' });
  }
  config.tgbot.rss = { ...config.tgbot.rss, checkInterval: interval };
  saveConfig();
  res.json({ success: true });
});

app.post('/api/tgbot/rss/test', auth, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: '请提供 RSS URL' });

  try {
    const result = await tgHelpers.parseRss(url);
    res.json({ success: result.success, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/discord', auth, (req, res) => {
  res.json({ success: true, ...getDiscordBotStatus() });
});

app.post('/api/discord/config', auth, (req, res) => {
  config.discord = {
    ...config.discord,
    ...req.body,
    openai: { ...config.discord.openai, ...(req.body.openai || {}) },
    features: { ...config.discord.features, ...(req.body.features || {}) }
  };
  saveConfig();
  res.json({ success: true });
});

app.post('/api/discord/start', auth, async (req, res) => {
  try {
    await startDiscordBot();
    res.json({ success: true, ...getDiscordBotStatus() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/discord/stop', auth, (req, res) => {
  stopDiscordBot();
  res.json({ success: true, ...getDiscordBotStatus() });
});

app.post('/api/discord/restart', auth, async (req, res) => {
  try {
    stopDiscordBot();
    await new Promise(r => setTimeout(r, 500));
    await startDiscordBot();
    res.json({ success: true, ...getDiscordBotStatus() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/discord/register-commands', auth, async (req, res) => {
  res.json({ success: true, message: 'Self-bot 模式下无需注册命令 (使用前缀命令)' });
});


app.get('/api/automation', auth, (req, res) => {
  res.json({ success: true, config: config.automation });
});

app.post('/api/automation/tasks', auth, (req, res) => {
  config.automation.tasks = req.body;
  saveConfig();
  restartScheduler();
  res.json({ success: true });
});

app.post('/api/automation/token', auth, (req, res) => {
  config.automation.webhookToken = randomUUID();
  saveConfig();
  res.json({ success: true, token: config.automation.webhookToken });
});

app.post('/api/automation/run/:index', auth, async (req, res) => {
  const index = parseInt(req.params.index);
  const task = config.automation.tasks[index];
  if (!task) return res.status(404).json({ error: '任务不存在' });

  const result = await executeTask(task, 'manual');
  res.json(result);
});


app.all('/api/webhook/:token/start/:serverId', async (req, res) => {
  const { token, serverId } = req.params;

  if (token !== config.automation.webhookToken) {
    return res.status(401).json({ error: '无效的 Token' });
  }

  try {
    const result = await executeTask({ type: 'server_control', params: { serverId, action: 'start' } }, 'webhook');
    res.json(result);
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.all('/api/webhook/:token/alert/:serverId', async (req, res) => {
  const { token, serverId } = req.params;

  if (token !== config.automation.webhookToken) {
    return res.status(401).json({ error: '无效的 Token' });
  }

  const body = req.body || {};
  const query = req.query || {};
  let shouldStart = false;
  let alertType = 'unknown';

  if (body.type) {
    alertType = 's2';
    shouldStart = body.type === 'offline' || body.type === 'loss';
    log('tool', 'info', `[Webhook] S2告警: ${body.server_name || serverId} - ${body.type}`);
  }

  else if (body.heartbeat !== undefined) {
    alertType = 'uptime-kuma';
    shouldStart = body.heartbeat?.status === 0;
    log('tool', 'info', `[Webhook] Uptime Kuma 告警: ${body.monitor?.name || serverId} - status=${body.heartbeat?.status}`);
  }

  else if (body.alertType !== undefined || query.alertType !== undefined) {
    alertType = 'uptimerobot';
    const alertCode = body.alertType || query.alertType;
    shouldStart = alertCode === '2' || alertCode === 2;
    log('tool', 'info', `[Webhook] UptimeRobot 告警: ${body.monitorFriendlyName || query.monitorFriendlyName || serverId} - alertType=${alertCode}`);
  }

  else {
    alertType = 'direct';
    shouldStart = query.action !== 'stop';
    log('tool', 'info', `[Webhook] 直接触发: ${serverId}`);
  }

  try {
    if (shouldStart) {
      const result = await executeTask({ type: 'server_control', params: { serverId, action: 'start' } }, 'webhook');
      res.json({ ...result, alertType, action: 'start' });
    } else {
      res.json({ success: true, alertType, action: 'none', message: '非离线告警，跳过' });
    }
  } catch (e) {
    res.status(400).json({ success: false, error: e.message, alertType });
  }
});

app.all('/api/webhook/:token/:type', async (req, res) => {
  const { token, type } = req.params;

  if (token !== config.automation.webhookToken) {
    return res.status(401).json({ error: '无效的 Token' });
  }

  const params = { ...req.query, ...req.body };

  try {
    let result;

    if (type === 'server_control') {
      if (!params.serverId || !params.action) throw new Error('缺少 serverId 或 action 参数');
      result = await executeTask({ type: 'server_control', params }, 'webhook');
    }

    else if (type === 'discord_msg') {
      if (!params.channelId || !params.content) throw new Error('缺少 channelId 或 content 参数');
      result = await executeTask({ type: 'discord_msg', params }, 'webhook');
    }

    else {
      throw new Error('不支持的 Webhook 类型');
    }

    res.json(result);
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/api/settings/auth', auth, (req, res) => {
  if (req.body.username) config.auth.username = req.body.username;
  if (req.body.password) config.auth.password = req.body.password;
  saveConfig();
  res.json({ success: true });
});

app.get('/api/settings/logs', auth, (req, res) => {
  res.json({ success: true, logs: config.logs });
});

app.post('/api/settings/logs', auth, (req, res) => {
  config.logs = { ...config.logs, ...req.body };
  saveConfig();
  res.json({ success: true });
});

app.get('/api/logs', auth, (req, res) => {
  const category = req.query.category || null;
  const limit = parseInt(req.query.limit) || 100;
  res.json({ success: true, logs: getLogs(category, limit) });
});

app.delete('/api/logs', auth, (req, res) => {
  clearLogs();
  res.json({ success: true });
});

app.get('/logs', (req, res) => {
  res.send(LOGS_HTML);
});

const LOGS_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MineBot Logs</title>
  <style>
    :root { --bg: #0f172a; --card: #1e293b; --border: #334155; --text: #e2e8f0; --muted: #94a3b8; --primary: #3b82f6; --success: #22c55e; --danger: #ef4444; --warning: #f59e0b; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Consolas', 'Monaco', monospace; background: var(--bg); color: var(--text); min-height: 100vh; padding: 20px; }
    h1 { color: var(--primary); margin-bottom: 20px; font-size: 24px; }
    .toolbar { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
    .btn { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .btn-primary { background: var(--primary); color: white; }
    .btn-danger { background: var(--danger); color: white; }
    .btn:hover { opacity: 0.8; }
    select, input { padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--text); font-size: 14px; }
    .log-container { background: var(--card); border-radius: 8px; padding: 15px; max-height: calc(100vh - 150px); overflow-y: auto; }
    .log-entry { padding: 4px 0; border-bottom: 1px solid var(--border); font-size: 13px; line-height: 1.5; }
    .log-entry:last-child { border-bottom: none; }
    .log-time { color: var(--muted); margin-right: 10px; }
    .log-category { padding: 2px 6px; border-radius: 4px; margin-right: 8px; font-size: 11px; text-transform: uppercase; }
    .log-category.tool { background: var(--primary); color: white; }
    .log-category.bot { background: var(--success); color: white; }
    .log-category.api { background: var(--warning); color: black; }
    .log-level-error { color: var(--danger); }
    .log-level-info { color: var(--text); }
    .empty { color: var(--muted); text-align: center; padding: 40px; }
    .auto-refresh { display: flex; align-items: center; gap: 5px; color: var(--muted); font-size: 14px; }
  </style>
</head>
<body>
  <h1>MineBot Logs</h1>
  <div class="toolbar">
    <select id="category">
      <option value="">全部类别</option>
      <option value="tool">工具</option>
      <option value="bot">机器人</option>
      <option value="api">API</option>
    </select>
    <input type="number" id="limit" value="100" min="10" max="500" style="width:80px" title="显示条数">
    <button class="btn btn-primary" onclick="loadLogs()">刷新</button>
    <button class="btn btn-danger" onclick="clearLogs()">清空</button>
    <label class="auto-refresh">
      <input type="checkbox" id="autoRefresh" checked> 自动刷新 (5s)
    </label>
  </div>
  <div class="log-container" id="logs">
    <div class="empty">加载中...</div>
  </div>

  <script>
    const token = localStorage.getItem('token') || '';
    let autoRefreshInterval = null;

    const api = async (path, method = 'GET') => {
      const res = await fetch('/api' + path, {
        method,
        headers: { 'Authorization': 'Bearer ' + token }
      });
      return res.json();
    };

    const loadLogs = async () => {
      const category = document.getElementById('category').value;
      const limit = document.getElementById('limit').value;
      const url = '/logs?limit=' + limit + (category ? '&category=' + category : '');

      try {
        const data = await api(url);
        const container = document.getElementById('logs');

        if (!data.logs || data.logs.length === 0) {
          container.innerHTML = '<div class="empty">暂无日志</div>';
          return;
        }

        container.innerHTML = data.logs.map(l => \`
          <div class="log-entry">
            <span class="log-time">\${new Date(l.time).toLocaleString()}</span>
            <span class="log-category \${l.category}">\${l.category}</span>
            <span class="log-level-\${l.level}">\${l.message}</span>
          </div>
        \`).join('');

        container.scrollTop = container.scrollHeight;
      } catch (e) {
        document.getElementById('logs').innerHTML = '<div class="empty">需要登录才能查看日志</div>';
      }
    };

    const clearLogs = async () => {
      if (!confirm('确定清空所有日志?')) return;
      await api('/logs', 'DELETE');
      loadLogs();
    };

    const toggleAutoRefresh = () => {
      if (document.getElementById('autoRefresh').checked) {
        autoRefreshInterval = setInterval(loadLogs, 5000);
      } else {
        clearInterval(autoRefreshInterval);
      }
    };

    document.getElementById('autoRefresh').addEventListener('change', toggleAutoRefresh);
    document.getElementById('category').addEventListener('change', loadLogs);

    loadLogs();
    toggleAutoRefresh();
  </script>
</body>
</html>`;

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MineBot Toolbox</title>
  <style>
    :root {
      /* 深色主题基础 */
      --bg: #0f172a;
      --card: #1e293b;
      --border: #334155;
      --text: #e2e8f0;
      --muted: #94a3b8;

      /* Minecraft 主题色 */
      --primary: #5eead4;      /* Emerald 绿 */
      --diamond: #63d8f5;      /* Diamond 青蓝 */
      --gold: #f5a623;         /* Gold 黄金 */
      --amethyst: #8b5cf6;     /* Amethyst 紫晶 */

      /* 功能色 */
      --success: #22c55e;      /* 成功绿 */
      --danger: #ef4444;       /* Redstone 红 */
      --warning: #f59e0b;      /* 警告橙 */

      /* 阴影和发光 */
      --shadow-glow: 0 0 20px rgba(94, 234, 212, 0.3);
      --shadow-card: 0 4px 20px rgba(0, 0, 0, 0.4);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { text-align: center; margin-bottom: 10px; color: var(--primary); }
    .subtitle { text-align: center; color: var(--muted); margin-bottom: 30px; font-size: 14px; }

    /* Tabs */
    .tabs { display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 10px; }
    .tab { padding: 10px 20px; background: transparent; border: none; color: var(--muted); cursor: pointer; border-radius: 6px 6px 0 0; }
    .tab.active { background: var(--card); color: var(--text); }
    .tab-content { display: none; }
    .tab-content.active { display: block; }

    /* 动画库 */
    @keyframes pulse-glow {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }

    @keyframes slide-in-right {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slide-in {
      from { transform: translate(-50%, -48%); opacity: 0; }
      to { transform: translate(-50%, -50%); opacity: 1; }
    }

    /* Cards */
    .card {
      background: rgba(42, 58, 66, 0.5);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 16px;
      border: 1px solid rgba(94, 234, 212, 0.2);
      box-shadow: var(--shadow-card);
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    }

    .card::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(94, 234, 212, 0.1) 0%, transparent 100%);
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    }

    .card:hover {
      border-color: rgba(94, 234, 212, 0.5);
      box-shadow: 0 0 20px rgba(94, 234, 212, 0.3);
    }

    .card:hover::before {
      opacity: 1;
    }

    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
    .card-title { font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 10px; }

    /* 卡片内容间距优化 */
    .card > div:not(.card-header):not(.card::before) {
      margin-top: 12px;
    }

    .card-header + * {
      margin-top: 12px;
    }

    /* Status dots */
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      animation: pulse-glow 2s ease-in-out infinite;
    }

    .dot.online {
      background: var(--primary);
      box-shadow: 0 0 10px rgba(94, 234, 212, 0.5);
    }

    .dot.offline {
      background: var(--muted);
      animation: none;
    }

    .dot.installed {
      background: var(--gold);
      animation: none;
    }

    /* Buttons */
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s ease;
      outline: none;
      position: relative;
    }

    .btn:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }

    .btn:hover { opacity: 0.8; }

    .btn:active {
      transform: scale(0.98);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .btn-primary {
      background: var(--primary);
      color: #0f172a;
      font-weight: 600;
      box-shadow: 0 0 10px rgba(94, 234, 212, 0.3);
    }

    .btn-primary:hover {
      filter: brightness(0.9);
      box-shadow: 0 0 15px rgba(94, 234, 212, 0.5);
      transform: translateY(-1px);
    }

    .btn-primary:active {
      transform: scale(0.98);
    }
    .btn-success { background: var(--success); color: white; }
    .btn-danger { background: var(--danger); color: white; }
    .btn-warning { background: var(--warning); color: white; }
    .btn-sm { padding: 6px 12px; font-size: 12px; }
    .btn-group { display: flex; gap: 8px; flex-wrap: wrap; }

    /* Forms */
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; margin-bottom: 6px; font-size: 14px; color: var(--muted); font-weight: 500; }
    .form-group input, .form-group textarea, .form-group select {
      width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;
      background: var(--bg); color: var(--text); font-size: 14px;
      transition: all 0.2s ease;
    }

    .form-group input:focus, .form-group textarea:focus, .form-group select:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(94, 234, 212, 0.1);
    }

    .form-group textarea { min-height: 80px; font-family: monospace; resize: vertical; }
    .form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }

    /* Grid */
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }

    /* Server card */
    .server-card { cursor: pointer; transition: border-color 0.2s; }
    .server-card:hover { border-color: var(--primary); }

    .server-info {
      font-size: 13px;
      color: var(--muted);
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .server-info code {
      background: rgba(15, 23, 42, 0.8);
      padding: 6px 8px;
      border-radius: 4px;
      font-size: 12px;
      border-left: 2px solid var(--primary);
      display: block;
      word-break: break-all;
    }

    .server-info-stats {
      display: flex;
      gap: 12px;
      font-size: 12px;
      flex-wrap: wrap;
    }

    .server-info-modes {
      font-size: 11px;
      letter-spacing: 2px;
      color: var(--primary);
    }

    /* Modal */
    .modal {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }

    .modal.open {
      display: flex;
      animation: fade-in 0.2s ease;
    }

    .modal-content {
      background: var(--card);
      border-radius: 12px;
      padding: 24px;
      width: 90%;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      animation: slide-in 0.3s ease;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(94, 234, 212, 0.1);
    }

    .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .modal-close {
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      font-size: 24px;
      transition: all 0.2s ease;
    }

    .modal-close:hover {
      background: rgba(94, 234, 212, 0.1);
      color: var(--primary);
      border-radius: 4px;
    }

    /* Login */
    .login { max-width: 320px; margin: 100px auto; }
    .login h2 { text-align: center; margin-bottom: 20px; }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      border-left: 4px solid;
      z-index: 200;
      animation: slide-in-right 0.3s ease-out;
      display: flex;
      align-items: center;
      gap: 12px;
      backdrop-filter: blur(10px);
    }

    .toast.success {
      border-left-color: var(--primary);
      background: rgba(94, 234, 212, 0.1);
      color: var(--primary);
    }

    .toast.error {
      border-left-color: var(--danger);
      background: rgba(239, 68, 68, 0.1);
      color: var(--danger);
    }

    .toast.warning {
      border-left-color: var(--gold);
      background: rgba(245, 166, 35, 0.1);
      color: var(--gold);
    }

    /* Files */
    .file-list { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .file-item { display: flex; align-items: center; gap: 10px; padding: 10px 15px; border-bottom: 1px solid var(--border); cursor: pointer; }
    .file-item:last-child { border-bottom: none; }
    .file-item:hover { background: var(--bg); }
    .file-name { flex: 1; }
    .file-size { color: var(--muted); font-size: 12px; }

    /* 响应式设计 */
    @media (max-width: 1024px) {
      .container { max-width: 100%; }
    }

    @media (max-width: 768px) {
      .container { padding: 12px; }

      .grid {
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      }

      .card {
        padding: 20px;
        margin-bottom: 12px;
      }

      .form-group {
        margin-bottom: 12px;
      }

      .btn {
        padding: 10px 14px;
        min-height: 44px;
      }

      .modal-content {
        width: 95%;
        max-width: 100%;
      }

      h1 {
        font-size: 1.5rem;
      }
    }

    @media (max-width: 480px) {
      .form-row {
        grid-template-columns: 1fr;
      }

      .btn-group {
        flex-direction: column;
      }

      .tabs {
        overflow-x: auto;
        padding-bottom: 10px;
      }

      .tab {
        white-space: nowrap;
      }
    }
  </style>
</head>
<body>
  <div class="container" id="app"></div>

  <script>
    let token = localStorage.getItem('token') || '';
    let ws = null;
    let botsData = {};
    let toolsData = {};
    let currentTab = 'servers';
    let selectedBot = null;
    let currentPath = '/';

    const api = async (path, method = 'GET', body = null) => {
      const opts = { method, headers: { 'Authorization': 'Bearer ' + token } };
      if (body) {
        if (typeof body === 'string') {
          opts.headers['Content-Type'] = 'text/plain';
          opts.body = body;
        } else {
          opts.headers['Content-Type'] = 'application/json';
          opts.body = JSON.stringify(body);
        }
      }
      const res = await fetch('/api' + path, opts);
      if (res.status === 401) { token = ''; localStorage.removeItem('token'); render(); throw new Error('未授权'); }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    };

    const toast = (msg, type = 'success') => {
      const el = document.createElement('div');
      el.className = 'toast ' + type;
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 3000);
    };

    const connectWs = () => {
      ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?token=' + token);
      ws.onmessage = (e) => {
        const { type, data } = JSON.parse(e.data);
        if (type === 'botStatus') {
          botsData[data.id] = data;
          if (currentTab === 'servers') renderServers();
        }
      };
      ws.onclose = () => setTimeout(connectWs, 3000);
    };

    const renderLogin = () => \`
      <div class="login">
        <h1>MineBot Toolbox</h1>
        <div class="card">
          <div class="form-group"><label>用户名</label><input id="user" value="admin"></div>
          <div class="form-group"><label>密码</label><input type="password" id="pass"></div>
          <button class="btn btn-primary" style="width:100%" onclick="login()">登录</button>
        </div>
      </div>
    \`;

    const renderServers = () => {
      const content = document.getElementById('servers-content');
      if (!content) return;

      content.innerHTML = \`
        <div class="btn-group" style="margin-bottom:20px">
          <button class="btn btn-primary" onclick="showAddServer()">${_d('5re75Yqg5pyN5Yqh5Zmo')}</button>
        </div>
        <div class="grid">
          \${Object.values(botsData).map(b => \`
            <div class="card server-card" onclick="showServerDetail('\${b.id}')">
              <div class="card-header">
                <div class="card-title">
                  <span class="dot \${b.connected ? 'online' : 'offline'}"></span>
                  \${b.name || b.id}
                </div>
                <span style="font-size:12px;color:var(--muted)">\${b.type === 'panel' ? '${_d('6Z2i5p2/')}' : '${_d('5py65Zmo5Lq6')}'}</span>
              </div>
              <div class="server-info">
                <code>\${b.host || '${_d('5pyq6YWN572u')}'}:\${b.port || 25565}</code>
                \${b.connected ? \`<br>❤️ \${b.health||0} 🍖 \${b.food||0} 👥 \${(b.players||[]).length}\` : ''}
                \${b.modes ? \`<br><span style="font-size:11px">\${Object.entries(b.modes).filter(([k,v])=>v).map(([k])=>({aiView:'👁️',patrol:'🚶',autoAttack:'⚔️',invincible:'🛡️',autoChat:'💬',mining:'⛏️'}[k]||'')).join(' ')}</span>\` : ''}
              </div>
            </div>
          \`).join('') || '<p style="color:var(--muted)">${_d('5pqC5peg5pyN5Yqh5Zmo77yM54K55Ye75LiK5pa55oyJ6ZKu5re75Yqg')}</p>'}
        </div>
      \`;
    };

    const renderTools = () => {
      const content = document.getElementById('tools-content');
      if (!content) return;

      const toolNames = { '${_CK.t0}': '${_UI.t0}', '${_CK.t1}': '${_UI.t1}', '${_CK.t2}': '${_UI.t2}', '${_CK.t3}': '${_UI.t3}' };

      content.innerHTML = Object.entries(toolsData).map(([name, t]) => \`
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <span class="dot \${t.running ? 'online' : (t.installed ? 'installed' : 'offline')}"></span>
              \${toolNames[name]}
            </div>
            <span style="font-size:12px;color:var(--muted)">\${t.running ? '运行中' : (t.installed ? '已安装' : '未安装')}</span>
          </div>
          \${name === '${_CK.t0}' ? \`
            <div class="form-group">
              <label>隧道模式</label>
              <select id="s0-mode" onchange="toggleS0Mode()">
                <option value="fixed" \${t.config?.mode !== 'quick' ? 'selected' : ''}>固定隧道 (Token)</option>
                <option value="quick" \${t.config?.mode === 'quick' ? 'selected' : ''}>临时隧道 (Quick)</option>
              </select>
            </div>
            <div id="s0-fixed-config" style="display:\${t.config?.mode !== 'quick' ? 'block' : 'none'}">
              <div class="form-group"><label>Token</label><input type="password" id="s0-token" value="\${t.config?.token || ''}" placeholder="Token"></div>
            </div>
            <div id="s0-quick-config" style="display:\${t.config?.mode === 'quick' ? 'block' : 'none'}">
              <div class="form-row">
                <div class="form-group"><label>协议</label><select id="s0-protocol"><option value="http" \${t.config?.protocol !== 'https' ? 'selected' : ''}>HTTP</option><option value="https" \${t.config?.protocol === 'https' ? 'selected' : ''}>HTTPS</option></select></div>
                <div class="form-group"><label>本地端口</label><input type="number" id="s0-port" value="\${t.config?.localPort || 3000}" placeholder="3000"></div>
              </div>
            </div>
          \` : ''}
          \${name === '${_CK.t1}' ? \`
            <div class="form-group">
              <label>配置模式</label>
              <select id="s1-mode" onchange="toggleS1Mode()">
                <option value="auto" \${t.config?.mode !== 'manual' ? 'selected' : ''}>自动配置</option>
                <option value="manual" \${t.config?.mode === 'manual' ? 'selected' : ''}>手动配置</option>
              </select>
            </div>
            <div id="s1-auto-config" style="display:\${t.config?.mode !== 'manual' ? 'block' : 'none'}">
              <div class="form-row">
                <div class="form-group"><label>TCP 端口</label><input type="number" id="s1-port" value="\${t.config?.port || 8001}" placeholder="8001"></div>
                <div class="form-group"><label>UUID</label><input id="s1-uuid" value="\${t.config?.uuid || ''}" placeholder="自动生成" onclick="this.select()"></div>
              </div>
              <div class="form-row">
                <div class="form-group"><label>密码</label><input id="s1-password" value="\${t.config?.password || ''}" placeholder="自动生成"></div>
                <div class="form-group">
                  <label>加密方式</label>
                  <select id="s1-method">
                    <option value="aes-256-gcm" \${t.config?.ssMethod === 'aes-256-gcm' ? 'selected' : ''}>aes-256-gcm</option>
                    <option value="aes-128-gcm" \${t.config?.ssMethod === 'aes-128-gcm' ? 'selected' : ''}>aes-128-gcm</option>
                    <option value="chacha20-poly1305" \${t.config?.ssMethod === 'chacha20-poly1305' ? 'selected' : ''}>chacha20-poly1305</option>
                  </select>
                </div>
              </div>
              <p style="font-size:12px;color:var(--muted);margin:10px 0">TCP 协议</p>
              <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:10px">
                <label style="display:flex;align-items:center;gap:5px"><input type="checkbox" id="s1-p0" \${t.config?.protocols?.['${_CK.p0}']?.enabled !== false ? 'checked' : ''}> ${_UI.p0} <input id="s1-p0-path" value="\${t.config?.protocols?.['${_CK.p0}']?.wsPath || '${_DP._0}'}" style="width:80px;margin-left:auto" placeholder="${_DP._0}"></label>
                <label style="display:flex;align-items:center;gap:5px"><input type="checkbox" id="s1-p1" \${t.config?.protocols?.['${_CK.p1}']?.enabled ? 'checked' : ''}> ${_UI.p1} <input id="s1-p1-path" value="\${t.config?.protocols?.['${_CK.p1}']?.wsPath || '${_DP._1}'}" style="width:80px;margin-left:auto" placeholder="${_DP._1}"></label>
                <label style="display:flex;align-items:center;gap:5px"><input type="checkbox" id="s1-p2" \${t.config?.protocols?.['${_CK.p2}']?.enabled ? 'checked' : ''}> ${_UI.p2} <input id="s1-p2-path" value="\${t.config?.protocols?.['${_CK.p2}']?.wsPath || '${_DP._2}'}" style="width:80px;margin-left:auto" placeholder="${_DP._2}"></label>
                <label style="display:flex;align-items:center;gap:5px"><input type="checkbox" id="s1-p3" \${t.config?.protocols?.['${_CK.p3}']?.enabled ? 'checked' : ''}> ${_UI.p3} <input id="s1-p3-path" value="\${t.config?.protocols?.['${_CK.p3}']?.wsPath || '${_DP._3}'}" style="width:80px;margin-left:auto" placeholder="${_DP._3}"></label>
              </div>
              <div class="form-group"><label><input type="checkbox" id="s1-use-cf" \${t.config?.useCF !== false ? 'checked' : ''}> 通过隧道联动</label></div>
              <p style="font-size:12px;color:var(--muted);margin:10px 0">UDP 协议 (独立端口)</p>
              <div class="form-row">
                <label style="display:flex;align-items:center;gap:5px;flex:1"><input type="checkbox" id="s1-u1" \${t.config?.['${_CK.p4}']?.enabled ? 'checked' : ''}> ${_UI.p4} 端口: <input type="number" id="s1-u1-port" value="\${t.config?.['${_CK.p4}']?.port || 0}" style="width:80px" placeholder="自动"></label>
                <label style="display:flex;align-items:center;gap:5px;flex:1"><input type="checkbox" id="s1-u2" \${t.config?.['${_CK.p5}']?.enabled ? 'checked' : ''}> ${_UI.p5} 端口: <input type="number" id="s1-u2-port" value="\${t.config?.['${_CK.p5}']?.port || 0}" style="width:80px" placeholder="自动"></label>
              </div>
              \${!t.u1Installed ? '<button class="btn btn-sm" style="margin:5px 0" onclick="installU1()">${_UI.u1i}</button>' : '<span style="font-size:12px;color:var(--success)">${_UI.u1ok}</span>'}
              \${!t.u2Installed ? '<button class="btn btn-sm" style="margin:5px 0;margin-left:10px" onclick="installU2()">${_UI.u2i}</button>' : '<span style="font-size:12px;color:var(--success);margin-left:10px">${_UI.u2ok}</span>'}
              \${t.shareLinks?.length ? \`
                <div style="margin-top:15px;padding:10px;background:var(--bg);border-radius:8px">
                  <p style="font-size:12px;color:var(--primary);margin-bottom:8px">节点分享链接 (点击复制)</p>
                  \${t.shareLinks.map(l => \`<div style="margin:5px 0"><span style="font-size:11px;color:var(--muted)">\${l.name}:</span><input readonly value="\${l.link}" onclick="this.select();navigator.clipboard.writeText(this.value)" style="width:100%;font-size:11px;cursor:pointer" title="点击复制"></div>\`).join('')}
                  \${t.collection ? \`
                    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
                      <p style="font-size:12px;color:var(--success);margin-bottom:8px">聚合节点 (Base64 订阅格式)</p>
                      <textarea readonly onclick="this.select();navigator.clipboard.writeText(this.value)" style="width:100%;height:60px;font-size:10px;background:var(--card);color:var(--muted);border:1px solid var(--border);border-radius:4px;padding:5px;cursor:pointer" title="点击复制">\${t.collection}</textarea>
                    </div>
                  \` : ''}
                </div>
              \` : ''}
            </div>
            <div id="s1-manual-config" style="display:\${t.config?.mode === 'manual' ? 'block' : 'none'}">
              <div class="form-group"><label>配置 (JSON)</label><textarea id="s1-config" placeholder="JSON 配置">\${t.config?.config || ''}</textarea></div>
            </div>
          \` : ''}
          \${name === '${_CK.t2}' ? \`
            <div class="form-group">
              <label>版本</label>
              <select id="s2-version" onchange="toggleS2Ver()">
                <option value="v1" \${t.config?.version !== 'v0' ? 'selected' : ''}>v1 (新版)</option>
                <option value="v0" \${t.config?.version === 'v0' ? 'selected' : ''}>v0 (旧版)</option>
              </select>
            </div>
            <div class="form-row">
              <div class="form-group"><label>服务器</label><input id="s2-server" value="\${t.config?.server || ''}" placeholder="v1: data.example.com / v0: data.example.com:443"></div>
              <div class="form-group"><label>密钥</label><input type="password" id="s2-key" value="\${t.config?.key || ''}"></div>
            </div>
            <div id="s2-v0-config" style="display:\${t.config?.version === 'v0' ? 'block' : 'none'}">
              <div class="form-group"><label><input type="checkbox" id="s2-tls" \${t.config?.tls !== false ? 'checked' : ''}> 启用 TLS</label></div>
            </div>
            <div id="s2-v1-config" style="display:\${t.config?.version !== 'v0' ? 'block' : 'none'}">
              <div class="form-group"><label>UUID (留空自动生成)</label><input id="s2-uuid" value="\${t.config?.uuid || ''}" placeholder="自动生成" onclick="this.select()"></div>
              <div class="form-group" style="display:flex;flex-wrap:wrap;gap:15px">
                <label><input type="checkbox" id="s2-insecure" \${t.config?.insecure ? 'checked' : ''}> 跳过证书验证</label>
                <label><input type="checkbox" id="s2-gpu" \${t.config?.gpu ? 'checked' : ''}> 上报 GPU</label>
                <label><input type="checkbox" id="s2-temp" \${t.config?.temperature ? 'checked' : ''}> 上报温度</label>
                <label><input type="checkbox" id="s2-ipv6" \${t.config?.useIPv6 ? 'checked' : ''}> 使用 IPv6</label>
                <label><input type="checkbox" id="s2-no-update" \${t.config?.disableAutoUpdate !== false ? 'checked' : ''}> 禁用自动更新</label>
                <label><input type="checkbox" id="s2-no-cmd" \${t.config?.disableCommandExecute ? 'checked' : ''}> 禁用命令执行</label>
              </div>
            </div>
            \${t.running ? '<p style="font-size:12px;color:var(--muted);margin-top:8px">修改配置后点击"保存并重启"即时生效</p>' : ''}
          \` : ''}
          \${name === '${_CK.t3}' ? \`
            <div class="form-row">
              <div class="form-group"><label>API 端点</label><input id="s3-server" value="\${t.config?.server || ''}" placeholder="https://example.com"></div>
              <div class="form-group"><label>Token</label><input type="password" id="s3-key" value="\${t.config?.key || ''}"></div>
            </div>
            <div class="form-group" style="display:flex;flex-wrap:wrap;gap:15px">
              <label><input type="checkbox" id="s3-insecure" \${t.config?.insecure ? 'checked' : ''}> 跳过证书验证</label>
              <label><input type="checkbox" id="s3-gpu" \${t.config?.gpu ? 'checked' : ''}> GPU 监控</label>
              <label><input type="checkbox" id="s3-no-update" \${t.config?.disableAutoUpdate !== false ? 'checked' : ''}> 禁用自动更新</label>
            </div>
            \${t.running ? '<p style="font-size:12px;color:var(--muted);margin-top:8px">修改配置后点击"保存配置"再重启生效</p>' : ''}
          \` : ''}
          <div class="btn-group">
            \${!t.installed ? \`<button class="btn btn-primary btn-sm" onclick="toolAction('\${name}','install')">安装</button>\` : ''}
            \${t.installed ? \`<button class="btn btn-primary btn-sm" onclick="saveToolConfig('\${name}')">保存配置</button>\` : ''}
            \${t.installed && !t.running ? \`<button class="btn btn-success btn-sm" onclick="toolAction('\${name}','start')">启动</button>\` : ''}
            \${t.running ? \`<button class="btn btn-warning btn-sm" onclick="toolAction('\${name}','stop')">停止</button>\` : ''}
            \${t.running ? \`<button class="btn btn-primary btn-sm" onclick="restartTool('\${name}')">重启</button>\` : ''}
            \${t.installed && !t.running ? \`<button class="btn btn-danger btn-sm" onclick="deleteTool('\${name}')">删除</button>\` : ''}
          </div>
        </div>
      \`).join('');
    };

    window.toggleS0Mode = () => {
      const mode = document.getElementById('s0-mode').value;
      document.getElementById('s0-fixed-config').style.display = mode === 'fixed' ? 'block' : 'none';
      document.getElementById('s0-quick-config').style.display = mode === 'quick' ? 'block' : 'none';
    };

    window.toggleS1Mode = () => {
      const mode = document.getElementById('s1-mode').value;
      document.getElementById('s1-auto-config').style.display = mode === 'auto' ? 'block' : 'none';
      document.getElementById('s1-manual-config').style.display = mode === 'manual' ? 'block' : 'none';
    };

    window.installU1 = async () => {
      try {
        toast('正在安装...');
        await api('/tools/${_CK.t1}/install-u1', 'POST');
        toast('安装成功');
        const res = await api('/tools');
        toolsData = res.tools;
        renderTools();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.installU2 = async () => {
      try {
        toast('正在安装...');
        await api('/tools/${_CK.t1}/install-u2', 'POST');
        toast('安装成功');
        const res = await api('/tools');
        toolsData = res.tools;
        renderTools();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.toggleS2Ver = () => {
      const version = document.getElementById('s2-version').value;
      document.getElementById('s2-v0-config').style.display = version === 'v0' ? 'block' : 'none';
      document.getElementById('s2-v1-config').style.display = version === 'v1' ? 'block' : 'none';
    };

    window.saveAndRestartS2 = async () => {
      try {
        const version = document.getElementById('s2-version').value;
        let cfg = {
          version: version,
          server: document.getElementById('s2-server').value,
          key: document.getElementById('s2-key').value
        };

        if (version === 'v0') {
          cfg.tls = document.getElementById('s2-tls').checked;
        } else {
          cfg.uuid = document.getElementById('s2-uuid')?.value || '';
          cfg.insecure = document.getElementById('s2-insecure').checked;
          cfg.gpu = document.getElementById('s2-gpu').checked;
          cfg.temperature = document.getElementById('s2-temp').checked;
          cfg.useIPv6 = document.getElementById('s2-ipv6').checked;
          cfg.disableAutoUpdate = document.getElementById('s2-no-update').checked;
          cfg.disableCommandExecute = document.getElementById('s2-no-cmd').checked;
        }

        await api('/tools/${_CK.t2}/config', 'POST', cfg);
        await api('/tools/${_CK.t2}/restart', 'POST');
        toast('已重启');
        const res = await api('/tools');
        toolsData = res.tools;
        renderTools();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.saveAndRestartS3 = async () => {
      try {
        const cfg = {
          server: document.getElementById('s3-server').value,
          key: document.getElementById('s3-key').value,
          insecure: document.getElementById('s3-insecure').checked,
          gpu: document.getElementById('s3-gpu').checked,
          disableAutoUpdate: document.getElementById('s3-no-update').checked
        };

        await api('/tools/${_CK.t3}/config', 'POST', cfg);
        await api('/tools/${_CK.t3}/restart', 'POST');
        toast('已重启');
        const res = await api('/tools');
        toolsData = res.tools;
        renderTools();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    const render = async () => {
      if (!token) {
        document.getElementById('app').innerHTML = renderLogin();
        return;
      }

      try {
        const [botsRes, toolsRes] = await Promise.all([api('/bots'), api('/tools')]);
        botsData = botsRes;
        toolsData = toolsRes.tools;

        document.getElementById('app').innerHTML = \`
          <h1>MineBot Toolbox</h1>
          <p class="subtitle">\${toolsRes.arch.platform} / \${toolsRes.arch.archName}</p>

          <div class="tabs">
            <button class="tab \${currentTab === 'servers' ? 'active' : ''}" onclick="switchTab('servers')">服务器管理</button>
            <button class="tab \${currentTab === 'tools' ? 'active' : ''}" onclick="switchTab('tools')">工具箱</button>
            <button class="tab \${currentTab === 'tgbot' ? 'active' : ''}" onclick="switchTab('tgbot')">TG机器人</button>
            <button class="tab \${currentTab === 'discord' ? 'active' : ''}" onclick="switchTab('discord')">Discord</button>
            <button class="tab \${currentTab === 'automation' ? 'active' : ''}" onclick="switchTab('automation')">自动化</button>
            <button class="tab \${currentTab === 'settings' ? 'active' : ''}" onclick="switchTab('settings')">设置</button>
          </div>

          <div id="servers-content" class="tab-content \${currentTab === 'servers' ? 'active' : ''}"></div>
          <div id="tools-content" class="tab-content \${currentTab === 'tools' ? 'active' : ''}"></div>
          <div id="tgbot-content" class="tab-content \${currentTab === 'tgbot' ? 'active' : ''}"></div>
          <div id="discord-content" class="tab-content \${currentTab === 'discord' ? 'active' : ''}"></div>
          <div id="automation-content" class="tab-content \${currentTab === 'automation' ? 'active' : ''}"></div>
          <div id="settings-content" class="tab-content \${currentTab === 'settings' ? 'active' : ''}"></div>

          <div class="modal" id="modal"></div>
        \`;

        renderServers();
        renderTools();
        renderTgBot();
        renderDiscord();
        renderAutomation();
        renderSettings();
        if (!ws) connectWs();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.login = async () => {
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: document.getElementById('user').value, password: document.getElementById('pass').value })
        });
        const data = await res.json();
        if (data.success) {
          token = data.token;
          localStorage.setItem('token', token);
          render();
        } else {
          toast(data.error, 'error');
        }
      } catch (e) {
        toast('登录失败', 'error');
      }
    };

    window.switchTab = (tab) => {
      currentTab = tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      const tabIndex = { servers: 1, tools: 2, tgbot: 3, discord: 4, automation: 5, settings: 6 }[tab] || 1;
      document.querySelector(\`.tab:nth-child(\${tabIndex})\`).classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById(tab + '-content').classList.add('active');
    };

    let tgBotData = { enabled: false, running: false, hasToken: false, config: {} };
    let rssData = { feeds: [], keywords: [], excludes: [], interval: 30 };

    const renderTgBot = async () => {
      const content = document.getElementById('tgbot-content');
      if (!content) return;

      try {
        const [tgRes, rssRes] = await Promise.all([api('/tgbot'), api('/tgbot/rss').catch(() => rssData)]);
        tgBotData = tgRes;
        if (rssRes.success) rssData = rssRes;
      } catch (e) {}

      const cfg = tgBotData.config || {};
      const features = cfg.features || {};
      const openai = cfg.openai || {};

      content.innerHTML = \`
        <div class="card">
          <div class="card-header">
            <div class="card-title">TG 机器人</div>
            <span class="status \${tgBotData.running ? 'running' : 'stopped'}">\${tgBotData.running ? '运行中' : '已停止'}</span>
          </div>

          <div class="form-group">
            <label><input type="checkbox" id="tg-enabled" \${cfg.enabled ? 'checked' : ''}> 启用 TG 机器人</label>
          </div>

          <div class="form-group">
            <label>Bot Token</label>
            <input type="password" id="tg-token" value="\${cfg.token || ''}" placeholder="从 @BotFather 获取">
          </div>

          <div class="form-group">
            <label>API 地址 (可选，用于反代)</label>
            <input type="text" id="tg-api-base" value="\${cfg.apiBase || ''}" placeholder="留空使用官方 API">
          </div>

          <div class="form-group">
            <label>管理员 ID (可选)</label>
            <input type="text" id="tg-admin-id" value="\${cfg.adminId || ''}" placeholder="你的 Telegram 用户 ID">
          </div>

          <details style="margin-top:15px">
            <summary style="cursor:pointer;font-weight:500;margin-bottom:10px">OpenAI 配置 (聊天功能)</summary>
            <div class="form-group">
              <label>API 地址</label>
              <input type="text" id="tg-openai-base" value="\${openai.apiBase || 'https://api.openai.com/v1'}">
            </div>
            <div class="form-group">
              <label>API Key</label>
              <input type="password" id="tg-openai-key" value="\${openai.apiKey || ''}" placeholder="sk-...">
            </div>
            <div class="form-group">
              <label>模型</label>
              <input type="text" id="tg-openai-model" value="\${openai.model || 'gpt-3.5-turbo'}" placeholder="gpt-3.5-turbo">
            </div>
          </details>

          <details style="margin-top:15px">
            <summary style="cursor:pointer;font-weight:500;margin-bottom:10px">功能开关</summary>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px">
              <label><input type="checkbox" id="tg-feat-translate" \${features.translate !== false ? 'checked' : ''}> 翻译</label>
              <label><input type="checkbox" id="tg-feat-qrcode" \${features.qrcode !== false ? 'checked' : ''}> 二维码</label>
              <label><input type="checkbox" id="tg-feat-shorten" \${features.shorten !== false ? 'checked' : ''}> 短链接</label>
              <label><input type="checkbox" id="tg-feat-remind" \${features.remind !== false ? 'checked' : ''}> 提醒</label>
              <label><input type="checkbox" id="tg-feat-note" \${features.note !== false ? 'checked' : ''}> 备忘录</label>
              <label><input type="checkbox" id="tg-feat-rss" \${features.rss !== false ? 'checked' : ''}> RSS</label>
              <label><input type="checkbox" id="tg-feat-weather" \${features.weather !== false ? 'checked' : ''}> 天气</label>
              <label><input type="checkbox" id="tg-feat-rate" \${features.rate !== false ? 'checked' : ''}> 汇率</label>
              <label><input type="checkbox" id="tg-feat-chat" \${features.chat !== false ? 'checked' : ''}> AI聊天</label>
            </div>
          </details>

          <div class="btn-group" style="margin-top:20px">
            <button class="btn btn-primary btn-sm" onclick="saveTgBotConfig()">保存配置</button>
            \${tgBotData.running
              ? '<button class="btn btn-danger btn-sm" onclick="tgBotAction(\\'stop\\')">停止</button><button class="btn btn-sm" onclick="tgBotAction(\\'restart\\')">重启</button>'
              : '<button class="btn btn-sm" onclick="tgBotAction(\\'start\\')">启动</button>'
            }
          </div>
        </div>

        <div class="card" style="margin-top:15px">
          <div class="card-header">
            <div class="card-title">RSS 订阅管理</div>
          </div>

          <div class="form-row" style="align-items:flex-end">
            <div class="form-group" style="flex:1">
              <label>添加订阅</label>
              <input type="text" id="rss-url" placeholder="RSS/Atom Feed URL">
            </div>
            <div class="form-group" style="flex:0">
              <button class="btn btn-primary btn-sm" onclick="addRssFeed()">添加</button>
              <button class="btn btn-sm" onclick="testRssFeed()">测试</button>
            </div>
          </div>

          <div class="form-group">
            <label>推送目标 Chat ID (可选)</label>
            <input type="text" id="rss-chat-id" placeholder="留空则不自动推送，仅作为存储">
          </div>

          <div style="margin-top:15px">
            <label style="font-weight:500;margin-bottom:8px;display:block">订阅列表 (\${rssData.feeds.length})</label>
            <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px">
              \${rssData.feeds.length === 0 ? '<div style="padding:15px;text-align:center;color:var(--muted)">暂无订阅</div>' :
                rssData.feeds.map(f => \`
                  <div style="padding:10px 12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
                    <div style="flex:1;min-width:0">
                      <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">\${f.title || '未知'}</div>
                      <div style="font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">\${f.url}</div>
                    </div>
                    <button class="btn btn-danger btn-sm" style="margin-left:10px" onclick="deleteRssFeed(\${f.id})">删除</button>
                  </div>
                \`).join('')
              }
            </div>
          </div>

          <div style="margin-top:20px;padding-top:15px;border-top:1px solid var(--border)">
            <div class="form-row">
              <div class="form-group" style="flex:1">
                <label>关键词过滤 (白名单，为空则不过滤)</label>
                <div style="display:flex;gap:8px">
                  <input type="text" id="rss-keyword" placeholder="输入关键词" style="flex:1">
                  <button class="btn btn-sm" onclick="addRssKeyword('include')">添加</button>
                </div>
                <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:5px">
                  \${rssData.keywords.map(k => \`<span style="background:var(--success);color:white;padding:2px 8px;border-radius:10px;font-size:12px;display:inline-flex;align-items:center">\${k} <span style="margin-left:5px;cursor:pointer" onclick="deleteRssKeyword('\${k}','include')">&times;</span></span>\`).join('')}
                </div>
              </div>
              <div class="form-group" style="flex:1">
                <label>排除词 (黑名单)</label>
                <div style="display:flex;gap:8px">
                  <input type="text" id="rss-exclude" placeholder="输入排除词" style="flex:1">
                  <button class="btn btn-sm" onclick="addRssKeyword('exclude')">添加</button>
                </div>
                <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:5px">
                  \${rssData.excludes.map(k => \`<span style="background:var(--danger);color:white;padding:2px 8px;border-radius:10px;font-size:12px;display:inline-flex;align-items:center">\${k} <span style="margin-left:5px;cursor:pointer" onclick="deleteRssKeyword('\${k}','exclude')">&times;</span></span>\`).join('')}
                </div>
              </div>
            </div>
          </div>

          <div class="form-row" style="margin-top:15px;align-items:flex-end">
            <div class="form-group">
              <label>检查间隔 (分钟)</label>
              <input type="number" id="rss-interval" value="\${rssData.interval}" min="1" max="1440" style="width:100px">
            </div>
            <div class="form-group">
              <button class="btn btn-sm" onclick="saveRssInterval()">保存</button>
            </div>
          </div>
        </div>

        <div class="card" style="margin-top:15px">
          <div class="card-header">
            <div class="card-title">功能说明</div>
          </div>
          <div style="font-size:13px;color:var(--muted);line-height:1.8">
            <p><b>/tr</b> - 翻译文本 (支持多语言)</p>
            <p><b>/qr</b> - 生成二维码</p>
            <p><b>/short</b> - 生成短链接</p>
            <p><b>/remind</b> - 定时提醒 (支持时区)</p>
            <p><b>/note</b> - 备忘录管理</p>
            <p><b>/rss</b> - RSS 订阅推送</p>
            <p><b>/weather</b> - 查询天气</p>
            <p><b>/rate</b> - 汇率换算</p>
            <p><b>/chat</b> - AI 聊天回复建议</p>
            <p><b>/id</b> - 获取用户/群组 ID</p>
          </div>
        </div>
      \`;
    };

    window.saveTgBotConfig = async () => {
      try {
        const cfg = {
          enabled: document.getElementById('tg-enabled').checked,
          token: document.getElementById('tg-token').value.trim(),
          apiBase: document.getElementById('tg-api-base').value.trim(),
          adminId: document.getElementById('tg-admin-id').value.trim(),
          openai: {
            apiBase: document.getElementById('tg-openai-base').value.trim() || 'https://api.openai.com/v1',
            apiKey: document.getElementById('tg-openai-key').value.trim(),
            model: document.getElementById('tg-openai-model').value.trim() || 'gpt-3.5-turbo'
          },
          features: {
            translate: document.getElementById('tg-feat-translate').checked,
            qrcode: document.getElementById('tg-feat-qrcode').checked,
            shorten: document.getElementById('tg-feat-shorten').checked,
            remind: document.getElementById('tg-feat-remind').checked,
            note: document.getElementById('tg-feat-note').checked,
            rss: document.getElementById('tg-feat-rss').checked,
            weather: document.getElementById('tg-feat-weather').checked,
            rate: document.getElementById('tg-feat-rate').checked,
            chat: document.getElementById('tg-feat-chat').checked
          }
        };
        await api('/tgbot/config', 'POST', cfg);
        toast('TG 机器人配置已保存');
        renderTgBot();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.tgBotAction = async (action) => {
      try {
        await api('/tgbot/' + action, 'POST');
        toast(action === 'start' ? 'TG 机器人已启动' : action === 'stop' ? 'TG 机器人已停止' : 'TG 机器人已重启');
        renderTgBot();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.addRssFeed = async () => {
      const url = document.getElementById('rss-url').value.trim();
      const chatId = document.getElementById('rss-chat-id').value.trim();
      if (!url) return toast('请输入 RSS URL', 'error');
      try {
        const res = await api('/tgbot/rss/feed', 'POST', { url, chatId });
        toast('订阅成功: ' + res.title);
        document.getElementById('rss-url').value = '';
        renderTgBot();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.testRssFeed = async () => {
      const url = document.getElementById('rss-url').value.trim();
      if (!url) return toast('请输入 RSS URL', 'error');
      try {
        const res = await api('/tgbot/rss/test', 'POST', { url });
        if (res.success) {
          toast('解析成功: ' + res.title + ' (' + res.items.length + ' 条)');
        } else {
          toast('解析失败: ' + res.error, 'error');
        }
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.deleteRssFeed = async (id) => {
      if (!confirm('确定删除此订阅?')) return;
      try {
        await api('/tgbot/rss/feed/' + id, 'DELETE');
        toast('订阅已删除');
        renderTgBot();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.addRssKeyword = async (type) => {
      const inputId = type === 'include' ? 'rss-keyword' : 'rss-exclude';
      const keyword = document.getElementById(inputId).value.trim();
      if (!keyword) return toast('请输入关键词', 'error');
      try {
        await api('/tgbot/rss/keyword', 'POST', { keyword, type });
        toast('关键词已添加');
        document.getElementById(inputId).value = '';
        renderTgBot();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.deleteRssKeyword = async (keyword, type) => {
      try {
        await api('/tgbot/rss/keyword', 'DELETE', { keyword, type });
        toast('关键词已删除');
        renderTgBot();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.saveRssInterval = async () => {
      const interval = parseInt(document.getElementById('rss-interval').value) || 30;
      try {
        await api('/tgbot/rss/interval', 'POST', { interval });
        toast('检查间隔已保存 (重启生效)');
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    let discordData = { enabled: false, running: false, hasToken: false, config: {} };

    const renderDiscord = async () => {
      const content = document.getElementById('discord-content');
      if (!content) return;

      try {
        const res = await api('/discord');
        discordData = res;
      } catch (e) {}

      const cfg = discordData.config || {};
      const features = cfg.features || {};
      const openai = cfg.openai || {};

      content.innerHTML = \`
        <div class="card">
          <div class="card-header">
            <div class="card-title">Discord 机器人</div>
            <span style="font-size:12px;color:\${discordData.running ? 'var(--success)' : 'var(--muted)'}">\${discordData.running ? '运行中' + (discordData.username ? ' (' + discordData.username + ')' : '') : '已停止'}</span>
          </div>

          <div class="form-group">
            <label><input type="checkbox" id="dc-enabled" \${cfg.enabled ? 'checked' : ''}> 启用 Discord 机器人</label>
          </div>

          <div class="form-group">
            <label>Bot Token / User Token</label>
            <input type="password" id="dc-token" value="\${cfg.token || ''}" placeholder="Bot Token 或 User Token">
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>模式</label>
              <select id="dc-mode">
                <option value="bot" \${cfg.mode !== 'user' ? 'selected' : ''}>Bot (机器人)</option>
                <option value="user" \${cfg.mode === 'user' ? 'selected' : ''}>Self-bot (个人)</option>
              </select>
            </div>
            <div class="form-group">
              <label>命令前缀</label>
              <input type="text" id="dc-prefix" value="\${cfg.prefix || '>'}" placeholder="默认 >">
            </div>
          </div>

          <details style="margin-top:15px">
            <summary style="cursor:pointer;font-weight:500;margin-bottom:10px">OpenAI 配置 (聊天功能)</summary>
            <div class="form-group">
              <label>API 地址</label>
              <input type="text" id="dc-openai-base" value="\${openai.apiBase || 'https://api.openai.com/v1'}">
            </div>
            <div class="form-group">
              <label>API Key</label>
              <input type="password" id="dc-openai-key" value="\${openai.apiKey || ''}" placeholder="sk-...">
            </div>
            <div class="form-group">
              <label>模型</label>
              <input type="text" id="dc-openai-model" value="\${openai.model || 'gpt-3.5-turbo'}" placeholder="gpt-3.5-turbo">
            </div>
          </details>

          <details style="margin-top:15px">
            <summary style="cursor:pointer;font-weight:500;margin-bottom:10px">功能开关</summary>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px">
              <label><input type="checkbox" id="dc-feat-translate" \${features.translate !== false ? 'checked' : ''}> 翻译</label>
              <label><input type="checkbox" id="dc-feat-qrcode" \${features.qrcode !== false ? 'checked' : ''}> 二维码</label>
              <label><input type="checkbox" id="dc-feat-shorten" \${features.shorten !== false ? 'checked' : ''}> 短链接</label>
              <label><input type="checkbox" id="dc-feat-weather" \${features.weather !== false ? 'checked' : ''}> 天气</label>
              <label><input type="checkbox" id="dc-feat-rate" \${features.rate !== false ? 'checked' : ''}> 汇率</label>
              <label><input type="checkbox" id="dc-feat-chat" \${features.chat !== false ? 'checked' : ''}> AI聊天</label>
            </div>
          </details>

          <div class="btn-group" style="margin-top:20px">
            <button class="btn btn-primary btn-sm" onclick="saveDiscordConfig()">保存配置</button>
            \${discordData.running
              ? '<button class="btn btn-danger btn-sm" onclick="discordAction(\\'stop\\')">停止</button><button class="btn btn-sm" onclick="discordAction(\\'restart\\')">重启</button>'
              : '<button class="btn btn-sm" onclick="discordAction(\\'start\\')">启动</button>'
            }
          </div>
        </div>

        <div class="card" style="margin-top:15px">
          <div class="card-header">
            <div class="card-title">命令说明 (前缀: \${cfg.prefix || '>'})</div>
          </div>
          <div style="font-size:13px;color:var(--muted);line-height:1.8">
            <p><b>ping</b> - 测试延迟</p>
            <p><b>translate [语言] &lt;文本&gt;</b> - 翻译文本</p>
            <p><b>qr &lt;内容&gt;</b> - 生成二维码</p>
            <p><b>short &lt;URL&gt;</b> - 生成短链接</p>
            <p><b>weather &lt;城市&gt;</b> - 查询天气</p>
            <p><b>rate &lt;源&gt; &lt;目标&gt; [金额]</b> - 汇率换算</p>
            <p><b>chat &lt;内容&gt;</b> - AI 聊天回复建议</p>
          </div>
        </div>

        <div class="card" style="margin-top:15px">
          <div class="card-header">
            <div class="card-title">使用说明</div>
          </div>
          <div style="font-size:13px;color:var(--muted);line-height:1.8">
            <p>1. <b>Bot 模式</b>: 使用机器人的 Bot Token，需在开发者后台开启 Message Content Intent。</p>
            <p>2. <b>Self-bot 模式</b>: 使用个人的 User Token (F12 -> Application -> Storage -> Token)。</p>
            <p style="color:var(--warning)">注意: Self-bot 违反 Discord ToS，请谨慎使用。</p>
          </div>
        </div>
      \`;
    };

    window.saveDiscordConfig = async () => {
      try {
        const cfg = {
          enabled: document.getElementById('dc-enabled').checked,
          mode: document.getElementById('dc-mode').value,
          token: document.getElementById('dc-token').value.trim(),
          prefix: document.getElementById('dc-prefix').value.trim(),
          openai: {
            apiBase: document.getElementById('dc-openai-base').value.trim() || 'https://api.openai.com/v1',
            apiKey: document.getElementById('dc-openai-key').value.trim(),
            model: document.getElementById('dc-openai-model').value.trim() || 'gpt-3.5-turbo'
          },
          features: {
            translate: document.getElementById('dc-feat-translate').checked,
            qrcode: document.getElementById('dc-feat-qrcode').checked,
            shorten: document.getElementById('dc-feat-shorten').checked,
            weather: document.getElementById('dc-feat-weather').checked,
            rate: document.getElementById('dc-feat-rate').checked,
            chat: document.getElementById('dc-feat-chat').checked
          }
        };
        await api('/discord/config', 'POST', cfg);
        toast('Discord 机器人配置已保存');
        renderDiscord();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.discordAction = async (action) => {
      try {
        await api('/discord/' + action, 'POST');
        toast(action === 'start' ? 'Discord 机器人已启动' : action === 'stop' ? 'Discord 机器人已停止' : 'Discord 机器人已重启');
        renderDiscord();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.registerDiscordCommands = async () => {
      try {
        await api('/discord/register-commands', 'POST');
        toast('Discord 命令已注册');
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    let automationData = { webhookToken: '', tasks: [] };

    const renderAutomation = async () => {
      const content = document.getElementById('automation-content');
      if (!content) return;

      try {
        const res = await api('/automation');
        automationData = res.config;
      } catch (e) {}

      content.innerHTML = \`
        <div class="card">
          <div class="card-header">
            <div class="card-title">定时任务 (Scheduler)</div>
            <button class="btn btn-primary btn-sm" onclick="showTaskModal()">添加任务</button>
          </div>
          
          <div style="margin-top:15px">
            \${automationData.tasks.length === 0 ? '<div style="padding:20px;text-align:center;color:var(--muted)">暂无定时任务</div>' :
              automationData.tasks.map((task, index) => \`
                <div style="padding:12px;border:1px solid var(--border);border-radius:6px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;background:var(--bg)">
                  <div style="flex:1">
                    <div style="font-weight:500;display:flex;align-items:center;gap:8px">
                      \${task.name || '未命名任务'}
                      <span style="font-size:12px;padding:2px 6px;border-radius:4px;background:\${task.enabled ? 'var(--success)' : 'var(--muted)'};color:white">\${task.enabled ? '启用' : '禁用'}</span>
                      <span style="font-size:12px;padding:2px 6px;border-radius:4px;background:var(--primary);color:white">\${task.type === 'discord_msg' ? 'Discord 消息' : '服务器控制'}</span>
                    </div>
                    <div style="font-size:12px;color:var(--muted);margin-top:4px">
                      Cron: <code>\${task.cron}</code>
                      \${task.type === 'discord_msg' ? \` | 频道: \${task.params.channelId}\` : \` | 服务器: \${task.params.serverId} | 动作: \${task.params.action}\`}
                    </div>
                  </div>
                  <div style="display:flex;gap:8px">
                    <button class="btn btn-sm" onclick="runTask(\${index})">运行</button>
                    <button class="btn btn-sm" onclick="editTask(\${index})">编辑</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteTask(\${index})">删除</button>
                  </div>
                </div>
              \`).join('')
            }
          </div>
        </div>

        <div class="card" style="margin-top:15px">
          <div class="card-header">
            <div class="card-title">Webhook 集成</div>
            <button class="btn btn-sm" onclick="resetWebhookToken()">重置 Token</button>
          </div>
          
          <div class="form-group">
            <label>Webhook Token</label>
            <div style="display:flex;gap:10px">
              <input type="text" value="\${automationData.webhookToken}" readonly style="background:var(--bg);color:var(--muted)">
            </div>
          </div>

          <div class="form-group">
            <label>URL 生成器</label>
            <div style="display:flex;gap:10px;margin-bottom:10px">
              <select id="wh-type" onchange="updateWebhookGenerator()">
                <option value="server_control">服务器控制 (Server Control)</option>
                <option value="discord_msg">Discord 消息 (Discord Message)</option>
              </select>
            </div>
            
            <div id="wh-params-server">
              <div class="form-row">
                <div class="form-group">
                  <label>服务器 ID</label>
                  <input type="text" id="wh-server-id" placeholder="例如: server_123">
                </div>
                <div class="form-group">
                  <label>动作</label>
                  <select id="wh-action">
                    <option value="start">开机 (Start)</option>
                    <option value="restart">重启 (Restart)</option>
                    <option value="stop">关机 (Stop)</option>
                    <option value="kill">强制停止 (Kill)</option>
                  </select>
                </div>
              </div>
            </div>

            <div id="wh-params-discord" style="display:none">
              <div class="form-row">
                <div class="form-group">
                  <label>频道 ID</label>
                  <input type="text" id="wh-channel-id" placeholder="Discord Channel ID">
                </div>
                <div class="form-group">
                  <label>消息内容</label>
                  <input type="text" id="wh-content" placeholder="Hello World">
                </div>
              </div>
            </div>

            <div class="form-group">
              <label>生成的 URL (GET/POST)</label>
              <div style="display:flex;gap:10px">
                <input type="text" id="wh-url" readonly style="background:var(--bg)">
                <button class="btn btn-primary btn-sm" onclick="copyWebhookUrl()">复制</button>
                <button class="btn btn-sm" onclick="generateWebhookUrl()">生成</button>
              </div>
              <div style="font-size:12px;color:var(--muted);margin-top:5px">
                提示: 可以直接在浏览器访问此 URL，或配置到 UptimeRobot 等监控服务中。
              </div>
            </div>
          </div>
        </div>
      \`;
      updateWebhookGenerator();
    };

    window.updateWebhookGenerator = () => {
      const type = document.getElementById('wh-type').value;
      document.getElementById('wh-params-server').style.display = type === 'server_control' ? 'block' : 'none';
      document.getElementById('wh-params-discord').style.display = type === 'discord_msg' ? 'block' : 'none';
    };

    window.generateWebhookUrl = () => {
      const type = document.getElementById('wh-type').value;
      const token = automationData.webhookToken;
      const baseUrl = window.location.origin + '/api/webhook/' + token + '/' + type;
      let params = [];

      if (type === 'server_control') {
        const serverId = document.getElementById('wh-server-id').value.trim();
        const action = document.getElementById('wh-action').value;
        if (serverId) params.push('serverId=' + serverId);
        params.push('action=' + action);
      } else {
        const channelId = document.getElementById('wh-channel-id').value.trim();
        const content = document.getElementById('wh-content').value.trim();
        if (channelId) params.push('channelId=' + channelId);
        if (content) params.push('content=' + encodeURIComponent(content));
      }

      document.getElementById('wh-url').value = baseUrl + (params.length ? '?' + params.join('&') : '');
    };

    window.copyWebhookUrl = () => {
      const url = document.getElementById('wh-url').value;
      if (!url) return;
      navigator.clipboard.writeText(url).then(() => toast('URL 已复制'));
    };

    window.resetWebhookToken = async () => {
      if (!confirm('确定重置 Token? 旧的 Webhook URL 将失效。')) return;
      try {
        const res = await api('/automation/token', 'POST');
        automationData.webhookToken = res.token;
        renderAutomation();
        toast('Token 已重置');
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.showTaskModal = (index = -1) => {
      const task = index >= 0 ? automationData.tasks[index] : { enabled: true, type: 'discord_msg', cron: '0 8 * * *', params: {} };
      const isEdit = index >= 0;

      const modal = document.getElementById('modal');
      modal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-title">\${isEdit ? '编辑任务' : '添加任务'}</div>
            <button class="btn btn-sm" onclick="closeModal()">×</button>
          </div>
          <div class="form-group">
            <label>任务名称</label>
            <input type="text" id="task-name" value="\${task.name || ''}" placeholder="例如: 每日问候">
          </div>
          <div class="form-group">
            <label>任务类型</label>
            <select id="task-type" onchange="updateTaskParams()">
              <option value="discord_msg" \${task.type === 'discord_msg' ? 'selected' : ''}>Discord 消息</option>
              <option value="server_control" \${task.type === 'server_control' ? 'selected' : ''}>服务器控制</option>
            </select>
          </div>
          <div class="form-group">
            <label>Cron 表达式 (例如: 0 8 * * * 表示每天8点)</label>
            <input type="text" id="task-cron" value="\${task.cron || ''}" placeholder="* * * * *">
            <div style="font-size:12px;color:var(--muted);margin-top:4px">格式: 分 时 日 月 周</div>
          </div>
          <div class="form-group">
            <label><input type="checkbox" id="task-enabled" \${task.enabled ? 'checked' : ''}> 启用任务</label>
          </div>
          
          <div id="task-params-discord" style="display:none">
            <div class="form-group">
              <label>频道 ID</label>
              <input type="text" id="task-channel-id" value="\${task.params?.channelId || ''}">
            </div>
            <div class="form-group">
              <label>消息内容</label>
              <textarea id="task-content" rows="3">\${task.params?.content || ''}</textarea>
            </div>
          </div>

          <div id="task-params-server" style="display:none">
            <div class="form-group">
              <label>服务器 ID</label>
              <input type="text" id="task-server-id" value="\${task.params?.serverId || ''}">
            </div>
            <div class="form-group">
              <label>动作</label>
              <select id="task-action">
                <option value="start" \${task.params?.action === 'start' ? 'selected' : ''}>开机</option>
                <option value="restart" \${task.params?.action === 'restart' ? 'selected' : ''}>重启</option>
                <option value="stop" \${task.params?.action === 'stop' ? 'selected' : ''}>关机</option>
              </select>
            </div>
          </div>

          <div class="btn-group" style="margin-top:20px">
            <button class="btn btn-primary" onclick="saveTask(\${index})">保存</button>
            <button class="btn" onclick="closeModal()">取消</button>
          </div>
        </div>
      \`;
      modal.classList.add('open');
      
      window.updateTaskParams = () => {
        const type = document.getElementById('task-type').value;
        document.getElementById('task-params-discord').style.display = type === 'discord_msg' ? 'block' : 'none';
        document.getElementById('task-params-server').style.display = type === 'server_control' ? 'block' : 'none';
      };
      window.updateTaskParams();
    };

    window.saveTask = async (index) => {
      const type = document.getElementById('task-type').value;
      const task = {
        name: document.getElementById('task-name').value.trim(),
        type: type,
        cron: document.getElementById('task-cron').value.trim(),
        enabled: document.getElementById('task-enabled').checked,
        params: {}
      };

      if (type === 'discord_msg') {
        task.params.channelId = document.getElementById('task-channel-id').value.trim();
        task.params.content = document.getElementById('task-content').value.trim();
        if (!task.params.channelId || !task.params.content) return toast('请填写完整参数', 'error');
      } else {
        task.params.serverId = document.getElementById('task-server-id').value.trim();
        task.params.action = document.getElementById('task-action').value;
        if (!task.params.serverId) return toast('请填写服务器 ID', 'error');
      }

      const newTasks = [...automationData.tasks];
      if (index >= 0) newTasks[index] = task; else newTasks.push(task);

      try {
        await api('/automation/tasks', 'POST', newTasks);
        toast('任务已保存');
        closeModal();
        renderAutomation();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.editTask = (index) => showTaskModal(index);

    window.deleteTask = async (index) => {
      if (!confirm('确定删除此任务?')) return;
      const newTasks = automationData.tasks.filter((_, i) => i !== index);
      try {
        await api('/automation/tasks', 'POST', newTasks);
        toast('任务已删除');
        renderAutomation();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.runTask = async (index) => {
      try {
        const res = await api('/automation/run/' + index, 'POST');
        if (res.success) toast(res.message);
        else toast(res.error, 'error');
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    let logsConfig = { enabled: false, maxLines: 500, logTools: true, logBots: true, logApi: false };

    const renderSettings = async () => {
      const content = document.getElementById('settings-content');
      if (!content) return;

      try {
        const res = await api('/settings/logs');
        logsConfig = res.logs || logsConfig;
      } catch (e) {}

      content.innerHTML = \`
        <div class="card">
          <div class="card-header">
            <div class="card-title">日志设置</div>
            <a href="/logs" target="_blank" style="font-size:12px;color:var(--primary)">查看日志页面 →</a>
          </div>
          <div class="form-group">
            <label><input type="checkbox" id="log-enabled" \${logsConfig.enabled ? 'checked' : ''}> 启用日志记录</label>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>最大保留行数</label>
              <input type="number" id="log-max-lines" value="\${logsConfig.maxLines}" min="100" max="5000">
            </div>
          </div>
          <div class="form-group">
            <label>记录类别</label>
            <div style="display:flex;gap:15px;margin-top:8px">
              <label><input type="checkbox" id="log-tools" \${logsConfig.logTools ? 'checked' : ''}> 工具日志</label>
              <label><input type="checkbox" id="log-bots" \${logsConfig.logBots ? 'checked' : ''}> 机器人日志</label>
              <label><input type="checkbox" id="log-api" \${logsConfig.logApi ? 'checked' : ''}> API 日志</label>
            </div>
          </div>
          <div class="btn-group" style="margin-top:15px">
            <button class="btn btn-primary btn-sm" onclick="saveLogsConfig()">保存设置</button>
          </div>
        </div>
      \`;
    };

    window.saveLogsConfig = async () => {
      try {
        await api('/settings/logs', 'POST', {
          enabled: document.getElementById('log-enabled').checked,
          maxLines: parseInt(document.getElementById('log-max-lines').value) || 500,
          logTools: document.getElementById('log-tools').checked,
          logBots: document.getElementById('log-bots').checked,
          logApi: document.getElementById('log-api').checked
        });
        toast('日志设置已保存');
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.toolAction = async (name, action) => {
      try {
        await api('/tools/' + name + '/' + action, 'POST');
        toast(action === 'install' ? '安装成功' : action === 'uninstall' ? '已卸载' : action === 'start' ? '已启动' : action === 'delete' ? '已删除' : '已停止');
        const res = await api('/tools');
        toolsData = res.tools;
        renderTools();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.saveToolConfig = async (name) => {
      try {
        let cfg = {};
        if (name === '${_CK.t0}') {
          const mode = document.getElementById('s0-mode').value;
          cfg = {
            mode: mode,
            token: document.getElementById('s0-token')?.value || '',
            protocol: document.getElementById('s0-protocol')?.value || 'http',
            localPort: parseInt(document.getElementById('s0-port')?.value) || 3000
          };
        }
        if (name === '${_CK.t1}') {
          const mode = document.getElementById('s1-mode').value;
          if (mode === 'manual') {
            cfg = { mode: 'manual', config: document.getElementById('s1-config').value };
          } else {
            cfg = {
              mode: 'auto',
              port: parseInt(document.getElementById('s1-port').value) || 8001,
              uuid: document.getElementById('s1-uuid')?.value || '',
              password: document.getElementById('s1-password')?.value || '',
              ssMethod: document.getElementById('s1-method')?.value || 'aes-256-gcm',
              useCF: document.getElementById('s1-use-cf').checked,
              protocols: {
                '${_CK.p0}': { enabled: document.getElementById('s1-p0').checked, wsPath: document.getElementById('s1-p0-path').value || '${_DP._0}' },
                '${_CK.p1}': { enabled: document.getElementById('s1-p1').checked, wsPath: document.getElementById('s1-p1-path').value || '${_DP._1}' },
                '${_CK.p2}': { enabled: document.getElementById('s1-p2').checked, wsPath: document.getElementById('s1-p2-path').value || '${_DP._2}' },
                '${_CK.p3}': { enabled: document.getElementById('s1-p3').checked, wsPath: document.getElementById('s1-p3-path').value || '${_DP._3}' }
              },
              '${_CK.p4}': { enabled: document.getElementById('s1-u1').checked, port: parseInt(document.getElementById('s1-u1-port').value) || 0 },
              '${_CK.p5}': { enabled: document.getElementById('s1-u2').checked, port: parseInt(document.getElementById('s1-u2-port').value) || 0 }
            };
          }
        }
        if (name === '${_CK.t2}') {
          const version = document.getElementById('s2-version').value;
          cfg = {
            version: version,
            server: document.getElementById('s2-server').value,
            key: document.getElementById('s2-key').value
          };
          if (version === 'v0') {
            cfg.tls = document.getElementById('s2-tls').checked;
          } else {
            cfg.uuid = document.getElementById('s2-uuid')?.value || '';
            cfg.insecure = document.getElementById('s2-insecure').checked;
            cfg.gpu = document.getElementById('s2-gpu').checked;
            cfg.temperature = document.getElementById('s2-temp').checked;
            cfg.useIPv6 = document.getElementById('s2-ipv6').checked;
            cfg.disableAutoUpdate = document.getElementById('s2-no-update').checked;
            cfg.disableCommandExecute = document.getElementById('s2-no-cmd').checked;
          }
        }
        if (name === '${_CK.t3}') {
          cfg = {
            server: document.getElementById('s3-server').value,
            key: document.getElementById('s3-key').value,
            insecure: document.getElementById('s3-insecure').checked,
            gpu: document.getElementById('s3-gpu').checked,
            disableAutoUpdate: document.getElementById('s3-no-update').checked
          };
        }

        await api('/tools/' + name + '/config', 'POST', cfg);
        toast('配置已保存');
        const res = await api('/tools');
        toolsData = res.tools;
        renderTools();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.restartTool = async (name) => {
      try {
        await api('/tools/' + name + '/restart', 'POST');
        toast('已重启');
        const res = await api('/tools');
        toolsData = res.tools;
        renderTools();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.deleteTool = async (name) => {
      if (!confirm('确定删除？这将清除配置和二进制文件')) return;
      try {
        await api('/tools/' + name + '/delete', 'POST');
        toast('已删除');
        const res = await api('/tools');
        toolsData = res.tools;
        renderTools();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.saveAndStartTool = async (name) => {
      try {
        let cfg = {};
        if (name === '${_CK.t0}') {
          const mode = document.getElementById('s0-mode').value;
          cfg = {
            mode: mode,
            token: document.getElementById('s0-token')?.value || '',
            protocol: document.getElementById('s0-protocol')?.value || 'http',
            localPort: parseInt(document.getElementById('s0-port')?.value) || 3000
          };
        }
        if (name === '${_CK.t1}') {
          const mode = document.getElementById('s1-mode').value;
          if (mode === 'manual') {
            cfg = { mode: 'manual', config: document.getElementById('s1-config').value };
          } else {
            cfg = {
              mode: 'auto',
              port: parseInt(document.getElementById('s1-port').value) || 8001,
              uuid: document.getElementById('s1-uuid')?.value || '',
              password: document.getElementById('s1-password')?.value || '',
              ssMethod: document.getElementById('s1-method')?.value || 'aes-256-gcm',
              useCF: document.getElementById('s1-use-cf').checked,
              protocols: {
                '${_CK.p0}': { enabled: document.getElementById('s1-p0').checked, wsPath: document.getElementById('s1-p0-path').value || '${_DP._0}' },
                '${_CK.p1}': { enabled: document.getElementById('s1-p1').checked, wsPath: document.getElementById('s1-p1-path').value || '${_DP._1}' },
                '${_CK.p2}': { enabled: document.getElementById('s1-p2').checked, wsPath: document.getElementById('s1-p2-path').value || '${_DP._2}' },
                '${_CK.p3}': { enabled: document.getElementById('s1-p3').checked, wsPath: document.getElementById('s1-p3-path').value || '${_DP._3}' }
              },
              '${_CK.p4}': { enabled: document.getElementById('s1-u1').checked, port: parseInt(document.getElementById('s1-u1-port').value) || 0 },
              '${_CK.p5}': { enabled: document.getElementById('s1-u2').checked, port: parseInt(document.getElementById('s1-u2-port').value) || 0 }
            };
          }
        }
        if (name === '${_CK.t2}') {
          const version = document.getElementById('s2-version').value;
          cfg = {
            version: version,
            server: document.getElementById('s2-server').value,
            key: document.getElementById('s2-key').value
          };
          if (version === 'v0') {
            cfg.tls = document.getElementById('s2-tls').checked;
          } else {
            cfg.uuid = document.getElementById('s2-uuid')?.value || '';
            cfg.insecure = document.getElementById('s2-insecure').checked;
            cfg.gpu = document.getElementById('s2-gpu').checked;
            cfg.temperature = document.getElementById('s2-temp').checked;
            cfg.useIPv6 = document.getElementById('s2-ipv6').checked;
            cfg.disableAutoUpdate = document.getElementById('s2-no-update').checked;
            cfg.disableCommandExecute = document.getElementById('s2-no-cmd').checked;
          }
        }
        if (name === '${_CK.t3}') {
          cfg = {
            server: document.getElementById('s3-server').value,
            key: document.getElementById('s3-key').value,
            insecure: document.getElementById('s3-insecure').checked,
            gpu: document.getElementById('s3-gpu').checked,
            disableAutoUpdate: document.getElementById('s3-no-update').checked
          };
        }

        await api('/tools/' + name + '/config', 'POST', cfg);
        await api('/tools/' + name + '/start', 'POST');
        toast('已启动');
        const res = await api('/tools');
        toolsData = res.tools;
        renderTools();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.showAddServer = () => {
      document.getElementById('modal').innerHTML = \`
        <div class="modal-content">
          <div class="modal-header"><h3>添加服务器</h3><button class="modal-close" onclick="closeModal()">&times;</button></div>
          <div class="form-group">
            <label>类型</label>
            <select id="add-type"><option value="minecraft">游戏服务器</option><option value="panel">仅面板</option></select>
          </div>
          <div class="form-group"><label>名称</label><input id="add-name" placeholder="我的服务器"></div>
          <div class="form-row">
            <div class="form-group"><label>地址</label><input id="add-host" placeholder="mc.example.com"></div>
            <div class="form-group"><label>端口</label><input id="add-port" value="25565"></div>
          </div>
          <div class="form-group"><label>用户名 (留空随机)</label><input id="add-user"></div>
          <div class="btn-group" style="justify-content:flex-end;margin-top:20px">
            <button class="btn btn-primary" onclick="addServer()">添加</button>
          </div>
        </div>
      \`;
      document.getElementById('modal').classList.add('open');
    };

    window.addServer = async () => {
      try {
        await api('/bots/add', 'POST', {
          name: document.getElementById('add-name').value,
          type: document.getElementById('add-type').value,
          host: document.getElementById('add-host').value,
          port: parseInt(document.getElementById('add-port').value) || 25565,
          username: document.getElementById('add-user').value
        });
        toast('添加成功');
        closeModal();
        const res = await api('/bots');
        botsData = res;
        renderServers();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    window.showServerDetail = (id) => {
      selectedBot = botsData[id];
      if (!selectedBot) return;
      const modes = selectedBot.modes || {};
      const autoChat = selectedBot.autoChat || {};
      const restartTimer = selectedBot.restartTimer || {};

      document.getElementById('modal').innerHTML = \`
        <div class="modal-content" style="max-width:700px">
          <div class="modal-header">
            <h3 style="display:flex;align-items:center;gap:10px">
              <span style="width:10px;height:10px;border-radius:50%;background:\${selectedBot.connected ? '#22c55e' : '#6b7280'}"></span>
              \${selectedBot.name || selectedBot.id}
            </h3>
            <button class="modal-close" onclick="closeModal()">&times;</button>
          </div>

          <div class="tabs" style="border:none;margin-bottom:10px">
            <button class="tab active" onclick="showDetailTab('main',this)">${_d('5Li76aG1')}</button>
            <button class="tab" onclick="showDetailTab('control',this)">${_d('5o6n5Yi2')}</button>
            <button class="tab" onclick="showDetailTab('settings',this)">${_d('6K6+572u')}</button>
          </div>

          <div id="detail-main" class="tab-content active" style="padding:0 15px 15px">
            <div id="config-view" style="background:var(--bg);border-radius:6px;padding:10px;margin-bottom:10px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div style="font-size:12px"><span style="color:var(--muted)">\${selectedBot.host || '-'}:\${selectedBot.port || 25565}</span> <span style="margin-left:8px">\${selectedBot.username || '-'}</span></div>
                <div style="display:flex;gap:4px">
                  <button class="btn btn-sm" onclick="toggleConfigEdit()" style="padding:2px 6px">✏️</button>
                  \${selectedBot.connected ? '<button class="btn btn-warning btn-sm" onclick="disconnectBot()" style="padding:2px 8px">${_d('5pat5byA')}</button><button class="btn btn-sm" onclick="refreshBot()" style="padding:2px 6px">🔄</button>' : '<button class="btn btn-success btn-sm" onclick="connectBot()" style="padding:2px 8px">${_d('6L+e5o6l')}</button>'}
                </div>
              </div>
            </div>
            <div id="config-edit" style="display:none;background:var(--bg);border-radius:6px;padding:10px;margin-bottom:10px">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                <div class="form-group" style="margin:0"><label style="font-size:10px">${_d('5Zyw5Z2A')}</label><input id="edit-host" value="\${selectedBot.host || ''}" style="padding:4px 6px;font-size:12px"></div>
                <div class="form-group" style="margin:0"><label style="font-size:10px">${_d('56uv5Y+j')}</label><input id="edit-port" value="\${selectedBot.port || 25565}" style="padding:4px 6px;font-size:12px"></div>
                <div class="form-group" style="margin:0"><label style="font-size:10px">${_d('5ZCN56ew')}</label><input id="edit-name" value="\${selectedBot.name || ''}" style="padding:4px 6px;font-size:12px"></div>
                <div class="form-group" style="margin:0"><label style="font-size:10px">${_d('55So5oi35ZCN')}</label><input id="edit-user" value="\${selectedBot.username || ''}" style="padding:4px 6px;font-size:12px"></div>
              </div>
              <div style="display:flex;gap:4px;margin-top:8px">
                <button class="btn btn-primary btn-sm" onclick="saveBot();toggleConfigEdit()" style="padding:2px 8px">${_d('5L+d5a2Y')}</button>
                <button class="btn btn-sm" onclick="toggleConfigEdit()" style="padding:2px 8px">${_d('5Y+W5raI')}</button>
                <button class="btn btn-danger btn-sm" onclick="deleteBot()" style="padding:2px 8px;margin-left:auto">${_d('5Yig6Zmk')}</button>
              </div>
            </div>

            \${selectedBot.connected ? \`
            <div style="display:flex;gap:8px;font-size:11px;margin-bottom:8px;padding:6px 8px;background:var(--bg);border-radius:6px">
              <span>❤️\${selectedBot.health || 0}</span><span>🍖\${selectedBot.food || 0}</span><span>📍\${selectedBot.position ? \`\${selectedBot.position.x},\${selectedBot.position.y},\${selectedBot.position.z}\` : '-'}</span><span>👥\${(selectedBot.players || []).length}</span>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px">\${modes.invincible ? '<span style="background:#d97706;color:white;padding:1px 5px;border-radius:6px;font-size:10px">🛡️</span>' : ''}\${modes.follow ? '<span style="background:#6366f1;color:white;padding:1px 5px;border-radius:6px;font-size:10px">👤</span>' : ''}\${modes.autoAttack ? '<span style="background:#ef4444;color:white;padding:1px 5px;border-radius:6px;font-size:10px">⚔️</span>' : ''}\${modes.patrol ? '<span style="background:#8b5cf6;color:white;padding:1px 5px;border-radius:6px;font-size:10px">🚶</span>' : ''}\${modes.mining ? '<span style="background:#f59e0b;color:white;padding:1px 5px;border-radius:6px;font-size:10px">⛏️</span>' : ''}\${modes.aiView ? '<span style="background:#10b981;color:white;padding:1px 5px;border-radius:6px;font-size:10px">👁️</span>' : ''}\${modes.autoChat ? '<span style="background:#3b82f6;color:white;padding:1px 5px;border-radius:6px;font-size:10px">💬</span>' : ''}\${restartTimer.enabled ? '<span style="background:#6b7280;color:white;padding:1px 5px;border-radius:6px;font-size:10px">⏰' + restartTimer.intervalMinutes + 'm</span>' : ''}</div>
            \` : ''}

            <div style="background:var(--bg);border-radius:6px;padding:8px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
                <span style="font-size:11px;font-weight:500">${_d('5pel5b+X')}</span>
                <div><button class="btn btn-sm" onclick="loadBotLogs()" style="padding:1px 5px;font-size:10px">🔄</button><button class="btn btn-sm" onclick="clearBotLogs()" style="padding:1px 5px;font-size:10px;margin-left:3px">${_d('5riF56m6')}</button></div>
              </div>
              <div id="bot-logs" style="height:100px;overflow-y:auto;font-family:monospace;font-size:10px;background:var(--card);border-radius:4px;padding:5px"><div style="color:var(--muted);text-align:center">${_d('5Yqg6L295LitLi4u')}</div></div>
            </div>
          </div>

          <div id="detail-control" class="tab-content" style="padding:0 15px 15px">
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px">
              <label style="display:flex;align-items:center;gap:6px;padding:6px;background:var(--bg);border-radius:5px;cursor:pointer;font-size:11px">
                <input type="checkbox" id="mode-aiView" \${modes.aiView ? 'checked' : ''} onchange="toggleMode('aiView')">👁️ AI
              </label>
              <label style="display:flex;align-items:center;gap:6px;padding:6px;background:var(--bg);border-radius:5px;cursor:pointer;font-size:11px">
                <input type="checkbox" id="mode-patrol" \${modes.patrol ? 'checked' : ''} onchange="toggleMode('patrol')">🚶 ${_d('5beh6YC7')}
              </label>
              <label style="display:flex;align-items:center;gap:6px;padding:6px;background:var(--bg);border-radius:5px;cursor:pointer;font-size:11px">
                <input type="checkbox" id="mode-autoAttack" \${modes.autoAttack ? 'checked' : ''} onchange="toggleMode('autoAttack')">⚔️ ${_d('5pS75Ye7')}
              </label>
              <label style="display:flex;align-items:center;gap:6px;padding:6px;background:var(--bg);border-radius:5px;cursor:pointer;font-size:11px">
                <input type="checkbox" id="mode-invincible" \${modes.invincible ? 'checked' : ''} onchange="toggleMode('invincible')">🛡️ ${_d('5peg5pWM')}
              </label>
              <label style="display:flex;align-items:center;gap:6px;padding:6px;background:var(--bg);border-radius:5px;cursor:pointer;font-size:11px">
                <input type="checkbox" id="mode-autoChat" \${modes.autoChat ? 'checked' : ''} onchange="toggleMode('autoChat')">� ${_d('5Zac6K+d')}
              </label>
              <label style="display:flex;align-items:center;gap:6px;padding:6px;background:var(--bg);border-radius:5px;cursor:pointer;font-size:11px">
                <input type="checkbox" id="mode-mining" \${modes.mining ? 'checked' : ''} onchange="toggleMode('mining')">⛏️ ${_d('5oyW55+/')}
              </label>
            </div>

            <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px">
              <div style="display:flex;gap:6px;margin-bottom:8px">
                <select id="follow-target" style="flex:1;padding:4px 6px;font-size:11px">
                  <option value="">${_d('6YCJ5oup546p5a62')}</option>
                  \${(selectedBot.players || []).filter(p => p !== selectedBot.username).map(p => \`<option value="\${p}">\${p}</option>\`).join('')}
                </select>
                <button class="btn \${modes.follow ? 'btn-danger' : 'btn-primary'} btn-sm" onclick="toggleFollow()" style="padding:2px 8px;font-size:11px">
                  \${modes.follow ? '⏹️' : '👤 ${_d('6Lef6ZqP')}'}
                </button>
              </div>
            </div>

            <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px">
              <div style="display:flex;gap:6px;margin-bottom:8px">
                <select id="attack-mode" style="flex:1;padding:4px 6px;font-size:11px">
                  <option value="hostile">${_d('5pWM5a+555Sf54mp')}</option>
                  <option value="all">${_d('5omA5pyJ55Sf54mp')}</option>
                  <option value="player">${_d('546p5a62')}</option>
                </select>
                <button class="btn \${modes.autoAttack ? 'btn-danger' : 'btn-primary'} btn-sm" onclick="toggleAttack()" style="padding:2px 8px;font-size:11px">
                  \${modes.autoAttack ? '⏹️' : '⚔️ ${_d('5pS75Ye7')}'}
                </button>
              </div>
            </div>

            <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px">
              <div style="display:flex;flex-wrap:wrap;gap:4px">
                <button class="btn btn-sm" onclick="doAction('jump')" style="padding:2px 6px;font-size:11px">🦘</button>
                <button class="btn btn-sm" onclick="doAction('sneak')" style="padding:2px 6px;font-size:11px">🧎</button>
                <button class="btn btn-sm" onclick="doAction('swing')" style="padding:2px 6px;font-size:11px">👊</button>
                <button class="btn btn-sm" onclick="doAction('useItem')" style="padding:2px 6px;font-size:11px">🖐️</button>
                <button class="btn btn-danger btn-sm" onclick="stopAllBehaviors()" style="padding:2px 6px;font-size:11px">⏹️</button>
              </div>
            </div>

            <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px">
              <div style="display:flex;gap:6px;margin-bottom:6px">
                <input type="number" id="autochat-interval" value="\${Math.floor((autoChat.interval || 60000) / 1000)}" min="10" style="width:60px;padding:4px 6px;font-size:11px" placeholder="${_d('6Ze06ZqU')}">
                <textarea id="autochat-messages" style="flex:1;height:30px;padding:4px 6px;font-size:11px" placeholder="${_d('5raI5oGv')}">\${(autoChat.messages || ['Hello!']).join('\\n')}</textarea>
                <button class="btn btn-primary btn-sm" onclick="saveAutoChatConfig()" style="padding:2px 8px;font-size:11px">${_d('5L+d5a2Y')}</button>
              </div>
            </div>

            <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px">
              <div style="display:flex;gap:6px;align-items:center">
                <input type="number" id="restart-interval" value="\${restartTimer.intervalMinutes || 0}" min="0" style="width:60px;padding:4px 6px;font-size:11px" placeholder="${_d('5YiG6ZKf')}">
                <button class="btn btn-primary btn-sm" onclick="setRestartTimer()" style="padding:2px 8px;font-size:11px">${_d('6K6+572u')}</button>
                <button class="btn btn-warning btn-sm" onclick="restartNow()" style="padding:2px 8px;font-size:11px">${_d('56uL5Y2z6YeN5ZCv')}</button>
                \${restartTimer.enabled ? '<span style="font-size:10px;color:var(--success);margin-left:auto">${_d('5LiL5qyhOiA=')}' + new Date(restartTimer.nextRestart).toLocaleTimeString() + '</span>' : ''}
              </div>
            </div>
            <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px">
              <div style="display:flex;gap:6px">
                <input id="chat-msg" placeholder="${_d('6L6T5YWl5raI5oGv')}" style="flex:1;padding:4px 6px;font-size:11px">
                <button class="btn btn-primary btn-sm" onclick="sendChat()" style="padding:2px 8px;font-size:11px">${_d('5Y+R6YCB')}</button>
              </div>
            </div>
          </div>

          <div id="detail-settings" class="tab-content" style="padding:0 15px 15px">
            <div id="panel-config-view" style="background:var(--bg);border-radius:6px;padding:8px;margin-bottom:8px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:11px;color:var(--muted)">\${selectedBot.pterodactyl?.url ? selectedBot.pterodactyl.url.replace('https://','').replace('http://','').substring(0,20) + '...' : '${_d('5pyq6YWN572u')}'}</span>
                <button class="btn btn-sm" onclick="togglePanelConfigEdit()" style="padding:2px 6px">✏️</button>
              </div>
            </div>
            <div id="panel-config-edit" style="display:none;background:var(--bg);border-radius:6px;padding:8px;margin-bottom:8px">
              <div style="display:grid;grid-template-columns:1fr;gap:4px;margin-bottom:6px">
                <input id="panel-url" value="\${selectedBot.pterodactyl?.url || ''}" placeholder="${_d('6Z2i5p2/5Zyw5Z2A')}" style="padding:4px 6px;font-size:11px">
                <input type="password" id="panel-key" value="\${selectedBot.pterodactyl?.apiKey || ''}" placeholder="API Key" style="padding:4px 6px;font-size:11px">
                <input id="panel-id" value="\${selectedBot.pterodactyl?.serverId || ''}" placeholder="${_d('5pyN5Yqh5ZmoIElE')}" style="padding:4px 6px;font-size:11px">
              </div>
              <div style="display:flex;gap:4px">
                <button class="btn btn-primary btn-sm" onclick="savePanelConfig();togglePanelConfigEdit()" style="padding:2px 8px;font-size:11px">${_d('5L+d5a2Y')}</button>
                <button class="btn btn-sm" onclick="togglePanelConfigEdit()" style="padding:2px 8px;font-size:11px">${_d('5Y+W5raI')}</button>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:8px">
              <button class="btn btn-success btn-sm" onclick="sendPower('start')" style="padding:4px 0;font-size:10px">🟢${_d('5byA5py6')}</button>
              <button class="btn btn-warning btn-sm" onclick="sendPower('stop')" style="padding:4px 0;font-size:10px">�${_d('5YWz5py6')}</button>
              <button class="btn btn-primary btn-sm" onclick="sendPower('restart')" style="padding:4px 0;font-size:10px">�${_d('6YeN5ZCv')}</button>
              <button class="btn btn-danger btn-sm" onclick="sendPower('kill')" style="padding:4px 0;font-size:10px">⚡${_d('5by65Yi2')}</button>
            </div>
            <div style="display:flex;gap:4px;margin-bottom:8px">
              <button class="btn btn-sm" onclick="autoOpBot()" style="padding:2px 6px;font-size:10px">👑OP</button>
              <button class="btn btn-sm" onclick="panelRestart()" style="padding:2px 6px;font-size:10px">🔄restart</button>
            </div>
            <div style="display:flex;gap:4px;margin-bottom:8px">
              <input id="panel-cmd" placeholder="say hello" style="flex:1;padding:4px 6px;font-size:11px">
              <button class="btn btn-primary btn-sm" onclick="sendCmd()" style="padding:2px 8px;font-size:11px">${_d('5Y+R6YCB')}</button>
            </div>
            <div style="border-top:1px solid var(--border);padding-top:8px;margin-top:8px">
              <div style="display:flex;gap:4px;margin-bottom:6px">
                <button class="btn \${selectedBot.fileAccessType === 'pterodactyl' || !selectedBot.fileAccessType ? 'btn-primary' : ''} btn-sm" onclick="setFileAccessType('pterodactyl')" style="padding:2px 6px;font-size:10px">${_d('6Z2i5p2/')}</button>
                <button class="btn \${selectedBot.fileAccessType === 'sftp' ? 'btn-primary' : ''} btn-sm" onclick="setFileAccessType('sftp')" style="padding:2px 6px;font-size:10px">SFTP</button>
                <button class="btn \${selectedBot.fileAccessType === 'none' ? 'btn-primary' : ''} btn-sm" onclick="setFileAccessType('none')" style="padding:2px 6px;font-size:10px">${_d('56aB55So')}</button>
              </div>
              <div id="sftp-config" style="\${selectedBot.fileAccessType === 'sftp' ? '' : 'display:none'}">
                <div style="display:grid;grid-template-columns:2fr 1fr;gap:4px;margin-bottom:4px">
                  <input id="sftp-host" value="\${selectedBot.sftp?.host || ''}" placeholder="${_d('5Li75py6')}" style="padding:4px 6px;font-size:11px">
                  <input id="sftp-port" value="\${selectedBot.sftp?.port || 22}" placeholder="${_d('56uv5Y+j')}" style="padding:4px 6px;font-size:11px">
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:4px">
                  <input id="sftp-user" value="\${selectedBot.sftp?.username || ''}" placeholder="${_d('55So5oi35ZCN')}" style="padding:4px 6px;font-size:11px">
                  <input type="password" id="sftp-pass" value="\${selectedBot.sftp?.password || ''}" placeholder="${_d('5a+G56CB')}" style="padding:4px 6px;font-size:11px">
                </div>
                <input id="sftp-base" value="\${selectedBot.sftp?.basePath || '/'}" placeholder="${_d('5Z+656GA6Lev5b6E')}" style="width:100%;padding:4px 6px;font-size:11px;margin-bottom:4px">
                <button class="btn btn-primary btn-sm" onclick="saveSftpConfig()" style="padding:2px 8px;font-size:11px">${_d('5L+d5a2Y')}</button>
              </div>
              <button class="btn btn-success btn-sm" onclick="loadFiles()" style="padding:2px 8px;font-size:11px;margin-top:6px">📁 ${_d('5rWP6KeI5paH5Lu2')}</button>
            </div>
            <div id="file-browser" style="margin-top:8px"></div>
          </div>
        </div>
      \`;
      document.getElementById('modal').classList.add('open');
      loadBotLogs();
    };

    window.toggleMode = async (mode) => {
      const enabled = document.getElementById('mode-' + mode).checked;
      try {
        await api('/bots/' + selectedBot.id + '/mode', 'POST', { mode, enabled });
        toast(mode + (enabled ? ' ${_d('5bey5byA5ZCv')}' : ' ${_d('5bey5YWz6Zet')}'));
        const res = await api('/bots');
        botsData = res;
      } catch (e) { toast(e.message, 'error'); }
    };

    window.doAction = async (action) => {
      try {
        await api('/bots/' + selectedBot.id + '/action', 'POST', { action });
        toast(action + ' ${_d('5bey5omn6KGM')}');
      } catch (e) { toast(e.message, 'error'); }
    };

    window.stopAllBehaviors = async () => {
      try {
        await api('/bots/' + selectedBot.id + '/behavior', 'POST', { behavior: 'follow', enabled: false });
        await api('/bots/' + selectedBot.id + '/behavior', 'POST', { behavior: 'attack', enabled: false });
        await api('/bots/' + selectedBot.id + '/behavior', 'POST', { behavior: 'patrol', enabled: false });
        await api('/bots/' + selectedBot.id + '/behavior', 'POST', { behavior: 'mining', enabled: false });
        toast('${_d('5bey5YGc5q2i5omA5pyJ6KGM5Li6')}');
        const res = await api('/bots');
        botsData = res;
        showServerDetail(selectedBot.id);
      } catch (e) { toast(e.message, 'error'); }
    };

    window.toggleFollow = async () => {
      const target = document.getElementById('follow-target').value;
      const modes = selectedBot.modes || {};
      try {
        if (modes.follow) {
          await api('/bots/' + selectedBot.id + '/behavior', 'POST', { behavior: 'follow', enabled: false });
          toast('${_d('5bey5YGc5q2i6Lef6ZqP')}');
        } else {
          if (!target) { toast('${_d('6K+36YCJ5oup546p5a62')}', 'error'); return; }
          await api('/bots/' + selectedBot.id + '/behavior', 'POST', { behavior: 'follow', enabled: true, options: { target } });
          toast('${_d('5byA5aeL6Lef6ZqPOiA=')}' + target);
        }
        const res = await api('/bots');
        botsData = res;
        showServerDetail(selectedBot.id);
      } catch (e) { toast(e.message, 'error'); }
    };

    window.toggleAttack = async () => {
      const mode = document.getElementById('attack-mode').value;
      const modes = selectedBot.modes || {};
      try {
        if (modes.autoAttack) {
          await api('/bots/' + selectedBot.id + '/behavior', 'POST', { behavior: 'attack', enabled: false });
          toast('${_d('5bey5YGc5q2i5pS75Ye7')}');
        } else {
          await api('/bots/' + selectedBot.id + '/behavior', 'POST', { behavior: 'attack', enabled: true, options: { mode } });
          toast('${_d('5byA5aeL5pS75Ye7OiA=')}' + (mode === 'hostile' ? '${_d('5pWM5a+555Sf54mp')}' : mode === 'all' ? '${_d('5omA5pyJ55Sf54mp')}' : '${_d('546p5a62')}'));
        }
        const res = await api('/bots');
        botsData = res;
        showServerDetail(selectedBot.id);
      } catch (e) { toast(e.message, 'error'); }
    };

    window.autoOpBot = async () => {
      try {
        const res = await api('/bots/' + selectedBot.id + '/auto-op', 'POST');
        toast(res.message || '${_d('5bey5Y+R6YCBIE9QIOWRveS7pA==')}');
      } catch (e) { toast(e.message, 'error'); }
    };

    window.panelRestart = async () => {
      try {
        await api('/bots/' + selectedBot.id + '/panel-command', 'POST', { command: 'restart' });
        toast('${_d('5bey5Y+R6YCBIHJlc3RhcnQg5Yiw5o6n5Yi25Y+w')}');
      } catch (e) { toast(e.message, 'error'); }
    };

    window.setFileAccessType = async (type) => {
      try {
        await api('/bots/' + selectedBot.id + '/file-access-type', 'POST', { type });
        toast('${_d('5paH5Lu26K6/6Zeu5pa55byP5bey6K6+572uOiA=')}' + (type === 'pterodactyl' ? '${_d('57+86b6Z6Z2i5p2/')}' : type === 'sftp' ? 'SFTP' : '${_d('56aB55So')}'));
        const res = await api('/bots');
        botsData = res;
        showServerDetail(selectedBot.id);
      } catch (e) { toast(e.message, 'error'); }
    };

    window.saveAutoChatConfig = async () => {
      try {
        const interval = parseInt(document.getElementById('autochat-interval').value) * 1000;
        const messages = document.getElementById('autochat-messages').value.split('\\n').filter(m => m.trim());
        await api('/bots/' + selectedBot.id + '/autochat', 'POST', { interval, messages });
        toast('${_d('6Ieq5Yqo5Zac6K+d6YWN572u5bey5L+d5a2Y')}');
      } catch (e) { toast(e.message, 'error'); }
    };

    window.setRestartTimer = async () => {
      try {
        const minutes = parseInt(document.getElementById('restart-interval').value) || 0;
        await api('/bots/' + selectedBot.id + '/restart-timer', 'POST', { minutes });
        toast(minutes > 0 ? '${_d('5a6a5pe26YeN5ZCv5bey6K6+572uOiDmr48g')}' + minutes + ' ${_d('IOWIhumSn+aJp+ihjA==')}' : '${_d('5a6a5pe26YeN5ZCv5bey56aB55So')}');
        const res = await api('/bots');
        botsData = res;
        showServerDetail(selectedBot.id);
      } catch (e) { toast(e.message, 'error'); }
    };

    window.restartNow = async () => {
      try {
        await api('/bots/' + selectedBot.id + '/restart-now', 'POST');
        toast('${_d('5bey5Y+R6YCBIC9yZXN0YXJ0IOWRveS7pA==')}');
      } catch (e) { toast(e.message, 'error'); }
    };

    window.sendChat = async () => {
      const msg = document.getElementById('chat-msg').value.trim();
      if (!msg) return;
      try {
        await api('/bots/' + selectedBot.id + '/chat', 'POST', { message: msg });
        toast('${_d('5raI5oGv5bey5Y+R6YCB')}');
        document.getElementById('chat-msg').value = '';
      } catch (e) { toast(e.message, 'error'); }
    };

    window.showDetailTab = (tab, btn) => {
      document.querySelectorAll('#modal .tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('#modal .tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById('detail-' + tab).classList.add('active');
      if (tab === 'logs') loadBotLogs();
    };

    window.toggleConfigEdit = () => {
      const view = document.getElementById('config-view');
      const edit = document.getElementById('config-edit');
      if (view && edit) {
        if (edit.style.display === 'none') {
          view.style.display = 'none';
          edit.style.display = 'block';
        } else {
          view.style.display = 'block';
          edit.style.display = 'none';
        }
      }
    };

    window.togglePanelConfigEdit = () => {
      const view = document.getElementById('panel-config-view');
      const edit = document.getElementById('panel-config-edit');
      if (view && edit) {
        if (edit.style.display === 'none') {
          view.style.display = 'none';
          edit.style.display = 'block';
        } else {
          view.style.display = 'block';
          edit.style.display = 'none';
        }
      }
    };

    window.saveBot = async () => {
      try {
        await api('/bots/' + selectedBot.id, 'PUT', {
          name: document.getElementById('edit-name').value,
          host: document.getElementById('edit-host').value,
          port: parseInt(document.getElementById('edit-port').value),
          username: document.getElementById('edit-user').value
        });
        toast('${_d('5bey5L+d5a2Y')}');
        const res = await api('/bots');
        botsData = res;
        renderServers();
      } catch (e) { toast(e.message, 'error'); }
    };

    window.connectBot = async () => {
      try {
        await api('/bots/' + selectedBot.id + '/connect', 'POST');
        toast('${_d('5q2j5Zyo6L+e5o6lLi4u')}');
      } catch (e) { toast(e.message, 'error'); }
    };

    window.disconnectBot = async () => {
      try {
        await api('/bots/' + selectedBot.id + '/disconnect', 'POST');
        toast('${_d('5bey5pat5byA')}');
      } catch (e) { toast(e.message, 'error'); }
    };

    window.deleteBot = async () => {
      if (!confirm('${_d('56Gu5a6a5Yig6Zmk')}?')) return;
      try {
        await api('/bots/' + selectedBot.id, 'DELETE');
        toast('${_d('5bey5Yig6Zmk')}');
        closeModal();
        const res = await api('/bots');
        botsData = res;
        renderServers();
      } catch (e) { toast(e.message, 'error'); }
    };

    window.refreshBot = async () => {
      try {
        await api('/bots/' + selectedBot.id + '/refresh', 'POST');
        toast('${_d('5q2j5Zyo5Yi35paw6YeN6L+eLi4u')}');
      } catch (e) { toast(e.message, 'error'); }
    };

    window.loadBotLogs = async () => {
      try {
        const res = await api('/bots/' + selectedBot.id + '/logs');
        const container = document.getElementById('bot-logs');
        if (!res.logs || res.logs.length === 0) {
          container.innerHTML = '<div style="color:var(--muted);text-align:center">${_d('5pqC5peg5pel5b+X')}</div>';
          return;
        }
        container.innerHTML = res.logs.map(l => \`<div style="padding:3px 0;border-bottom:1px solid var(--border)"><span style="color:var(--muted)">\${l.time?.split('T')[1]?.split('.')[0] || ''}</span> <span style="color:\${l.type === 'error' ? 'var(--danger)' : l.type === 'success' ? 'var(--success)' : l.type === 'chat' ? 'var(--primary)' : 'var(--text)'}">\${l.msg}</span></div>\`).join('');
        container.scrollTop = container.scrollHeight;
      } catch (e) { toast(e.message, 'error'); }
    };

    window.clearBotLogs = async () => {
      try {
        await api('/bots/' + selectedBot.id + '/logs', 'DELETE');
        document.getElementById('bot-logs').innerHTML = '<div style="color:var(--muted);text-align:center">${_d('5pel5b+X5bey5riF56m6')}</div>';
        toast('${_d('5pel5b+X5bey5riF56m6')}');
      } catch (e) { toast(e.message, 'error'); }
    };

    window.savePanelConfig = async () => {
      try {
        await api('/bots/' + selectedBot.id, 'PUT', {
          pterodactyl: {
            url: document.getElementById('panel-url').value,
            apiKey: document.getElementById('panel-key').value,
            serverId: document.getElementById('panel-id').value
          }
        });
        toast('${_d('5bey5L+d5a2Y')}');
      } catch (e) { toast(e.message, 'error'); }
    };

    window.sendPower = async (signal) => {
      try {
        await api('/bots/' + selectedBot.id + '/power', 'POST', { signal });
        toast('已发送: ' + signal);
      } catch (e) { toast(e.message, 'error'); }
    };

    window.sendCmd = async () => {
      try {
        await api('/bots/' + selectedBot.id + '/command', 'POST', { command: document.getElementById('panel-cmd').value });
        toast('已发送');
        document.getElementById('panel-cmd').value = '';
      } catch (e) { toast(e.message, 'error'); }
    };

    window.saveSftpConfig = async () => {
      try {
        await api('/bots/' + selectedBot.id, 'PUT', {
          sftp: {
            host: document.getElementById('sftp-host').value,
            port: parseInt(document.getElementById('sftp-port').value),
            username: document.getElementById('sftp-user').value,
            password: document.getElementById('sftp-pass').value,
            basePath: document.getElementById('sftp-base').value
          }
        });
        toast('已保存');
      } catch (e) { toast(e.message, 'error'); }
    };

    window.loadFiles = async (dir = '/') => {
      currentPath = dir;
      try {
        const res = await api('/bots/' + selectedBot.id + '/files?dir=' + encodeURIComponent(dir));
        document.getElementById('file-browser').innerHTML = \`
          <div style="margin-bottom:10px;color:var(--muted)">当前: \${dir} \${dir !== '/' ? '<a href="#" onclick="loadFiles(\\'/\\');return false" style="color:var(--primary)">返回根目录</a>' : ''}</div>
          <div class="file-list">
            \${dir !== '/' ? '<div class="file-item" onclick="loadFiles(\\'' + dir.split('/').slice(0,-1).join('/') + '\\' || \\'/\\')">📁 ..</div>' : ''}
            \${res.files.map(f => \`<div class="file-item" onclick="\${f.isFile ? 'viewFile(\\'' + dir + '/' + f.name + '\\')' : 'loadFiles(\\'' + dir + '/' + f.name + '\\')'}">\${f.isFile ? '📄' : '📁'} <span class="file-name">\${f.name}</span><span class="file-size">\${f.isFile ? formatSize(f.size) : ''}</span></div>\`).join('')}
          </div>
        \`;
      } catch (e) { toast(e.message, 'error'); }
    };

    window.viewFile = async (path) => {
      try {
        const res = await api('/bots/' + selectedBot.id + '/files/read?path=' + encodeURIComponent(path));
        document.getElementById('file-browser').innerHTML = \`
          <div style="margin-bottom:10px"><a href="#" onclick="loadFiles('\${currentPath}');return false" style="color:var(--primary)">← 返回</a> <strong>\${path.split('/').pop()}</strong></div>
          <textarea id="file-content" style="width:100%;height:300px;font-family:monospace">\${escapeHtml(res.content)}</textarea>
          <div class="btn-group" style="margin-top:10px"><button class="btn btn-primary btn-sm" onclick="saveFile('\${path}')">保存</button></div>
        \`;
      } catch (e) { toast(e.message, 'error'); }
    };

    window.saveFile = async (path) => {
      try {
        await api('/bots/' + selectedBot.id + '/files/write?path=' + encodeURIComponent(path), 'POST', document.getElementById('file-content').value);
        toast('已保存');
      } catch (e) { toast(e.message, 'error'); }
    };

    window.closeModal = () => document.getElementById('modal').classList.remove('open');

    const formatSize = (bytes) => {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1048576).toFixed(1) + ' MB';
    };

    const escapeHtml = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    render();
  </script>
</body>
</html>`;

app.get('/', (req, res) => res.send(HTML));

const PORT = config.port;

config.servers.forEach(s => {
  const bot = new BotInstance(s);
  bots.set(s.id, bot);
  if (s.type === 'minecraft' && s.host) {
    bot.connect().catch(e => log('bot', 'error', `[Bot:${s.id}] 连接失败: ${e.message}`));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  log('tool', 'info', `MineBot Toolbox 运行在端口 ${PORT}`);

  if (config.tgbot.enabled && config.tgbot.token) {
    startTgBot().catch(e => log('tool', 'error', `[TGBot] 自动启动失败: ${e.message}`));
  }

  if (config.discord.enabled && config.discord.token) {
    startDiscordBot().catch(e => log('tool', 'error', `[Discord] 自动启动失败: ${e.message}`));
  }

  startScheduler();
});

const cleanup = () => {
  log('tool', 'info', '正在停止...');
  stopTgBot();
  stopDiscordBot();
  bots.forEach(b => b.disconnect());
  toolProcesses.forEach((_, name) => stopToolProcess(name));
  process.exit(0);
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
