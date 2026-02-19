/**
 * ============================================================
 * 项目名称：Pathfinder PRO (2025 旗舰版 - 内存修正版)
 * 修复内容：修正容器内存识别、找回巡逻/物理引擎联动日志、强化内存守护
 * 核心功能：全自动日志清理(30条)、翼龙端口适配、物理巡逻联动
 * ============================================================
 */
const { execSync } = require('child_process');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');

// 全局异常守护
process.on('uncaughtException', (err) => console.error(' [系统警告] 异常:', err.message));
process.on('unhandledRejection', (reason) => console.error(' [系统警告] 拒绝:', reason));

function autoFixEnvironment() {
    const deps = ['mineflayer', 'express', 'mineflayer-pathfinder', 'minecraft-data', 'axios', 'multer', 'form-data'];
    for (const dep of deps) {
        try { require.resolve(dep); } catch (e) {
            try { execSync(`npm install ${dep} --quiet`); } catch(err) {}
        }
    }
}
autoFixEnvironment();

const mineflayer = require("mineflayer");
const express = require("express");
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const WebSocket = require('ws');
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const activeBots = new Map();
const CONFIG_FILE = path.join(__dirname, 'bots_config.json');
const wsClients = new Set();

// --- [ WebSocket 广播 ] ---
function broadcastToClients(type, data) {
    const message = JSON.stringify({ type, data, timestamp: Date.now() });
    wsClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function broadcastBotUpdate(botId, bot) {
    broadcastToClients('bot_update', {
        id: botId,
        username: bot.username,
        host: bot.targetHost,
        port: bot.targetPort,
        status: bot.status,
        logs: bot.logs,
        settings: bot.settings,
        nextRestart: bot.settings.restartInterval > 0 ? new Date(bot.lastRestartTick + bot.settings.restartInterval * 60000).toLocaleTimeString() : '未开启'
    });
}

function broadcastSystemStatus() {
    broadcastToClients('system_status', getMemoryStatus());
}
class LRUCache {
    constructor(maxSize = 10) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return undefined;
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }

    clear() {
        this.cache.clear();
    }
}

const mcDataCache = new LRUCache(10);
let isShuttingDown = false;

app.use(express.json());

// --- [ 内存监控 - 支持 cgroup v1/v2 ] ---
let cachedMemoryLimit = null;

async function getMemoryLimit() {
    if (cachedMemoryLimit !== null) return cachedMemoryLimit;

    // 1. 环境变量
    if (process.env.SERVER_MEMORY) {
        cachedMemoryLimit = parseInt(process.env.SERVER_MEMORY) * 1024 * 1024;
        return cachedMemoryLimit;
    }

    // 2. cgroup v1
    try {
        if (fsSync.existsSync('/sys/fs/cgroup/memory/memory.limit_in_bytes')) {
            const limit = parseInt(fsSync.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim());
            if (limit < 9223372036854771712) {
                cachedMemoryLimit = limit;
                return cachedMemoryLimit;
            }
        }
    } catch (e) {}

    // 3. cgroup v2
    try {
        if (fsSync.existsSync('/sys/fs/cgroup/memory.max')) {
            const limit = fsSync.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
            if (limit !== 'max') {
                cachedMemoryLimit = parseInt(limit);
                return cachedMemoryLimit;
            }
        }
    } catch (e) {}

    // 4. 默认系统内存
    cachedMemoryLimit = os.totalmem();
    return cachedMemoryLimit;
}

function getMemoryStatus() {
    const used = process.memoryUsage().rss;
    const total = cachedMemoryLimit || os.totalmem();
    const percent = ((used / total) * 100).toFixed(1);
    return {
        used: (used / 1024 / 1024).toFixed(1),
        total: (total / 1024 / 1024).toFixed(0),
        percent
    };
}

// 初始化内存限制
getMemoryLimit().catch(() => {});

