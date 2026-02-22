# Deploy Guide

## 1) Build
```bash
cd agent-go
go build -o minebot-agent ./cmd/agent
```

## 2) Config
```bash
cp config.example.yaml config.yaml
```

## 3) systemd
Create `/etc/systemd/system/minebot-agent.service`:
```ini
[Unit]
Description=Minebot Agent
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/minebot-agent
ExecStart=/opt/minebot-agent/minebot-agent -config /opt/minebot-agent/config.yaml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now minebot-agent
```

## 4) Docker (optional)
```bash
docker run -d --name minebot-agent \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /srv/pterodactyl/volumes:/srv/pterodactyl/volumes \
  -v /opt/minebot-agent/config.yaml:/app/config.yaml \
  minebot-agent:latest
```
