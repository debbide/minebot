# Minebot Agent (Go)

Reverse-connection agent for Docker-based game servers. The agent connects to the panel over WebSocket and executes actions (power, command, files, logs, stats).

## Features
- Reverse WebSocket connection with HMAC auth
- Docker power control (start/stop/restart)
- Command execution (RCON preferred, fallback to docker exec)
- File list/read/write under a safe root
- Logs and basic stats
- Upload/download via chunked transfer

## Quick Start
1) Build
```bash
cd agent-go
go build -o minebot-agent ./cmd/agent
```

2) Configure
```bash
cp config.example.yaml config.yaml
```

3) Run
```bash
./minebot-agent -config config.yaml
```

## Notes
- This agent requires access to Docker CLI or docker.sock.
- For file operations, set fileRoot to a trusted base path.
- Protocol is documented in `docs/protocol.md`.