// --- [ 优雅关闭处理 ] ---
async function gracefulShutdown(reason = '内存告急') {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n🛑 [${new Date().toLocaleTimeString()}] 开始优雅关闭: ${reason}`);

    // 1. 停止接受新连接
    if (global.server) {
        global.server.close(() => console.log('✓ 已关闭 HTTP 服务器'));
    }

    // 2. 断开所有机器人
    console.log(`📊 正在断开 ${activeBots.size} 个机器人...`);
    for (const [id, bot] of activeBots) {
        try {
            if (bot.afkTimer) clearInterval(bot.afkTimer);
            if (bot.instance) {
                bot.instance.removeAllListeners();
                bot.instance.end();
            }
            bot.pushLog('🛑 服务器关闭，机器人已断开', 'text-red-500');
        } catch (e) {}
    }

    // 3. 保存配置
    try {
        await saveBotsConfig();
        console.log('✓ 配置已保存');
    } catch (e) {
        console.error('✗ 配置保存失败:', e.message);
    }

    // 4. 清理资源
    mcDataCache.clear();
    activeBots.clear();

    console.log('✓ 优雅关闭完成，进程退出');
    process.exit(0);
}

// 内存监控和自愈
setInterval(async () => {
    const status = getMemoryStatus();
    const percent = parseFloat(status.percent);

    // 广播系统状态
    broadcastSystemStatus();

    if (percent >= 80) {
        mcDataCache.clear();
        activeBots.forEach(bot => {
            // 真正清理日志：创建新数组并清空引用
            const oldLogs = bot.logs;
            bot.logs = bot.logs.slice(0, 15);
            oldLogs.length = 0;

            bot.pushLog(`⚠️ 内存占用过高 (${status.percent}%)，已清理缓存`, 'text-red-500 font-black');
        });

        if (percent > 90) {
            console.error(`\n⚠️ [${new Date().toLocaleTimeString()}] 内存占用 ${status.percent}%，触发优雅关闭`);
            await gracefulShutdown('内存占用超过 90%');
        }
    }
}, 30000);

// --- [ 核心逻辑 ] ---
async function saveBotsConfig() {
    try {
        const config = Array.from(activeBots.values()).map(b => ({
            host: b.targetHost, port: b.targetPort, username: b.username, 
            settings: b.settings, logs: b.logs.slice(0, 30) 
        }));
        await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (err) {}
}

async function createSmartBot(id, host, port, username, existingLogs = [], settings = null) {
    let finalHost = host.trim();
    let finalPort = parseInt(port) || 25565;
    if (finalHost.includes(':')) {
        const parts = finalHost.split(':');
        finalHost = parts[0]; finalPort = parseInt(parts[1]) || 25565;
    }

    const defaultSettings = { walk: false, ai: true, chat: false, restartInterval: 0, pterodactyl: { url: '', key: '', id: '', defaultDir: '/' } };
    const botMeta = { id, username, targetHost: finalHost, targetPort: finalPort, status: "连接中", logs: Array.isArray(existingLogs) ? existingLogs.slice(0, 30) : [], settings: settings || defaultSettings, instance: null, afkTimer: null, isRepairing: false, lastRestartTick: Date.now(), isMoving: false };
    activeBots.set(id, botMeta);

    const pushLog = (msg, colorClass = '') => {
        const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        botMeta.logs.unshift({ time, msg, color: colorClass });
        if (botMeta.logs.length > 30) botMeta.logs = botMeta.logs.slice(0, 30);
        // 实时推送日志更新
        broadcastBotUpdate(id, botMeta);
    };
    botMeta.pushLog = pushLog;

    try {
        const bot = mineflayer.createBot({ host: finalHost, port: finalPort, username: username, auth: 'offline', hideErrors: true, physicsEnabled: settings ? settings.walk : false, connectTimeout: 20000 });
        bot.loadPlugin(pathfinder);
        botMeta.instance = bot;

        bot.once('spawn', () => {
            botMeta.status = "在线";
            botMeta.centerPos = bot.entity.position.clone();
            pushLog(`✅ 成功进入服务器`, 'text-emerald-400 font-bold');
            broadcastBotUpdate(id, botMeta);
            
            let mcData;
            try {
                mcData = mcDataCache.get(bot.version) || require('minecraft-data')(bot.version);
                if (mcData) mcDataCache.set(bot.version, mcData);
            } catch (e) { pushLog(`❌ 协议不支持`, 'text-red-500'); return bot.end(); }
            
            const movements = new Movements(bot, mcData);
            movements.canDig = false;
            bot.pathfinder.setMovements(movements);

            if (botMeta.afkTimer) clearInterval(botMeta.afkTimer);
            botMeta.afkTimer = setInterval(() => {
                if (!bot.entity) return;
                // 重启逻辑
                if (botMeta.settings.restartInterval > 0 && (Date.now() - botMeta.lastRestartTick) / 60000 >= botMeta.settings.restartInterval) {
                    bot.chat('/restart'); botMeta.lastRestartTick = Date.now(); pushLog(`⏰ 周期任务: 执行 /restart`, 'text-red-500 font-bold');
                }
                // AI视角
                if (botMeta.settings.ai && !botMeta.isMoving) {
                    const target = bot.nearestEntity(p => p.type === 'player');
                    if (target) bot.lookAt(target.position.offset(0, 1.6, 0));
                }
                // 巡逻
                if (botMeta.settings.walk && !botMeta.isMoving && Math.random() > 0.7) {
                    botMeta.isMoving = true;
                    const targetPos = botMeta.centerPos.offset((Math.random()-0.5)*12, 0, (Math.random()-0.5)*12);
                    pushLog(`👣 巡逻: 前往点 [${Math.round(targetPos.x)}, ${Math.round(targetPos.z)}]`, 'text-emerald-500');
                    bot.pathfinder.setGoal(new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 1));
                }
                // 喊话
                if (botMeta.settings.chat && Math.random() > 0.85) {
                    const words = ["有人吗", "2333", "啧", "掛机中"];
                    const m = words[Math.floor(Math.random() * words.length)];
                    bot.chat(m); pushLog(`💬 拟人发话: ${m}`, 'text-orange-400');
                }
            }, 8000);
        });

        bot.on('goal_reached', () => { botMeta.isMoving = false; if(botMeta.settings.walk) pushLog(`📍 巡逻到达目标点`, 'text-slate-400'); });
        bot.once('end', () => attemptRepair(id, botMeta, "断开"));
        bot.on('error', (e) => attemptRepair(id, botMeta, e.code || "ERR"));
    } catch (err) { attemptRepair(id, botMeta, "失败"); }
}

function attemptRepair(id, botMeta, reason) {
    if (!activeBots.has(id) || botMeta.isRepairing) return;
    botMeta.isRepairing = true; botMeta.status = "重连中";
    if (botMeta.instance) { botMeta.instance.removeAllListeners(); try { botMeta.instance.end(); } catch(e) {} botMeta.instance = null; }
    if (botMeta.afkTimer) clearInterval(botMeta.afkTimer);
    setTimeout(() => { if (!activeBots.has(id)) return; botMeta.isRepairing = false; createSmartBot(id, botMeta.targetHost, botMeta.targetPort, botMeta.username, botMeta.logs, botMeta.settings); }, 10000);
}

// --- [ API 验证和错误处理 ] ---
const validateBot = (id) => {
    const bot = activeBots.get(id);
    if (!bot) throw { status: 404, message: '机器人不存在' };
    return bot;
};

const validateString = (value, fieldName, minLen = 1, maxLen = 255) => {
    if (typeof value !== 'string' || value.trim().length < minLen || value.length > maxLen) {
        throw { status: 400, message: `${fieldName} 无效 (长度: ${minLen}-${maxLen})` };
    }
    return value.trim();
};

const validateNumber = (value, fieldName, min = 0, max = 65535) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < min || num > max) {
        throw { status: 400, message: `${fieldName} 无效 (范围: ${min}-${max})` };
    }
    return num;
};

const validateHost = (host) => {
    const trimmed = validateString(host, '服务器地址', 1, 255);
    const ipRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
    if (!ipRegex.test(trimmed.split(':')[0])) {
        throw { status: 400, message: '服务器地址格式无效' };
    }
    return trimmed;
};

const apiErrorHandler = (handler) => async (req, res) => {
    try {
        await handler(req, res);
    } catch (err) {
        const status = err.status || 500;
        const message = err.message || '服务器错误';
        console.error(`[API 错误] ${status}: ${message}`);
        res.status(status).json({ success: false, error: message });
    }
};

// --- [ API 端点 ] ---
app.get("/api/system/status", (req, res) => {
    try {
        res.json(getMemoryStatus());
    } catch (err) {
        res.status(500).json({ success: false, error: '获取系统状态失败' });
    }
});

app.get("/api/bots", (req, res) => {
    try {
        const bots = Array.from(activeBots.values()).map(b => ({
            id: b.id,
            username: b.username,
            host: b.targetHost,
            port: b.targetPort,
            status: b.status,
            logs: b.logs,
            settings: b.settings,
            nextRestart: b.settings.restartInterval > 0 ? new Date(b.lastRestartTick + b.settings.restartInterval * 60000).toLocaleTimeString() : '未开启'
        }));
        res.json({ success: true, bots });
    } catch (err) {
        res.status(500).json({ success: false, error: '获取机器人列表失败' });
    }
});

app.post("/api/bots", apiErrorHandler(async (req, res) => {
    const host = validateHost(req.body.host);
    const username = validateString(req.body.username, '用户名', 1, 16);

    createSmartBot('bot_' + Math.random().toString(36).substr(2, 7), host, 25565, username);
    res.json({ success: true, message: '机器人已创建' });
}));

app.post("/api/bots/:id/toggle", apiErrorHandler(async (req, res) => {
    const bot = validateBot(req.params.id);
    const type = req.body.type;

    if (!['ai', 'walk', 'chat'].includes(type)) {
        throw { status: 400, message: '无效的切换类型' };
    }

    bot.settings[type] = !bot.settings[type];

    const labelMap = { ai: "AI视角", walk: "拟人巡逻", chat: "拟人喊话" };
    const label = labelMap[type];
    const statusText = bot.settings[type] ? "[开启]" : "[关闭]";

    bot.pushLog(`🔘 切换: ${label} -> ${statusText}`, 'text-yellow-400 font-bold');

    if (type === 'walk' && bot.instance) {
        bot.instance.physicsEnabled = bot.settings.walk;
        if (bot.settings.walk) {
            bot.pushLog(`⚙️ 物理引擎: 已激活 (巡逻模式)`, 'text-yellow-600 font-bold');
        } else {
            bot.instance.pathfinder.setGoal(null);
            bot.isMoving = false;
            bot.pushLog(`⚙️ 物理引擎: 已休眠 (强制静止)`, 'text-slate-500 font-bold');
        }
    }

    await saveBotsConfig();
    broadcastBotUpdate(req.params.id, bot);
    res.json({ success: true, message: '已切换' });
}));

app.post("/api/bots/:id/restart-now", apiErrorHandler(async (req, res) => {
    const bot = validateBot(req.params.id);

    if (!bot.instance) {
        throw { status: 400, message: '机器人未连接' };
    }

    bot.instance.chat('/restart');
    bot.lastRestartTick = Date.now();
    bot.pushLog(`⚡ 立即重启: 已发送 /restart`, 'text-red-400 font-bold');
    broadcastBotUpdate(req.params.id, bot);
    res.json({ success: true, message: '重启命令已发送' });
}));

app.post("/api/bots/:id/set-timer", apiErrorHandler(async (req, res) => {
    const bot = validateBot(req.params.id);
    const value = validateNumber(req.body.value, '时间值', 0, 10080);
    const unit = req.body.unit;

    if (!['min', 'hour'].includes(unit)) {
        throw { status: 400, message: '无效的时间单位' };
    }

    bot.settings.restartInterval = unit === 'hour' ? Math.round(value * 60) : Math.round(value);
    bot.lastRestartTick = Date.now();
    bot.pushLog(`⏰ 设定: 每 ${value}${unit === 'hour' ? '小时' : '分钟'} 重启一次`, 'text-cyan-400 font-bold');

    await saveBotsConfig();
    broadcastBotUpdate(req.params.id, bot);
    res.json({ success: true, message: '定时器已设置' });
}));

app.post("/api/bots/:id/pto-config", apiErrorHandler(async (req, res) => {
    const bot = validateBot(req.params.id);

    const url = (req.body.url || "").trim().replace(/\/$/, "");
    const key = (req.body.key || "").trim();
    const id = (req.body.id || "").trim();
    const defaultDir = (req.body.defaultDir || "/").trim();

    if (url && !url.startsWith('http')) {
        throw { status: 400, message: '翼龙面板 URL 必须以 http 开头' };
    }

    bot.settings.pterodactyl = { url, key, id, defaultDir };
    bot.pushLog(`🔑 翼龙配置: 凭据已保存`, 'text-blue-300');

    await saveBotsConfig();
    broadcastBotUpdate(req.params.id, bot);
    res.json({ success: true, message: '配置已保存' });
}));

app.delete("/api/bots/:id", apiErrorHandler(async (req, res) => {
    const bot = validateBot(req.params.id);

    if (bot.afkTimer) clearInterval(bot.afkTimer);
    if (bot.instance) bot.instance.end();
    activeBots.delete(req.params.id);

    await saveBotsConfig();
    broadcastToClients('bot_deleted', { id: req.params.id });
    res.json({ success: true, message: '机器人已移除' });
}));

// --- [ 前端 UI ] ---
app.get("/", (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8"><title>Pathfinder PRO</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
            @keyframes warning { 0% { border-color: transparent; } 50% { border-color: #ef4444; } }
            body { background: #020617; color: #f8fafc; font-family: sans-serif; }
            .glass { background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.05); }
            .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
            .online { background: #10b981; animation: pulse 2s infinite; }
            .offline { background: #ef4444; }
            .log-box::-webkit-scrollbar { width: 4px; }
            .log-box::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
            .monitor-bar { position: fixed; bottom: 1.5rem; left: 1.5rem; padding: 0.75rem 1.25rem; border-radius: 1.5rem; display: flex; align-items: center; gap: 12px; z-index: 100; border: 1px solid rgba(255,255,255,0.1); }
            .warn-border { animation: warning 1s infinite; border-width: 2px; }
        </style>
    </head>
    <body class="p-6 pb-24">
        <div class="max-w-7xl mx-auto">
            <header class="flex justify-between items-center mb-8">
                <h1 class="text-2xl font-black bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent uppercase tracking-tighter">Pathfinder PRO</h1>
                <div class="glass p-2 rounded-2xl flex gap-2">
                    <input id="h" oninput="saveDraft('global', 'h', this.value)" placeholder="IP:PORT" class="bg-slate-950 rounded-xl px-4 py-2 text-sm text-white outline-none border border-slate-700">
                    <input id="u" oninput="saveDraft('global', 'u', this.value)" placeholder="角色名" class="bg-slate-950 rounded-xl px-4 py-2 text-sm text-white outline-none border border-slate-700 w-32">
                    <button onclick="addBot()" class="bg-white text-black px-6 py-2 rounded-xl text-sm font-bold active:scale-95 transition-all">部署角色</button>
                </div>
            </header>
            <div id="list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"></div>
        </div>

        <div id="mem-bar" class="monitor-bar glass">
            <div class="flex flex-col">
                <span class="text-[10px] uppercase font-black text-slate-500">Node Instance Memory</span>
                <div class="flex items-baseline gap-2">
                    <span id="mem-percent" class="text-xl font-black italic text-white">0.0%</span>
                    <span id="mem-used" class="text-[10px] font-bold text-slate-400">0 / 0 MB</span>
                </div>
            </div>
            <div class="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div id="mem-progress" class="h-full bg-blue-500 transition-all duration-500" style="width: 0%"></div>
            </div>
        </div>

        <script>
            let drafts = {}; 
            function saveDraft(botId, field, val) { if (!drafts[botId]) drafts[botId] = {}; drafts[botId][field] = val; }
            function getDraft(botId, field, fallback) { return (drafts[botId] && drafts[botId][field] !== undefined) ? drafts[botId][field] : (fallback || ''); }
            
            async function updateSystemStatus() {
                try {
                    const r = await fetch('/api/system/status');
                    const d = await r.json();
                    const p = parseFloat(d.percent);
                    const bar = document.getElementById('mem-bar');
                    const prog = document.getElementById('mem-progress');
                    document.getElementById('mem-percent').innerText = d.percent + '%';
                    document.getElementById('mem-used').innerText = d.used + ' / ' + d.total + ' MB';
                    prog.style.width = d.percent + '%';
                    if (p >= 80) { bar.classList.add('warn-border'); prog.classList.replace('bg-blue-500', 'bg-red-500'); }
                    else { bar.classList.remove('warn-border'); prog.classList.replace('bg-red-500', 'bg-blue-500'); }
                } catch(e) {}
            }

            async function addBot() { await fetch('/api/bots', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ host: document.getElementById('h').value, username: document.getElementById('u').value })}); drafts['global'] = {}; updateUI(true); }
            async function restartNow(id) { const r = await fetch('/api/bots/'+id+'/restart-now', { method: 'POST' }); if(r.ok) updateUI(true); }
            async function savePto(id) { const data = { url: document.getElementById('url-'+id).value, id: document.getElementById('sid-'+id).value, key: document.getElementById('key-'+id).value, defaultDir: document.getElementById('ddir-'+id).value }; await fetch('/api/bots/'+id+'/pto-config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)}); delete drafts[id]; updateUI(true); }
            async function toggle(id, type) { await fetch('/api/bots/'+id+'/toggle', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ type })}); updateUI(true); }
            async function setTimer(id, value, unit) { await fetch('/api/bots/'+id+'/set-timer', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ value, unit })}); updateUI(true); }
            async function removeBot(id) { if(confirm('移除？')) { await fetch('/api/bots/'+id, { method: 'DELETE' }); updateUI(true); } }
            
            async function updateUI(force = false) {
                if (!force && document.activeElement && document.activeElement.tagName === 'INPUT') return;
                const r = await fetch('/api/bots'); const d = await r.json();
                document.getElementById('h').value = getDraft('global', 'h', document.getElementById('h').value);
                document.getElementById('u').value = getDraft('global', 'u', document.getElementById('u').value);
                document.getElementById('list').innerHTML = d.bots.map(b => \`
                    <div class="glass rounded-[2.5rem] p-6 border-t-4 transition-all \${b.status==='在线'?'border-t-emerald-500 shadow-[0_-10px_30px_-15px_rgba(16,185,129,0.2)]':'border-t-red-500 shadow-[0_-10px_30px_-15px_rgba(239,68,68,0.2)]'}">
                        <div class="flex justify-between items-start mb-4">
                            <div><div class="flex items-center gap-2"><h3 class="text-lg font-bold uppercase">\${b.username}</h3><span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase \${b.status==='在线'?'bg-emerald-500/20 text-emerald-400':'bg-red-500/20 text-red-400'}"><span class="status-dot \${b.status==='在线'?'online':'offline'}"></span>\${b.status}</span></div><p class="text-[10px] text-slate-500">\${b.host}</p></div>
                            <button onclick="removeBot('\${b.id}')" class="text-slate-600 hover:text-red-500 transition-colors">✕</button>
                        </div>
                        <div class="bg-slate-900/40 p-4 rounded-2xl border border-slate-800 mb-4">
                            <p class="text-[9px] text-slate-500 uppercase font-black mb-3">定时重启 | 下次: <span class="text-cyan-400">\${b.nextRestart}</span></p>
                            <div class="grid grid-cols-2 gap-2 mb-3">
                                <div><input oninput="saveDraft('\${b.id}', 'min', this.value)" id="min-\${b.id}" value="\${getDraft(b.id, 'min', '')}" type="number" placeholder="分钟" class="bg-slate-950 w-full rounded-lg px-2 py-1 text-[10px] text-white outline-none border border-slate-800 transition-all"><button onclick="setTimer('\${b.id}', document.getElementById('min-\${b.id}').value, 'min')" class="mt-1 w-full bg-slate-800 py-1 rounded-md text-[8px] font-black">设定分钟</button></div>
                                <div><input oninput="saveDraft('\${b.id}', 'hour', this.value)" id="hour-\${b.id}" value="\${getDraft(b.id, 'hour', '')}" type="number" placeholder="小时" class="bg-slate-950 w-full rounded-lg px-2 py-1 text-[10px] text-white outline-none border border-slate-800 transition-all"><button onclick="setTimer('\${b.id}', document.getElementById('hour-\${b.id}').value, 'hour')" class="mt-1 w-full bg-slate-800 py-1 rounded-md text-[8px] font-black">设定小时</button></div>
                            </div>
                            <button onclick="restartNow('\${b.id}')" class="w-full bg-red-600 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg active:scale-95 transition-all">⚡ 立即重启 /RESTART</button>
                        </div>
                        <div class="bg-black/40 p-4 rounded-2xl mb-4 border border-slate-800">
                            <input oninput="saveDraft('\${b.id}', 'url', this.value)" id="url-\${b.id}" placeholder="面板地址" value="\${getDraft(b.id, 'url', b.settings.pterodactyl?.url)}" class="w-full bg-slate-900 rounded-lg px-2 py-1 text-[10px] mb-1 text-white border border-transparent focus:border-blue-500 outline-none transition-all">
                            <input oninput="saveDraft('\${b.id}', 'sid', this.value)" id="sid-\${b.id}" placeholder="服务器ID" value="\${getDraft(b.id, 'sid', b.settings.pterodactyl?.id)}" class="w-full bg-slate-900 rounded-lg px-2 py-1 text-[10px] mb-1 text-white border border-transparent focus:border-blue-500 outline-none transition-all">
                            <input oninput="saveDraft('\${b.id}', 'key', this.value)" id="key-\${b.id}" type="password" placeholder="API Key" value="\${getDraft(b.id, 'key', b.settings.pterodactyl?.key)}" class="w-full bg-slate-900 rounded-lg px-2 py-1 text-[10px] mb-1 text-white border border-transparent focus:border-blue-500 outline-none transition-all">
                            <input oninput="saveDraft('\${b.id}', 'ddir', this.value)" id="ddir-\${b.id}" placeholder="默认目录" value="\${getDraft(b.id, 'ddir', b.settings.pterodactyl?.defaultDir)}" class="w-full bg-slate-950 text-emerald-400 rounded-lg px-2 py-1 text-[10px] mb-2 border border-emerald-900/30 outline-none transition-all">
                            <div class="flex gap-2"><button onclick="savePto('\${b.id}')" class="flex-1 bg-slate-800 text-[9px] py-1.5 rounded-lg font-bold">保存</button><button onclick="this.nextElementSibling.click()" class="flex-1 bg-blue-600 text-[9px] py-1.5 rounded-lg font-bold">同步</button><input type="file" class="hidden" onchange="uploadFile('\${b.id}', this)"></div>
                        </div>
                        <div class="grid grid-cols-3 gap-2 mb-4">
                            <button onclick="toggle('\${b.id}','ai')" class="py-2 rounded-xl text-[10px] font-bold \${b.settings.ai?'bg-blue-600':'bg-slate-800'}">👁️ AI视角</button>
                            <button onclick="toggle('\${b.id}','walk')" class="py-2 rounded-xl text-[10px] font-bold \${b.settings.walk?'bg-emerald-600':'bg-slate-800'}">👣 巡逻</button>
                            <button onclick="toggle('\${b.id}','chat')" class="py-2 rounded-xl text-[10px] font-bold \${b.settings.chat?'bg-orange-600':'bg-slate-800'}">💬 喊话</button>
                        </div>
                        <div class="log-box bg-black/60 rounded-xl p-3 h-32 overflow-y-auto font-mono text-[9px] border border-white/5">
                            \${b.logs.map(l => \`<div class="mb-1 \${l.color}"><span class="opacity-30 mr-1">[\${l.time}]</span>\${l.msg}</div>\`).join('')}
                        </div>
                    </div>
                \`).join('');
            }
            setInterval(() => { updateUI(false); updateSystemStatus(); }, 3000);
            updateUI(true);
        </script>
    </body>
    </html>`);
});

