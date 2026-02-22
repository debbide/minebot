import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_FILE = path.join(__dirname, '../data/config.json');
const CREDENTIALS_FILE = path.join(__dirname, '../data/credentials.json');

// ============================================================================
// 加密工具函数 (Encryption Infrastructure)
// ============================================================================

/**
 * 使用 PBKDF2 从主密码生成加密密钥
 * @param {string} masterPassword - 主密码
 * @param {Buffer} salt - 盐值 (如果为null则生成新盐)
 * @returns {{key: Buffer, salt: Buffer}} - 派生密钥和盐值
 */
function generateMasterKey(masterPassword, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(16);
  }

  const key = crypto.pbkdf2Sync(masterPassword, salt, 100000, 32, 'sha256');
  return { key, salt };
}

/**
 * 使用 AES-256-GCM 加密配置数据
 * @param {object} data - 要加密的配置对象
 * @param {Buffer} masterKey - 加密密钥
 * @returns {{iv: string, ciphertext: string, authTag: string}} - 加密数据 (Base64编码)
 */
function encryptConfig(data, masterKey) {
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);

  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    authTag: authTag.toString('base64')
  };
}

/**
 * 使用 AES-256-GCM 解密配置数据
 * @param {{iv: string, ciphertext: string, authTag: string}} encrypted - 加密数据 (Base64编码)
 * @param {Buffer} masterKey - 解密密钥
 * @returns {object} - 原始配置对象
 */
