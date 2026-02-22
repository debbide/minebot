import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AGENTS_FILE = path.join(__dirname, '../data/agents.json');
const MASTER_KEY_FILE = path.join(__dirname, '../data/master.key');

function getMasterPassword() {
  if (process.env.MASTER_PASSWORD) return process.env.MASTER_PASSWORD;
  if (fs.existsSync(MASTER_KEY_FILE)) {
    return fs.readFileSync(MASTER_KEY_FILE, 'utf-8').trim() || null;
  }
  return null;
}

function ensureMasterPassword() {
  let masterPassword = getMasterPassword();
  if (!masterPassword) {
    masterPassword = crypto.randomBytes(32).toString('base64');
    fs.mkdirSync(path.dirname(MASTER_KEY_FILE), { recursive: true });
    fs.writeFileSync(MASTER_KEY_FILE, masterPassword, { mode: 0o600 });
  }
  return masterPassword;
}

function deriveKey(masterPassword, salt) {
  return crypto.pbkdf2Sync(masterPassword, salt, 100000, 32, 'sha256');
}

function encryptToken(token) {
  const masterPassword = ensureMasterPassword();
  const salt = crypto.randomBytes(16);
  const key = deriveKey(masterPassword, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(token), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authTag: authTag.toString('base64'),
    salt: salt.toString('base64')
  };
}

function decryptToken(payload) {
  const masterPassword = getMasterPassword();
  if (!masterPassword || !payload) return null;
  try {
    const salt = Buffer.from(payload.salt, 'base64');
    const key = deriveKey(masterPassword, salt);
    const iv = Buffer.from(payload.iv, 'base64');
    const ciphertext = Buffer.from(payload.ciphertext, 'base64');
    const authTag = Buffer.from(payload.authTag, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export class AgentRegistry {
  constructor() {
    this.agents = [];
    this.load();
  }

  load() {
    if (!fs.existsSync(AGENTS_FILE)) {
      fs.mkdirSync(path.dirname(AGENTS_FILE), { recursive: true });
      fs.writeFileSync(AGENTS_FILE, JSON.stringify({ agents: [] }, null, 2));
    }
    const raw = fs.readFileSync(AGENTS_FILE, 'utf8');
    const data = JSON.parse(raw);
    const rawAgents = Array.isArray(data.agents) ? data.agents : [];
    this.agents = rawAgents
      .map(agent => {
        const token = agent.tokenEnc
          ? decryptToken(agent.tokenEnc)
          : agent.token;
        return {
          agentId: agent.agentId,
          name: agent.name || agent.agentId,
          token
        };
      })
      .filter(agent => agent.agentId);
  }

  save() {
    const diskAgents = this.agents.map(agent => ({
      agentId: agent.agentId,
      name: agent.name || agent.agentId,
      tokenEnc: agent.token ? encryptToken(agent.token) : null
    }));
    fs.writeFileSync(AGENTS_FILE, JSON.stringify({ agents: diskAgents }, null, 2));
  }

  list() {
    return this.agents;
  }

  get(agentId) {
    return this.agents.find(a => a.agentId === agentId) || null;
  }

  upsert(agent) {
    const existing = this.get(agent.agentId);
    if (existing) {
      Object.assign(existing, agent);
    } else {
      this.agents.push(agent);
    }
    this.save();
    return agent;
  }

  remove(agentId) {
    const index = this.agents.findIndex(a => a.agentId === agentId);
    if (index === -1) return false;
    this.agents.splice(index, 1);
    this.save();
    return true;
  }
}