// --- [ 启动 ] ---
const PORT = process.env.SERVER_PORT || 4681;
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(`Pathfinder PRO 已启动 (优雅关闭版)`);
    console.log(`端口: ${PORT} | 内存管理已激活`);
    console.log(`=========================================`);
    if (fsSync.existsSync(CONFIG_FILE)) {
        try {
            const saved = JSON.parse(fsSync.readFileSync(CONFIG_FILE));
            saved.forEach(b => createSmartBot('bot_'+Math.random().toString(36).substr(2,5), b.host, b.port, b.username, b.logs || [], b.settings));
        } catch (e) {}
    }
});

// WebSocket 服务器初始化
const wss = new WebSocket.Server({ noServer: true });

// WebSocket 认证
server.on('upgrade', (request, socket, head) => {
    try {
        const url = new URL(request.url, `http://${request.headers.host}`);
        const token = url.searchParams.get('token');

        // 简单的 token 验证（这里可以根据实际需求改进）
        // 目前允许任何非空 token，实际应该验证 JWT 或其他认证机制
        if (!token || token.trim() === '') {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } catch (error) {
        console.error('[WebSocket 认证错误]', error.message);
        socket.destroy();
    }
});

wss.on('connection', (ws) => {
    wsClients.add(ws);
    console.log(`[WebSocket] 新连接，当前连接数: ${wsClients.size}`);

    // 发送初始数据
    try {
        // 发送所有机器人状态
        activeBots.forEach((bot, id) => {
            ws.send(JSON.stringify({
                type: 'bot_update',
                data: {
                    id,
                    username: bot.username,
                    host: bot.targetHost,
                    port: bot.targetPort,
                    status: bot.status,
                    logs: bot.logs,
                    settings: bot.settings,
                    nextRestart: bot.settings.restartInterval > 0 ? new Date(bot.lastRestartTick + bot.settings.restartInterval * 60000).toLocaleTimeString() : '未开启'
                },
                timestamp: Date.now()
            }));
        });

        // 发送系统状态
        ws.send(JSON.stringify({
            type: 'system_status',
            data: getMemoryStatus(),
            timestamp: Date.now()
        }));
    } catch (error) {
        console.error('[WebSocket] 发送初始数据失败:', error.message);
    }

    ws.on('close', () => {
        wsClients.delete(ws);
        console.log(`[WebSocket] 连接关闭，当前连接数: ${wsClients.size}`);
    });

    ws.on('error', (err) => {
        console.error('[WebSocket 错误]', err.message);
        wsClients.delete(ws);
    });
});

// 保存全局 server 引用用于优雅关闭
global.server = server;

// 处理进程信号
process.on('SIGTERM', () => gracefulShutdown('收到 SIGTERM 信号'));
process.on('SIGINT', () => gracefulShutdown('收到 SIGINT 信号'));

// 改进的异常处理
process.on('uncaughtException', (err) => {
    console.error('❌ [未捕获异常]', err.message);
    if (parseFloat(getMemoryStatus().percent) > 85) {
        gracefulShutdown('异常触发 + 内存告急');
    }
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ [未处理的 Promise 拒绝]', reason);
});