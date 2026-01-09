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
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const activeBots = new Map();
const CONFIG_FILE = path.join(__dirname, 'bots_config.json');
const mcDataCache = new Map(); 

app.use(express.json());

// --- [ 修正：内存监控逻辑 - 精准识别容器配额 ] ---
function getMemoryStatus() {
    const used = process.memoryUsage().rss; // 当前进程物理内存
    let total = os.totalmem(); // 默认系统物理内存

    // 1. 尝试识别翼龙面板分配的内存上限 (环境变量)
    if (process.env.SERVER_MEMORY) {
        total = parseInt(process.env.SERVER_MEMORY) * 1024 * 1024;
    } else {
        // 2. 尝试从 Linux 容器限制文件中获取配额 (Cgroups)
        try {
            if (fsSync.existsSync('/sys/fs/cgroup/memory/memory.limit_in_bytes')) {
                const limit = parseInt(fsSync.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim());
                if (limit < 9223372036854771712) total = limit; 
            } else if (fsSync.existsSync('/sys/fs/cgroup/memory.max')) {
                const limit = fsSync.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
                if (limit !== 'max') total = parseInt(limit);
            }
        } catch (e) {}
    }

    const percent = ((used / total) * 100).toFixed(1);
    return { 
        used: (used / 1024 / 1024).toFixed(1), 
        total: (total / 1024 / 1024).toFixed(0),
        percent 
    };
}

setInterval(() => {
    const status = getMemoryStatus();
    // 内存达到 80% 触发自愈
    if (parseFloat(status.percent) >= 80) {
        mcDataCache.clear();
        activeBots.forEach(bot => {
            bot.logs = bot.logs.slice(0, 10); // 紧急修剪内存中的日志
            bot.pushLog(`⚠️ 容器内存占用过高 (${status.percent}%)，已清理协议缓存`, 'text-red-500 font-black');
        });
        // 达到 92% 自动保护重启，防止面板崩溃
        if (parseFloat(status.percent) > 92) {
            console.error(' [系统自愈] 内存占用触及硬红线，执行自我保护。');
            process.exit(1); 
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

// --- [ API ] ---
app.get("/api/system/status", (req, res) => res.json(getMemoryStatus()));
app.get("/api/bots", (req, res) => res.json({ bots: Array.from(activeBots.values()).map(b => ({ id: b.id, username: b.username, host: b.targetHost, port: b.targetPort, status: b.status, logs: b.logs, settings: b.settings, nextRestart: b.settings.restartInterval > 0 ? new Date(b.lastRestartTick + b.settings.restartInterval * 60000).toLocaleTimeString() : '未开启' }))}));

app.post("/api/bots", (req, res) => { createSmartBot('bot_'+Math.random().toString(36).substr(2,7), req.body.host, 25565, req.body.username); res.json({ success: true }); });

// --- [ 交互：按钮与物理联动 ] ---
app.post("/api/bots/:id/toggle", (req, res) => {
    const b = activeBots.get(req.params.id);
    if (b) {
        const type = req.body.type;
        b.settings[type] = !b.settings[type];
        
        const labelMap = { ai: "AI视角", walk: "拟人巡逻", chat: "拟人喊话" };
        const label = labelMap[type] || type;
        const statusText = b.settings[type] ? "[开启]" : "[关闭]";
        
        b.pushLog(`🔘 切换: ${label} -> ${statusText}`, 'text-yellow-400 font-bold');

        if (type === 'walk' && b.instance) {
            b.instance.physicsEnabled = b.settings.walk;
            if (b.settings.walk) {
                b.pushLog(`⚙️ 物理引擎: 已激活 (巡逻模式)`, 'text-yellow-600 font-bold');
            } else {
                b.instance.pathfinder.setGoal(null); 
                b.isMoving = false;
                b.pushLog(`⚙️ 物理引擎: 已休眠 (强制静止)`, 'text-slate-500 font-bold');
            }
        }
        saveBotsConfig();
        res.json({ success: true });
    }
});

app.post("/api/bots/:id/restart-now", (req, res) => {
    const b = activeBots.get(req.params.id);
    if (b && b.instance) { b.instance.chat('/restart'); b.lastRestartTick = Date.now(); b.pushLog(`⚡ 立即重启: 已发送 /restart`, 'text-red-400 font-bold'); res.json({ success: true }); } 
    else res.status(404).json({ success: false });
});

app.post("/api/bots/:id/set-timer", (req, res) => {
    const b = activeBots.get(req.params.id);
    if (b) {
        const val = parseFloat(req.body.value) || 0;
        b.settings.restartInterval = req.body.unit === 'hour' ? Math.round(val * 60) : Math.round(val);
        b.lastRestartTick = Date.now();
        b.pushLog(`⏰ 设定: 每 ${val}${req.body.unit === 'hour' ? '小时' : '分钟'} 重启一次`, 'text-cyan-400 font-bold');
        saveBotsConfig(); res.json({ success: true });
    }
});

app.post("/api/bots/:id/pto-config", (req, res) => {
    const b = activeBots.get(req.params.id);
    if (b) {
        b.settings.pterodactyl = { url: (req.body.url || "").replace(/\/$/, ""), key: req.body.key || "", id: req.body.id || "", defaultDir: req.body.defaultDir || '/' };
        b.pushLog(`🔑 翼龙配置: 凭据已保存`, 'text-blue-300');
        saveBotsConfig(); res.json({ success: true });
    }
});

app.delete("/api/bots/:id", (req, res) => {
    const b = activeBots.get(req.params.id);
    if (b) { if(b.afkTimer) clearInterval(b.afkTimer); if(b.instance) b.instance.end(); activeBots.delete(req.params.id); saveBotsConfig(); }
    res.json({ success: true });
});

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
app.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(`Pathfinder PRO 已启动 (精准内存模式)`);
    console.log(`端口: \${PORT} | 容器内存识别已激活`);
    console.log(`=========================================`);
    if (fsSync.existsSync(CONFIG_FILE)) {
        try {
            const saved = JSON.parse(fsSync.readFileSync(CONFIG_FILE));
            saved.forEach(b => createSmartBot('bot_'+Math.random().toString(36).substr(2,5), b.host, b.port, b.username, b.logs || [], b.settings));
        } catch (e) {}
    }
});