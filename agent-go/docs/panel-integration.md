# Panel Integration Notes

This agent expects a WebSocket server on the panel side. The server should:

- Accept WSS connections on `/agent/ws`
- Receive `AUTH` and validate HMAC
- Maintain a map of `agentId -> connection`
- Route actions from panel UI/API to the agent
- Return responses to the caller

## Minimal Node.js WS Server (outline)
```js
import { WebSocketServer } from "ws";
import crypto from "crypto";

const agents = new Map();

function sign(token, payload) {
  return crypto.createHmac("sha256", token).update(payload).digest("hex");
}

const wss = new WebSocketServer({ port: 8080, path: "/agent/ws" });

wss.on("connection", (ws, req) => {
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "AUTH") {
      const { agentId, nonce, ts, sig } = msg.payload;
      const expected = sign(getToken(agentId), agentId + nonce + ts);
      if (sig !== expected) return ws.close();
      agents.set(agentId, ws);
      ws.send(JSON.stringify({ type: "RES", id: "auth", payload: { success: true } }));
      return;
    }
    // forward responses to pending requests by id
  });

  ws.on("close", () => {
    for (const [id, conn] of agents.entries()) {
      if (conn === ws) agents.delete(id);
    }
  });
});
```

## Routing Actions
Panel HTTP API can forward requests:

1. Receive HTTP request from UI
2. Build `REQ` message with `id` and `action`
3. Send to agent WS connection
4. Wait for `RES` with same `id`
5. Return HTTP response to UI

## Suggested HTTP endpoints
- `GET /api/agents/:agentId/host-stats`
- `GET /api/agents/:agentId/processes?limit=50`
- `POST /api/agents/:agentId/request` (generic action)
