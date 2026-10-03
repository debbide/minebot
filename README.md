# MineCraft Bot Assistant

一个基于 mineflayer + AI 的 Minecraft 机器人通用框架，提供 Web 控制面板。

## 功能特性

- **登录认证**: JWT 认证保护，默认账号 `admin` / `admin123`
- **机器人控制**: 通过 Web UI 连接和控制 Minecraft 机器人
- **AI 对话**: 集成 OpenAI API，支持智能对话
- **指令系统**: 支持 `!help`, `!come`, `!follow`, `!stop`, `!pos`, `!ask` 等指令
- **统一设置**: 所有配置集中在设置页面管理
- **实时日志**: WebSocket 实时推送日志

## 快速开始

### 方式一：使用预构建镜像（推荐）

创建 `docker-compose.yml` 文件：

```yaml
version: '3.8'

services:
  minebot:
    image: ghcr.io/debbide/minebot:latest
    container_name: minebot
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - minebot-data:/app/server/data

volumes:
  minebot-data:
```

启动：

```bash
docker compose up -d
```

访问 http://localhost:3000，使用 `admin` / `admin123` 登录。

### 方式二：从源码构建

```bash
git clone https://github.com/debbide/minebot.git
cd minebot
docker compose up -d --build
```

默认启动不会启用 `bypass-service`。此时 `BYPASS_SERVICE_URL` 为空，相关 bypass 功能保持禁用状态，不影响面板正常使用。

### 可选：启用 bypass-service

仅当你本地存在 `./bypass-service` 目录并准备好其依赖时，才启用 bypass profile：

```bash
BYPASS_SERVICE_URL=http://bypass-service:5000 docker compose --profile bypass up -d --build
```

如果不满足上述前置条件，请使用标准启动命令，不要添加 `--profile bypass`。

## 配置说明

所有配置都可以在 Web 面板的 **设置页面** 中修改：

| 配置项 | 说明 |
|--------|------|
| 服务器 | Minecraft 服务器地址、端口、机器人用户名 |
| AI | OpenAI API Key、Base URL、模型、系统提示词 |
| 账号 | 面板登录用户名和密码 |
| 自动喊话 | 开关、间隔时间、喊话内容 |
| 自动续期 | 续期接口 URL、请求方式 |

## 游戏内指令

在 Minecraft 游戏中对机器人发送消息：

| 指令 | 说明 |
|------|------|
| `!help` | 显示帮助信息 |
| `!come` | 让机器人走向你 |
| `!follow` | 让机器人跟随你 |
| `!stop` | 停止移动 |
| `!pos` | 显示机器人位置 |
| `!ask [问题]` | 向 AI 提问 |

## 环境变量（可选）

也可以通过环境变量预设配置：

```yaml
services:
  minebot:
    image: ghcr.io/debbide/minebot:latest
    ports:
      - "3000:3000"
    environment:
      - OPENAI_API_KEY=sk-your-key
      - OPENAI_BASE_URL=https://api.openai.com/v1
      - OPENAI_MODEL=gpt-3.5-turbo
    volumes:
      - minebot-data:/app/server/data

volumes:
  minebot-data:
```

## 本地开发

```bash
# 前端
npm install && npm run dev

# 后端
cd server && npm install && npm run dev
```

## 技术栈

- **前端**: React 18, TypeScript, Vite, Tailwind CSS, Shadcn UI
- **后端**: Node.js, Express, WebSocket, mineflayer, OpenAI API

## License

MIT
