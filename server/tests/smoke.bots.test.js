import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

async function startApp(botManager, agentGateway) {
  const app = express();
  app.get('/api/bots', (req, res) => {
    const statuses = botManager.getAllStatus();
    const enriched = {};
    Object.entries(statuses).forEach(([id, status]) => {
      const agentId = status?.agentId;
      const agentStatus = agentId ? agentGateway.getStatus(agentId) : null;
      enriched[id] = { ...status, agentStatus };
    });
    res.json(enriched);
  });

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address();
      resolve({
        close: () => new Promise((done) => server.close(done)),
        baseUrl: `http://127.0.0.1:${address.port}`
      });
    });
  });
}

test('bots smoke: list endpoint returns enriched bot statuses', async () => {
  const botManager = {
    getAllStatus() {
      return {
        s1: { id: 's1', connected: true, agentId: 'agent_1' },
        s2: { id: 's2', connected: false }
      };
    }
  };

  const agentGateway = {
    getStatus(agentId) {
      return { connected: agentId === 'agent_1' };
    }
  };

  const app = await startApp(botManager, agentGateway);
  const response = await fetch(`${app.baseUrl}/api/bots`);
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.s1.connected, true);
  assert.equal(json.s1.agentStatus.connected, true);
  assert.equal(json.s2.agentStatus, null);

  await app.close();
});
