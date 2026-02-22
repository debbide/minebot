import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AGENTS_FILE = path.join(__dirname, '../data/agents.json');

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
    this.agents = Array.isArray(data.agents) ? data.agents : [];
  }

  save() {
    fs.writeFileSync(AGENTS_FILE, JSON.stringify({ agents: this.agents }, null, 2));
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
}
