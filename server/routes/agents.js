export function registerAgentRoutes(app, { agentRegistry, agentGateway }) {
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
}
