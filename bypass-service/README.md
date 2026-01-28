# Renewal Service

自动续期服务 - 基于 Python + SeleniumBase 的全栈应用

## 功能特性

- 🚀 自动登录网页面板并点击续期按钮
- 🔄 定时任务调度（自定义续期间隔）
- 🌐 Web 界面管理任务
- 🛡️ 集成 Cloudflare/Turnstile 绕过
- 📸 执行结果截图保存
- 💾 任务配置持久化（JSON）

## 快速开始

### 使用 Docker Compose（推荐）

```bash
cd bypass-service
docker compose up -d --build
```

访问: `http://localhost:5000`

### 手动构建

```bash
# 1. 构建前端
cd ui
npm install
npm run build
cd ..

# 2. 安装 Python 依赖
pip install -r requirements.txt

# 3. 启动服务
python api.py
```

## API 文档

### 任务管理

- `GET /api/tasks` - 获取所有任务
- `POST /api/tasks` - 创建新任务
- `PUT /api/tasks/{id}` - 更新任务
- `DELETE /api/tasks/{id}` - 删除任务
- `POST /api/tasks/{id}/run` - 手动运行任务
- `POST /api/tasks/{id}/toggle` - 启用/禁用任务

### Bypass 功能

- `POST /bypass` - Cloudflare Bypass
- `POST /renew` - 直接调用续期（无需创建任务）

## 配置说明

### 任务配置字段

```json
{
  "name": "服务器名称",
  "url": "https://panel.example.com/server?id=123",
  "username": "your@email.com",
  "password": "your_password",
  "proxy": "socks5://127.0.0.1:1080",  // 可选
  "selectors": {
    "renew_btn": "button.renew"  // 可选，留空自动查找
  },
  "interval": 6,  // 续期间隔（小时）
  "enabled": true
}
```

## 技术栈

**前端**: React + TypeScript + Vite + Tailwind CSS + Shadcn UI

**后端**: Python + Flask + APSched牛er + SeleniumBase

**浏览器**: UC Mode (Anti-detection)

## 数据持久化

- 任务配置: `/app/data/tasks.json`
- 截图: `/app/output/screenshots/`

## 环境变量

- `PORT`: 服务端口（默认 5000）
- `DISPLAY`: X11 显示（Docker 中默认 :99）
- `PYTHONUNBUFFERED`: Python 输出缓冲（默认 1）

## License

MIT