function decryptConfig(encrypted, masterKey) {
  try {
    const iv = Buffer.from(encrypted.iv, 'base64');
    const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');
    const authTag = Buffer.from(encrypted.authTag, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  } catch (error) {
    throw new Error(`Failed to decrypt config: ${error.message}`);
  }
}

/**
 * 获取 Master Password (从环境变量)
 * @returns {string|null}
 */
function getMasterPassword() {
  return process.env.MASTER_PASSWORD || null;
}

/**
 * 检查配置文件是否加密
 * @param {object} config - 配置对象
 * @returns {boolean}
 */
function isEncryptedConfig(config) {
  return config && config.encrypted === true && config.version === '2.0';
}

export class ConfigManager {
  constructor() {
    this.config = this.loadConfig();
    this.credentials = this.loadCredentials();
  }

  ensureDataDir() {
    const dataDir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const rawConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));

        // 检查是否是加密配置
        if (isEncryptedConfig(rawConfig)) {
          const masterPassword = getMasterPassword();
          if (!masterPassword) {
            throw new Error('Config is encrypted but MASTER_PASSWORD is not set in environment');
          }

          // 派生密钥用于解密
          const salt = Buffer.from(rawConfig.salt, 'base64');
          const { key } = generateMasterKey(masterPassword, salt);

          // 解密配置
          const decrypted = decryptConfig(rawConfig.data, key);
          return decrypted;
        }

        // 检查是否需要迁移到加密格式
        if (rawConfig && !rawConfig.encrypted) {
          console.warn('⚠️  Detected unencrypted config.json. It will be encrypted on next save.');
          console.warn('   Set MASTER_PASSWORD environment variable to enable encryption.');
          return rawConfig;
        }

        return rawConfig;
      }
    } catch (error) {
      console.error('❌ Error loading config:', error.message);
    }
    return this.getDefaultConfig();
  }

  loadCredentials() {
    try {
      if (fs.existsSync(CREDENTIALS_FILE)) {
        return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
      }
    } catch (error) {
      console.error('Error loading credentials:', error);
    }
    return {};
  }

  getDefaultConfig() {
    return {
      server: {
        host: 'localhost',
        port: 25565,
        username: '', // Empty = auto-generate random name
        version: false // false = auto-detect
      },
      // Multi-server support
      servers: [
        // Example:
        // { id: 'server1', name: 'Main Server', host: 'mc.example.com', port: 25565 }
      ],
      ai: {
        enabled: true,
        model: 'gpt-3.5-turbo',
        baseURL: '',
        apiKey: '',
        systemPrompt: ''
      },
      telegram: {
        enabled: false,
        botToken: '',
        chatId: ''
      },
      auth: {
        username: 'admin',
        password: 'admin123'
      },
      autoChat: {
        enabled: false,
        interval: 60000,
        messages: [
          '欢迎来到服务器！',
          '有问题可以问我 !ask [问题]',
          '需要帮助请输入 !help'
        ]
      },
      autoRenew: {
        enabled: false,
        url: '',
        method: 'GET',
        headers: {},
        body: '',
        interval: 300000
      },
      modes: {
        aiView: false,
        patrol: false,
        autoChat: false
      },
      proxyNodes: [] // 全局代理节点库
    };
  }

  getConfig() {
    return {
      ...this.config,
      ai: {
        ...this.config.ai,
        apiKey: this.config.ai?.apiKey ? '***' : ''
      },
      telegram: {
        ...this.config.telegram,
        botToken: this.config.telegram?.botToken ? '***' : ''
      }
    };
  }

  getFullConfig() {
    return this.config;
  }

  updateConfig(updates) {
    this.config = {
      ...this.config,
      ...updates
    };
    this.saveConfig();
    return this.config;
  }

  updateCredentials(credentials) {
    this.credentials = {
      ...this.credentials,
      ...credentials
    };

    // Also update config with panel credentials
    if (credentials.panelUrl) {
      this.config.panel = {
        ...this.config.panel,
        url: credentials.panelUrl,
        id: credentials.id,
        path: credentials.path,
        apiKey: credentials.apiKey
      };
      this.saveConfig();
    }

    this.saveCredentials();
  }

  saveConfig() {
    try {
      this.ensureDataDir();
      const masterPassword = getMasterPassword();

      if (masterPassword) {
        // 加密配置
        const { key, salt } = generateMasterKey(masterPassword);
        const encrypted = encryptConfig(this.config, key);

        const encryptedConfig = {
          encrypted: true,
          version: '2.0',
          salt: salt.toString('base64'),
          data: encrypted
        };

        fs.writeFileSync(CONFIG_FILE, JSON.stringify(encryptedConfig, null, 2));
        console.log('✅ Config saved (encrypted with AES-256-GCM)');
      } else {
        // 明文保存 (不推荐用于生产环境)
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
        console.warn('⚠️  Config saved in plaintext. Set MASTER_PASSWORD to enable encryption.');
      }
    } catch (error) {
      console.error('❌ Error saving config:', error.message);
      throw error;
    }
  }

  saveCredentials() {
    try {
      this.ensureDataDir();
      fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(this.credentials, null, 2));
    } catch (error) {
      console.error('Error saving credentials:', error);
      throw error;
    }
  }

  getServerConfig() {
    return this.config.server || {};
  }

  getAIConfig() {
    return this.config.ai || {};
  }

  setServerConfig(serverConfig) {
    this.config.server = {
      ...this.config.server,
      ...serverConfig
    };
    this.saveConfig();
  }

  setAIConfig(aiConfig) {
    this.config.ai = {
      ...this.config.ai,
      ...aiConfig
    };
    this.saveConfig();
  }

  // Multi-server management
  getServers() {
    return this.config.servers || [];
  }

  getServer(id) {
    const servers = this.config.servers || [];
    return servers.find(s => s.id === id) || null;
  }

  addServer(serverConfig) {
    if (!this.config.servers) {
      this.config.servers = [];
    }

    // Generate ID if not provided
    if (!serverConfig.id) {
      serverConfig.id = `server_${Date.now()}`;
    }

    // Check for duplicate
    const existing = this.config.servers.find(s => s.id === serverConfig.id);
    if (existing) {
      throw new Error(`Server ${serverConfig.id} already exists`);
    }

    // 确保每个服务器有完整的独立配置
    // type: 'minecraft' (默认，游戏服务器) | 'panel' (纯面板服务器)
    const serverType = serverConfig.type || 'minecraft';

    const fullConfig = {
      id: serverConfig.id,
      name: serverConfig.name || `Server ${serverConfig.id}`,
      type: serverType,
      // 游戏服务器需要的字段
      host: serverConfig.host || '',
      port: serverConfig.port || 25565,
      username: serverConfig.username || '',
      version: serverConfig.version || false,
      // 独立的模式设置
      modes: serverConfig.modes || {
        aiView: false,
        patrol: false,
        autoChat: false,
        invincible: false
      },
      // 独立的自动喊话配置
      autoChat: serverConfig.autoChat || {
        enabled: false,
        interval: 60000,
        messages: ['Hello!', '有人吗?']
      },
      // 独立的定时重启配置
      restartTimer: serverConfig.restartTimer || {
        enabled: false,
        intervalMinutes: 0,
        command: '/restart'
      },
      // 独立的翼龙面板配置
      pterodactyl: serverConfig.pterodactyl || {
        url: '',
        apiKey: '',
        serverId: ''
      },
      // 独立的 SFTP 配置
      sftp: serverConfig.sftp || {
        host: '',
        port: 22,
        username: '',
        password: '',
        privateKey: '',
        basePath: '/'
      },
      // 文件访问方式: 'pterodactyl' | 'sftp' | 'none'
      fileAccessType: serverConfig.fileAccessType || 'pterodactyl',
      // 是否自动OP
      autoOp: serverConfig.autoOp !== false,
      agentId: serverConfig.agentId || null,
      rcon: serverConfig.rcon || {
        enabled: false,
        host: '',
        port: 25575,
        password: ''
      },
      commandSettings: serverConfig.commandSettings || {
        allowAll: false,
        cooldownSeconds: 3,
        whitelist: [],
        silentReject: false,
        globalCooldownSeconds: 1,
        maxPerMinute: 20
      },
      behaviorSettings: serverConfig.behaviorSettings || {
        attack: {
          whitelist: [],
          minHealth: 6
        },
        patrol: {
          waypoints: []
        }
      }
    };

    this.config.servers.push(fullConfig);
    this.saveConfig();
    return fullConfig;
  }

  updateServer(id, updates) {
    const index = this.config.servers?.findIndex(s => s.id === id);
    if (index === -1 || index === undefined) {
      throw new Error(`Server ${id} not found`);
    }

    // 深度合并更新
    const current = this.config.servers[index];
    this.config.servers[index] = {
      ...current,
      ...updates,
      // 确保嵌套对象也被正确合并
      modes: { ...current.modes, ...(updates.modes || {}) },
      autoChat: { ...current.autoChat, ...(updates.autoChat || {}) },
      restartTimer: { ...current.restartTimer, ...(updates.restartTimer || {}) },
      pterodactyl: updates.pterodactyl === null
        ? null
        : { ...current.pterodactyl, ...(updates.pterodactyl || {}) },
      sftp: { ...current.sftp, ...(updates.sftp || {}) },
      rcon: { ...current.rcon, ...(updates.rcon || {}) },
      agentId: updates.agentId !== undefined ? updates.agentId : current.agentId,
      commandSettings: { ...current.commandSettings, ...(updates.commandSettings || {}) },
      behaviorSettings: { ...current.behaviorSettings, ...(updates.behaviorSettings || {}) },
      proxyNodeId: updates.proxyNodeId !== undefined ? updates.proxyNodeId : current.proxyNodeId
    };
    console.log(`[ConfigManager] 更新服务器 ${id} 配置项:`, Object.keys(updates));
    this.saveConfig();
    return this.config.servers[index];
  }

  removeServer(id) {
    if (!this.config.servers) return false;

    const index = this.config.servers.findIndex(s => s.id === id);
    if (index === -1) return false;

    this.config.servers.splice(index, 1);
    this.saveConfig();
    return true;
  }

  reorderServers(orderedIds) {
    if (!this.config.servers || !Array.isArray(orderedIds)) return false;

    const serverMap = new Map(this.config.servers.map(s => [s.id, s]));
    const reordered = [];

    for (const id of orderedIds) {
      const server = serverMap.get(id);
      if (server) {
        reordered.push(server);
        serverMap.delete(id);
      }
    }

    // 添加任何未在 orderedIds 中的服务器到末尾
    for (const server of serverMap.values()) {
      reordered.push(server);
    }

    this.config.servers = reordered;
    this.saveConfig();
    return true;
  }

  /**
   * 迁移配置文件到加密格式
   * @returns {boolean} - 是否成功迁移
   */
  migrateToEncrypted() {
    const masterPassword = getMasterPassword();

    if (!masterPassword) {
      console.warn('⚠️  Cannot migrate: MASTER_PASSWORD not set');
      return false;
    }

    // 检查是否已经加密
    if (isEncryptedConfig(this.config)) {
      console.log('ℹ️  Config is already encrypted');
      return true;
    }

    try {
      // 备份原始配置
      const backupFile = CONFIG_FILE + '.bak';
      if (!fs.existsSync(backupFile)) {
        fs.copyFileSync(CONFIG_FILE, backupFile);
        console.log(`✅ Backup created: ${backupFile}`);
      }

      // 加密并保存
      this.saveConfig();
      console.log('✅ Config successfully migrated to encrypted format');
      return true;
    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      return false;
    }
  }

  /**
   * 获取加密状态
   * @returns {boolean} - 是否已加密
   */
  isConfigEncrypted() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const rawConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        return isEncryptedConfig(rawConfig);
      }
    } catch (error) {
      // Silently fail
    }
    return false;
  }
}
