import crypto from 'crypto';
import { WebSocketServer } from 'ws';

export class AgentGateway {
  constructor(registry, onStatusChange = null) {
    this.registry = registry;
    this.onStatusChange = onStatusChange;
    this.connections = new Map();
    this.pending = new Map();
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', (ws) => this.handleConnection(ws));
  }

  handleUpgrade(req, socket, head) {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req);
    });
  }

  getStatus(agentId) {
    const entry = this.connections.get(agentId);
    if (!entry) return { connected: false, lastSeen: null };
    return { connected: true, lastSeen: entry.lastSeen };
  }

  async request(agentId, action, payload, timeoutMs = 15000) {
    const entry = this.connections.get(agentId);
    if (!entry) {
      throw new Error('Agent not connected');
    }
    const id = crypto.randomUUID();
    const msg = { type: 'REQ', id, action, payload, ts: Math.floor(Date.now() / 1000) };
    entry.ws.send(JSON.stringify(msg));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Agent request timeout'));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
    });
  }

  handleConnection(ws) {
    let authedAgentId = null;

    const authTimeout = setTimeout(() => {
      if (!authedAgentId) ws.close();
    }, 10000);

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === 'AUTH') {
        const ok = this.handleAuth(ws, msg);
        if (ok) {
          authedAgentId = msg.payload?.agentId;
          clearTimeout(authTimeout);
        } else {
          ws.close();
        }
        return;
      }

      if (!authedAgentId) return;

      if (msg.type === 'RES' && msg.id) {
        const pending = this.pending.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(msg.id);
          pending.resolve(msg.payload);
        }
        return;
      }

      if (msg.type === 'PONG') {
        const entry = this.connections.get(authedAgentId);
        if (entry) entry.lastSeen = Date.now();
      }
    });

    ws.on('close', () => {
      if (authedAgentId) {
        this.connections.delete(authedAgentId);
        if (this.onStatusChange) {
          this.onStatusChange(authedAgentId, this.getStatus(authedAgentId));
        }
      }
    });
  }

  handleAuth(ws, msg) {
    const { agentId, nonce, ts, sig } = msg.payload || {};
    if (!agentId || !nonce || !ts || !sig) return false;
    const record = this.registry.get(agentId);
    if (!record || !record.token) return false;

    const payload = `${agentId}${nonce}${ts}`;
    const expected = crypto.createHmac('sha256', record.token).update(payload).digest('hex');
    if (expected !== sig) return false;

    this.connections.set(agentId, { ws, lastSeen: Date.now() });
    ws.send(JSON.stringify({ type: 'RES', id: 'auth', payload: { success: true } }));
    if (this.onStatusChange) {
      this.onStatusChange(agentId, this.getStatus(agentId));
    }
    return true;
  }
}
