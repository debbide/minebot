// ==UserScript==
// @name         Zampto Auto Renew (16H Stable)
// @namespace    http://tampermonkey.net/
// @version      4.1-Stable
// @description  稳定挂机版：每16小时自动续期，包含自动刷新预热与结果判定
// @author       Gemini
// @match        https://dash.zampto.net/server?id=2574*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- 1. 生产环境配置 ---
    const CONFIG = {
        storageKey: 'zampto_prod_v1',    // 使用新Key，确保不与调试数据冲突
        btnText: "Renew Server",
        renewInterval: 16 * 60 * 60 * 1000, // 【设定】16小时循环
        warmupDuration: 15 * 1000,       // 刷新后等待15秒
        fallbackReload: 45 * 1000        // 点击后45秒无反应则强制刷新检查
    };

    // --- 2. 状态管理 ---
    // status: idle (挂机) -> warmup (刷新后等待) -> validating (点击后等待验证)
    let data = JSON.parse(localStorage.getItem(CONFIG.storageKey)) || {
        nextRunTime: 0,
        status: 'idle', 
        logs: [],
        lastExpiryMinutes: 0,
        warmupEndTime: 0,
        validateStartTime: 0
    };

    // --- 3. 工具函数 ---
    function simulateClick(element) {
        if (!element) return;
        ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(eventType => {
            const event = new MouseEvent(eventType, { bubbles: true, cancelable: true, view: window });
            element.dispatchEvent(event);
        });
    }

    function getCleanExpiryMinutes() {
        const elements = Array.from(document.querySelectorAll('p, div, span, li'));
        const target = elements.find(el => el.textContent.includes('Expiry') && !el.textContent.includes('function') && el.innerText.length < 150);
        if (!target) return 0;
        const text = target.innerText;
        let total = 0;
        text.replace(/(\d+)\s*day/g, (_, d) => total += d * 1440);
        text.replace(/(\d+)\s*h/g, (_, h) => total += h * 60);
        text.replace(/(\d+)\s*m/g, (_, m) => total += parseInt(m));
        return total;
    }

    function getExpiryDisplay() {
        const elements = Array.from(document.querySelectorAll('p, div, span, li'));
        const target = elements.find(el => el.textContent.includes('Expiry') && !el.textContent.includes('function'));
        return target ? target.innerText.replace('Expiry (Next Renewal):', '').trim() : "获取中...";
    }

    // --- 4. UI 面板 (清爽版) ---
    const panel = document.createElement('div');
    panel.style = "position:fixed;bottom:10px;right:10px;width:400px;background:#1a1a1a;color:#e0e0e0;z-index:999999;border:1px solid #333;padding:12px;font-family:'Segoe UI', monospace;font-size:12px;box-shadow: 0 4px 15px rgba(0,0,0,0.5);border-radius:8px;";
    
    panel.innerHTML = `
        <div style="border-bottom:1px solid #333;margin-bottom:10px;padding-bottom:5px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:bold;color:#4caf50;font-size:13px;">🛡️ Zampto 自动续期 (16H)</span>
            <button id="kb-hide" style="background:none;border:none;color:#666;cursor:pointer;">[-]</button>
        </div>
        <div id="kb-content">
            <div id="kb-status" style="margin-bottom:10px;color:#fff;font-size:13px;background:#2d2d2d;padding:10px;border-radius:4px;border-left:4px solid #4caf50;">准备就绪</div>
            <div style="margin-bottom:10px;display:flex;gap:10px;">
                <button id="kb-run-now" style="background:#1976d2;color:white;border:none;padding:5px 12px;cursor:pointer;border-radius:4px;">立即运行</button>
                <button id="kb-reset" style="background:#d32f2f;color:white;border:none;padding:5px 12px;cursor:pointer;border-radius:4px;">重置任务</button>
            </div>
            <div id="kb-logs" style="height:200px;overflow-y:auto;border:1px solid #333;padding:8px;background:#000;border-radius:4px;line-height:1.5;color:#aaa;"></div>
        </div>
    `;
    document.body.appendChild(panel);

    function log(msg, color = "#aaa") {
        const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        data.logs.unshift(`<div style="color:${color};margin-bottom:3px;border-bottom:1px dashed #222;padding-bottom:2px;"><span style="color:#555">[${time}]</span> ${msg}</div>`);
        if (data.logs.length > 50) data.logs.pop();
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
        renderLogs();
    }
    
    function renderLogs() { const el = document.getElementById('kb-logs'); if(el) el.innerHTML = data.logs.join(''); }
    function updateStatus(text, borderColor = "#4caf50") { 
        const el = document.getElementById('kb-status');
        if(el) { el.innerHTML = text; el.style.borderLeftColor = borderColor; }
    }

    // --- 5. 核心逻辑 ---

    // [A] 开始周期：刷新页面
    function startCycle() {
        log("⏰ 16小时周期结束，刷新页面预热...", "#ff9800");
        data.status = 'warmup';
        data.warmupEndTime = Date.now() + CONFIG.warmupDuration;
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
        location.reload();
    }

    // [B] 预热等待
    function processWarmup() {
        const diff = data.warmupEndTime - Date.now();
        if (diff > 0) {
            updateStatus(`🔥 网页预热中... ${Math.ceil(diff/1000)}s`, "#ffc107");
            return;
        }
        log("✅ 预热完毕，开始执行", "#4caf50");
        executeClick();
    }

    // [C] 点击操作
    function executeClick() {
        const minutes = getCleanExpiryMinutes();
        if (minutes === 0) return; // 没读到时间，下秒重试

        data.lastExpiryMinutes = minutes;
        
        const btn = Array.from(document.querySelectorAll('button, a')).find(el => el.textContent.includes(CONFIG.btnText));
        
        if (btn) {
            log(`📊 当前时间: ${getExpiryDisplay()}`, "#2196f3");
            log("🖱️ 点击续期按钮", "#ba68c8");
            
            data.status = 'validating';
            data.validateStartTime = Date.now();
            localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));

            updateStatus("🚀 等待网页自动刷新...", "#ba68c8");
            simulateClick(btn);
        } else {
            log("❌ 未找到按钮，延时重试", "#f44336");
            data.warmupEndTime = Date.now() + 5000; // 再找5秒
            localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
        }
    }

    // [D] 结果验证
    function checkResult() {
        const currentMinutes = getCleanExpiryMinutes();
        const displayTime = getExpiryDisplay();

        if (currentMinutes === 0) return;

        if (currentMinutes > data.lastExpiryMinutes || currentMinutes > 2000) {
            log(`✅ 续期成功! 新时间: ${displayTime}`, "#4caf50");
            updateStatus("✅ 休眠中 (16小时)", "#4caf50");
        } else {
            log(`⚠️ 时间未变，可能已达上限或点击无效`, "#ff9800");
        }
        
        data.status = 'idle';
        data.nextRunTime = Date.now() + CONFIG.renewInterval;
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
        log("💤 进入16小时倒计时", "#fff");
    }

    // --- 6. 主循环 ---
    setInterval(() => {
        const now = Date.now();

        // 状态: 刷新归来
        if (data.status === 'warmup') {
            processWarmup();
            return;
        }

        // 状态: 等待自动刷新
        if (data.status === 'validating') {
            // 页面刚加载且状态为validating -> 说明自动刷新成功
            if (performance.now() < 10000) {
                checkResult();
            } else {
                const wait = now - data.validateStartTime;
                updateStatus(`🚀 等待页面响应... ${Math.floor(wait/1000)}s`, "#ba68c8");
                if (wait > CONFIG.fallbackReload) {
                    log("⚠️ 响应超时，强制刷新查结果", "#ff5722");
                    location.reload();
                }
            }
            return;
        }

        // 状态: 挂机
        if (data.status === 'idle') {
            if (now < data.nextRunTime) {
                const diff = data.nextRunTime - now;
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                updateStatus(`⏳ 下次续期: ${h}小时 ${m}分 后`, "#2196f3");
            } else {
                startCycle();
            }
        }
    }, 1000);

    // --- 7. 交互 ---
    renderLogs();
    
    document.getElementById('kb-reset').onclick = () => {
        if(confirm("重置所有状态并刷新？")) {
            data = { nextRunTime: 0, status: 'idle', logs: [], lastExpiryMinutes: 0 };
            localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
            location.reload();
        }
    };

    document.getElementById('kb-run-now').onclick = () => {
        if(confirm("跳过等待，立即执行续期？")) {
            startCycle();
        }
    };
    
    document.getElementById('kb-hide').onclick = () => {
        const c = document.getElementById('kb-content');
        const b = document.getElementById('kb-hide');
        const h = c.style.display === 'none';
        c.style.display = h ? 'block' : 'none';
        b.innerText = h ? "[-]" : "[+]";
    };

    log("🛡️ 16H 稳定版已启动", "#fff");

})();
