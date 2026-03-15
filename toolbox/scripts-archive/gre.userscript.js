// ==UserScript==
// @name         GreatHost Auto Renew (Stable Flow v1.0)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  自动续期 v1.0：适配 greathost.es，倒计时点击 + 5天以上自动待命
// @author       Antigravity
// @match        https://greathost.es/contracts/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // --- 1. 配置参数 ---
    const CONFIG = {
        storageKey: 'greathost_renew_v1',
        checkInterval: 10 * 1000, // 每10秒检查一次页面状态
        standbyInterval: 12 * 60 * 60 * 1000, // 5天以上时，12小时检查一次

        // 选择器 (Selectors) - 增加容错性
        // 脚本会自动在页面搜索包含关键字的按钮
        renewBtnKeywords: ['Wait', 'Renew', 'Extend', 'Extender'],
        daysLeftKeywords: ['days left', 'Expires in', 'Ends on'],
    };

    // --- 2. 初始化数据 ---
    let data = JSON.parse(localStorage.getItem(CONFIG.storageKey)) || {
        nextRunTime: 0,
        logs: [],
        isPaused: false,
        status: 'idle', // idle, standby, renewing
        lastKnownDays: 99
    };

    let isBusy = false;

    // --- 3. UI 构建 (沿用 Katabump 风格) ---
    const style = document.createElement('style');
    style.innerHTML = `
        #gh-panel {
            position: fixed; bottom: 10px; right: 10px; width: 380px;
            background: #080808; color: #ccc; z-index: 999999;
            border: 1px solid #333; border-radius: 6px; padding: 10px;
            font-family: monospace; font-size: 12px;
            box-shadow: 0 -5px 20px rgba(0,0,0,0.9);
        }
        #gh-header { display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px solid #333; padding-bottom: 5px; }
        .gh-btn { cursor: pointer; border: none; padding: 5px 10px; border-radius: 3px; font-weight: bold; margin-right: 5px; }
        .gh-btn-run { background: #198754; color: white; }
        .gh-btn-pause { background: #ffc107; color: black; }
        #gh-logs { height: 160px; overflow-y: auto; background: #000; border: 1px solid #333; margin-top: 8px; padding: 5px; }
        .log-time { color: #555; margin-right: 5px; }
        .log-step { color: #17a2b8; font-weight: bold; border-left: 3px solid #17a2b8; padding-left: 5px; display: block; margin-top: 2px;}
        .log-success { color: #198754; }
        .log-error { color: #dc3545; }
        .log-warn { color: #ffc107; }
    `;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'gh-panel';
    panel.innerHTML = `
        <div id="gh-header">
            <span style="color:#17a2b8;">🛡️ GreatHost v1.0 (Auto)</span>
            <button id="gh-hide" style="background:none;border:none;color:#666;cursor:pointer;">[-]</button>
        </div>
        <div id="gh-content">
            <div id="gh-info" style="margin-bottom:4px; padding:5px; background:#111; color:#00d4ff; border: 1px solid #222; font-size:11px;">获取服务器时长中...</div>
            <div id="gh-status" style="margin-bottom:8px; padding:5px; background:#222;">初始化...</div>
            <div>
                <button id="gh-manual" class="gh-btn gh-btn-run">手动重置</button>
                <button id="gh-pause" class="gh-btn gh-btn-pause">暂停</button>
            </div>
            <div id="gh-logs"></div>
        </div>
    `;
    document.body.appendChild(panel);

    const ui = {
        info: document.getElementById('gh-info'),
        status: document.getElementById('gh-status'),
        logs: document.getElementById('gh-logs'),
        btnManual: document.getElementById('gh-manual'),
        btnPause: document.getElementById('gh-pause'),
        btnHide: document.getElementById('gh-hide'),
        content: document.getElementById('gh-content')
    };

    // --- 4. 工具函数 ---
    function saveData() { localStorage.setItem(CONFIG.storageKey, JSON.stringify(data)); }
    function log(msg, type = 'info') {
        const time = new Date().toLocaleTimeString('en-GB');
        data.logs.unshift({ time, msg, type });
        if (data.logs.length > 50) data.logs.pop();
        saveData();
        renderLogs();
    }
    function renderLogs() {
        ui.logs.innerHTML = data.logs.map(l =>
            `<div><span class="log-time">[${l.time}]</span><span class="log-${l.type}">${l.msg}</span></div>`
        ).join('');
    }
    function updateStatus(text, color = '#fff') {
        ui.status.innerHTML = text;
        ui.status.style.color = color;
    }
    function updateInfo(text) {
        ui.info.innerHTML = `📊 已累计续期时长: <b>${text}</b>`;
    }
    function formatTime(ms) {
        if (ms <= 0) return "00:00:00";
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        return `${h}h ${m}m ${s}s`;
    }
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // 搜索按钮：分离“等待”和“可点击”
    function getBtnState() {
        const buttons = Array.from(document.querySelectorAll('button, a.btn'));
        let waitBtn = null;
        let actionBtn = document.getElementById('renew-free-server-btn'); // 精准锁定 ID

        for (let b of buttons) {
            const text = b.innerText.trim();
            // 优先查找包含 Wait 的按钮
            if (/Wait/i.test(text)) {
                waitBtn = b;
                break; // 只要有一个在等待，就整体进入等待模式
            }
            // 如果没通过 ID 找到，尝试通过关键字找（作为兜底）
            if (!actionBtn && CONFIG.renewBtnKeywords.slice(1).some(kw => text.toLowerCase().includes(kw.toLowerCase()))) {
                actionBtn = b;
            }
        }
        return { waitBtn, actionBtn };
    }

    // 搜索时间/状态信息
    function getStatusInfo() {
        const bodyText = document.body.innerText;
        let info = {
            accumulated: null, // 累计时间（单位：天）
            accumulatedText: "未知",
            daysLeft: null
        };

        // 1. 精准解析累计时间 (优先通过 ID 抓取)
        const accEl = document.getElementById('accumulated-time');
        if (accEl) {
            const text = accEl.innerText.trim();
            info.accumulatedText = text;
            const val = parseInt(text, 10);
            if (!isNaN(val)) {
                info.accumulated = text.toLowerCase().includes('day') ? val : val / 24;
            }
        } else {
            // 兜底正则解析：匹配 "Accumulated time" 后面紧跟的数字
            const accMatch = bodyText.match(/Accumulated time\s*[:\n]*\s*(\d+)\s*(hour|day)s?/i);
            if (accMatch) {
                const val = parseInt(accMatch[1], 10);
                const unit = accMatch[2].toLowerCase();
                info.accumulated = unit.includes('day') ? val : val / 24;
                info.accumulatedText = `${accMatch[1]} ${accMatch[2]}${val > 1 ? 's' : ''}`;
            }
        }

        // 2. 解析下次续期
        const dateMatch = bodyText.match(/Next Renewal\s*[:\n]\s*(\d{4}\/\d{1,2}\/\d{1,2}(?:\s+\d{1,2}:\d{1,2}:\d{1,2})?)/);
        if (dateMatch) {
            const dateStr = dateMatch[1].replace(/\//g, '-');
            const diff = new Date(dateStr) - new Date();
            info.daysLeft = diff / (1000 * 60 * 60 * 24);
        }

        return info;
    }

    // --- 5. 核心逻辑 ---

    async function loop() {
        if (data.isPaused) { updateStatus("🔴 已暂停", "#ff4444"); return; }
        if (isBusy) return;

        // 1. 检查服务器状态
        const info = getStatusInfo();
        updateInfo(info.accumulatedText);

        // 判定逻辑：
        // A. 如果是大等于 5 天，进入/保持待命
        if (info.accumulated !== null && info.accumulated >= 5) {
            updateStatus(`✅ 已累计: ${info.accumulatedText} (待命/不续期)`, "#198754");
            data.status = 'standby';
            saveData();
            return;
        }

        // B. 如果处于待命状态，但时间还没掉到 3 天以下 (72小时)，继续待命
        if (data.status === 'standby' && info.accumulated !== null && info.accumulated >= 3) {
            updateStatus(`📅 状态: 待命中 (${info.accumulatedText})`, "#198754");
            return;
        }

        // C. 如果时间少于 3 天，或者解析不到时间，确保状态为 idle 以激活运行
        if (data.status === 'standby') {
            log("🔓 累计时间少于 3 天，重新激活续期流程", "warn");
            data.status = 'idle';
            saveData();
        }

        // D. 无累计时间时的备份判断（通过到期日期）
        if (info.accumulated === null && info.daysLeft !== null) {
            if (info.daysLeft >= 5) {
                updateStatus(`📅 剩余 ${Math.floor(info.daysLeft)}天 (待命)`);
                data.status = 'standby';
                saveData();
                return;
            } else if (info.daysLeft < 3 && data.status === 'standby') {
                data.status = 'idle';
                saveData();
            }
        }

        // 2. 识别按钮优先级
        const { waitBtn, actionBtn } = getBtnState();

        // 核心修正：如果存在 Wait 按钮，严禁执行点击，必须进入倒计时
        if (waitBtn) {
            const btnText = waitBtn.innerText.trim();
            const waitMatch = btnText.match(/Wait\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?/i);

            if (waitMatch && (waitMatch[1] || waitMatch[2])) {
                const hours = parseInt(waitMatch[1] || 0, 10);
                const mins = parseInt(waitMatch[2] || 0, 10);
                const totalMs = (hours * 60 + mins) * 60 * 1000;

                updateStatus(`⏳ 等待倒计时: ${btnText}`);
                data.nextRunTime = Date.now() + totalMs + 30000; // 额外宽限30秒
                data.status = 'idle';
                saveData();
                return;
            }
        }

        // 3. 只有在没有 Wait 按钮且有 Action 按钮时，才考虑点击
        if (actionBtn) {
            const btnText = actionBtn.innerText.trim();
            // 脚本初次加载增加 5 秒观察期，防止网页脚本未初始化完成
            const loadTimeDiff = Date.now() - performance.timing.navigationStart;

            if (loadTimeDiff < 5000) {
                updateStatus("👀 正在观察页面状态...");
                return;
            }

            if (Date.now() > data.nextRunTime - 2000 || !data.nextRunTime) {
                await executeRenew(actionBtn);
            } else {
                updateStatus(`⏳ 准点执行倒计时: ${formatTime(data.nextRunTime - Date.now())}`);
            }
        } else {
            updateStatus("🔎 状态检查中...", "#ccc");
        }
    }

    async function executeRenew(btn) {
        isBusy = true;
        log("🚀 满足续期条件，准备执行...", "step");

        // 拟人化延迟 3-7 秒
        const delay = 3000 + Math.random() * 4000;
        updateStatus(`🕒 拟人化延迟 ${Math.floor(delay / 1000)}s...`);
        await sleep(delay);

        log(`🖱️ 正在点击按钮: ${btn.innerText.trim()}`, "info");
        btn.click(); // 执行真实点击

        log("✅ 点击完成，等待页面响应...", "success");

        // 预设重试/检查时间
        data.nextRunTime = Date.now() + (10 * 60 * 1000);
        saveData();

        setTimeout(() => {
            isBusy = false;
            // 如果没跳转，尝试刷新看结果
            if (location.href.includes('contracts')) location.reload();
        }, 5000);
    }

    // --- 6. 事件绑定 ---

    ui.btnManual.addEventListener('click', () => {
        if (confirm("重置脚本数据并立即运行？")) {
            data.logs = [];
            data.nextRunTime = 0;
            data.isPaused = false;
            data.status = 'idle';
            saveData();
            location.reload();
        }
    });

    ui.btnPause.addEventListener('click', () => {
        data.isPaused = !data.isPaused;
        ui.btnPause.innerText = data.isPaused ? "恢复" : "暂停";
        saveData();
    });

    ui.btnHide.addEventListener('click', () => {
        ui.content.style.display = ui.content.style.display === 'none' ? 'block' : 'none';
        ui.btnHide.innerText = ui.content.style.display === 'none' ? '[+]' : '[-]';
    });

    // 启动
    ui.btnPause.innerText = data.isPaused ? "恢复" : "暂停";
    renderLogs();
    log("🤖 脚本已加载 (GreatHost v1.0)", "info");

    // 定时检查
    setInterval(loop, CONFIG.checkInterval);
    loop();

})();
