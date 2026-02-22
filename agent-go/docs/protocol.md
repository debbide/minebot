# Agent Protocol (v1)

All messages are JSON with a common envelope:

```json
{
  "type": "AUTH|PING|PONG|REQ|RES|EVENT",
  "id": "uuid",
  "action": "START|STOP|RESTART|KILL|COMMAND|STATS|HOST_STATS|PROCESS_LIST|LOGS|LIST|READ|WRITE|MKDIR|DELETE|RENAME|COPY|COMPRESS|DECOMPRESS|UPLOAD_INIT|UPLOAD_CHUNK|UPLOAD_FINISH|DOWNLOAD_INIT|DOWNLOAD_CHUNK",
  "payload": {},
  "ts": 1730000000
}
```

## AUTH
Request (Agent -> Panel)
```json
{
  "type": "AUTH",
  "payload": {
    "agentId": "node-001",
    "nonce": "random",
    "ts": 1730000000,
    "sig": "HMAC-SHA256(token, agentId+nonce+ts)"
  }
}
```

Response (Panel -> Agent)
```json
{ "type": "RES", "id": "auth", "payload": { "success": true } }
```

## REQUESTS
### START/STOP/RESTART
```json
{ "type": "REQ", "id": "uuid", "action": "START", "payload": { "serverId": "server-1" } }
```

### COMMAND
```json
{ "type": "REQ", "id": "uuid", "action": "COMMAND", "payload": { "serverId": "server-1", "command": "say hello" } }
```

### STATS
```json
{ "type": "REQ", "id": "uuid", "action": "STATS", "payload": { "serverId": "server-1" } }
```

### LOGS
```json
{ "type": "REQ", "id": "uuid", "action": "LOGS", "payload": { "serverId": "server-1", "tail": 200 } }
```

### LIST
```json
{ "type": "REQ", "id": "uuid", "action": "LIST", "payload": { "serverId": "server-1", "path": "/" } }
```

### READ
```json
{ "type": "REQ", "id": "uuid", "action": "READ", "payload": { "serverId": "server-1", "path": "/server.properties" } }
```

### WRITE
```json
{ "type": "REQ", "id": "uuid", "action": "WRITE", "payload": { "serverId": "server-1", "path": "/server.properties", "content": "..." } }
```

## FILE UPLOAD (chunked)
### UPLOAD_INIT
```json
{ "type": "REQ", "id": "uuid", "action": "UPLOAD_INIT", "payload": { "serverId": "server-1", "path": "/plugins/a.jar", "size": 123456 } }
```

### UPLOAD_CHUNK
```json
{ "type": "REQ", "id": "uuid", "action": "UPLOAD_CHUNK", "payload": { "uploadId": "u1", "index": 0, "data": "base64" } }
```

### UPLOAD_FINISH
```json
{ "type": "REQ", "id": "uuid", "action": "UPLOAD_FINISH", "payload": { "uploadId": "u1" } }
```

## FILE DOWNLOAD (chunked)
### DOWNLOAD_INIT
```json
{ "type": "REQ", "id": "uuid", "action": "DOWNLOAD_INIT", "payload": { "serverId": "server-1", "path": "/plugins/a.jar" } }
```

### DOWNLOAD_CHUNK
```json
{ "type": "REQ", "id": "uuid", "action": "DOWNLOAD_CHUNK", "payload": { "downloadId": "d1", "index": 0 } }
```

## RESPONSES
```json
{
  "type": "RES",
  "id": "uuid",
  "payload": {
    "success": true,
    "data": {}
  }
}
```
