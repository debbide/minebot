/**
 * 自动续期服务
 * 用于自动续期翼龙面板等服务器托管商的服务器
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import proxyChain from 'proxy-chain';
import os from 'os';
import fs from 'fs';
import path from 'path';

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
];

const COOKIE_FILE_PATH = path.join(process.cwd(), 'data', 'cookies.json');
const SCREENSHOT_DIR = path.join(process.cwd(), 'data', 'screenshots');

// 使用 stealth 插件绑过检测
puppeteer.use(StealthPlugin());

export class RenewalService {
  constructor(configManager, broadcast) {
    this.configManager = configManager;
    this.broadcast = broadcast;
    this.timers = new Map(); // id -> timer
    this.cookies = new Map(); // id -> cookies (缓存登录后的 cookies)
    this.browser = null; // 共享浏览器实例
    this.logs = new Map(); // id -> logs[] (每个续期配置单独的日志)
    this.globalLogs = []; // 全局日志
    this.maxLogsPerRenewal = 50;
    this.maxGlobalLogs = 100;
    this.anonymizedProxies = new Map(); // 匿名代理映射 (原始URL -> 本地URL)
    this.pages = new Map(); // id -> page (挂机模式下保持的页面实例)

    // 启动时加载已保存的续期配置
    this.loadSavedRenewals();
    this.loadCookiesFromDisk();
  }

  /**
   * 从磁盘加载 Cookies
   */
  loadCookiesFromDisk() {
    try {
      if (fs.existsSync(COOKIE_FILE_PATH)) {
        const data = fs.readFileSync(COOKIE_FILE_PATH, 'utf8');
        const cookiesJson = JSON.parse(data);
        // cookiesJson is likely an array of entries or object. 
        // We stored it as Map entries or object. Let's assume object for easier JSON
        // Convert object back to Map
        for (const [id, cookies] of Object.entries(cookiesJson)) {
          this.cookies.set(id, cookies);
        }
        console.log(`[System] 已从磁盘加载 ${this.cookies.size} 个续期配置的 Cookies`);
      }
    } catch (error) {
      console.error('[System] 加载 Cookies 失败:', error.message);
    }
  }

  /**
   * 保存 Cookies 到磁盘
   */
  saveCookiesToDisk() {
    try {
      // Ensure data dir exists
      const dataDir = path.dirname(COOKIE_FILE_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Convert Map to Object
      const cookiesObj = {};
      for (const [id, cookies] of this.cookies) {
        cookiesObj[id] = cookies;
      }

      fs.writeFileSync(COOKIE_FILE_PATH, JSON.stringify(cookiesObj, null, 2), 'utf8');
    } catch (error) {
      console.error('[System] 保存 Cookies 失败:', error.message);
    }
  }

  log(type, message, renewalId = null) {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const entry = {
      id: Date.now(),
      timestamp,
      type,
      message,
      renewalId
    };

    console.log(`[${timestamp}] [续期]${renewalId ? ` [${renewalId}]` : ''} ${message}`);

    // 添加到全局日志
    this.globalLogs.push(entry);
    if (this.globalLogs.length > this.maxGlobalLogs) {
      this.globalLogs.shift();
    }

    // 如果有 renewalId，添加到该续期的单独日志
    if (renewalId) {
      if (!this.logs.has(renewalId)) {
        this.logs.set(renewalId, []);
      }
      const renewalLogs = this.logs.get(renewalId);
      renewalLogs.push(entry);
      if (renewalLogs.length > this.maxLogsPerRenewal) {
        renewalLogs.shift();
      }
    }

    this.broadcast('renewalLog', entry);
  }

  loadSavedRenewals() {
    const config = this.configManager.getFullConfig();
    const renewals = config.renewals || [];

    for (const renewal of renewals) {
      if (renewal.enabled) {
        this.startRenewal(renewal.id);
      }
    }

    if (renewals.length > 0) {
      this.log('info', `已加载 ${renewals.length} 个续期配置`);
    }
  }

  /**
   * 获取所有续期配置
   */
  getRenewals() {
    const config = this.configManager.getFullConfig();
    return config.renewals || [];
  }

  /**
   * 获取单个续期配置
   */
  getRenewal(id) {
    const renewals = this.getRenewals();
    return renewals.find(r => r.id === id);
  }

  /**
   * 添加续期配置
   */
  addRenewal(renewalConfig) {
    const config = this.configManager.getFullConfig();
    if (!config.renewals) {
      config.renewals = [];
    }

    const id = renewalConfig.id || `renewal_${Date.now()}`;

    // 新的简化模式：'http' | 'autoLoginHttp' | 'browserClick'
    // 兼容旧配置：根据旧字段推断模式
    let mode = renewalConfig.mode;
    if (!mode) {
      if (renewalConfig.useBrowserClick && renewalConfig.autoLogin) {
        mode = 'browserClick';
      } else if (renewalConfig.autoLogin) {
        mode = 'autoLoginHttp';
      } else {
        mode = 'http';
      }
    }

    const renewal = {
      id,
      name: renewalConfig.name || '未命名续期',
      interval: renewalConfig.interval || 21600000, // 默认6小时
      enabled: renewalConfig.enabled !== false,

      // 续期模式：'http' | 'autoLoginHttp' | 'browserClick'
      mode,

      // 续期目标 URL
      url: renewalConfig.url || '',

      // HTTP 模式配置
      method: renewalConfig.method || 'GET',
      headers: renewalConfig.headers || {},
      body: renewalConfig.body || '',
      useProxy: renewalConfig.useProxy || false,
      proxyUrl: renewalConfig.proxyUrl || '',

      // 登录配置（autoLoginHttp 和 browserClick 模式需要）
      loginUrl: renewalConfig.loginUrl || '',
      panelUsername: renewalConfig.panelUsername || '',
      panelPassword: renewalConfig.panelPassword || '',

      // 浏览器点击配置（browserClick 模式）
      renewButtonSelector: renewalConfig.renewButtonSelector || '',

      // 浏览器代理配置（browserClick 模式）
      browserProxy: renewalConfig.browserProxy || '',  // 格式: socks5://127.0.0.1:1080

      // 高级配置
      closeBrowser: renewalConfig.closeBrowser !== false, // 默认 true (完成后关闭)
      afkMode: renewalConfig.afkMode || false, // 挂机模式 (默认关闭)
      clickWaitTime: parseInt(renewalConfig.clickWaitTime) || 5000, // 点击后等待时间 (默认 5000ms)

      // 状态
      lastRun: null,
      lastResult: null
    };

    config.renewals.push(renewal);
    this.configManager.updateConfig(config);

    this.log('info', `添加续期配置: ${renewal.name}`, id);

    if (renewal.enabled) {
      this.startRenewal(id);
    }

    return renewal;
  }

  /**
   * 更新续期配置
   */
  updateRenewal(id, updates) {
    const config = this.configManager.getFullConfig();
    const index = config.renewals?.findIndex(r => r.id === id);

    if (index === -1 || index === undefined) {
      throw new Error(`续期配置 ${id} 不存在`);
    }

    const wasEnabled = config.renewals[index].enabled;
    config.renewals[index] = {
      ...config.renewals[index],
      ...updates
    };

    this.configManager.updateConfig(config);

    // 处理启用/禁用状态变化
    if (wasEnabled && !updates.enabled) {
      this.stopRenewal(id);
    } else if (!wasEnabled && updates.enabled) {
      this.startRenewal(id);
    } else if (updates.enabled && (updates.interval || updates.url)) {
      // 配置变化，重启定时器
      this.stopRenewal(id);
      this.startRenewal(id);
    }

    return config.renewals[index];
  }

  /**
   * 删除续期配置
   */
  removeRenewal(id) {
    this.stopRenewal(id);

    const config = this.configManager.getFullConfig();
    const index = config.renewals?.findIndex(r => r.id === id);

    if (index === -1 || index === undefined) {
      return false;
    }

    config.renewals.splice(index, 1);
    this.configManager.updateConfig(config);

    this.log('info', `删除续期配置`, id);
    return true;
  }

  /**
   * 启动续期定时器
   */
  startRenewal(id) {
    const renewal = this.getRenewal(id);
    if (!renewal) {
      this.log('error', `续期配置不存在`, id);
      return false;
    }

    // 清除已有定时器
    this.stopRenewal(id);

    // 立即执行一次
    this.executeRenewal(id);

    // 设置定时器
    const timer = setInterval(() => {
      this.executeRenewal(id);
    }, renewal.interval);

    this.timers.set(id, timer);
    this.log('info', `启动续期定时器 (间隔: ${this.formatInterval(renewal.interval)})`, id);

    return true;
  }

  /**
   * 停止续期定时器
   */
  stopRenewal(id) {
    const timer = this.timers.get(id);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(id);
      this.log('info', `停止续期定时器`, id);

      // 如果有挂机的页面，也一并清理
      if (this.pages.has(id)) {
        const page = this.pages.get(id);
        try {
          if (!page.isClosed()) {
            page.close().catch(() => { });
            this.log('info', `清理挂机页面`, id);
          }
        } catch (e) { }
        this.pages.delete(id);
      }

      return true;
    }
    return false;
  }

  /**
   * 获取 Chrome/Chromium 可执行文件路径
   * ARM64 Linux 使用系统安装的 Chromium，AMD64 使用 Puppeteer 自带的 Chrome
   */
  getChromePath() {
    // 首先检查环境变量（优先级最高）
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      this.log('info', `使用环境变量指定的浏览器: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
      return process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    const arch = os.arch();
    const platform = os.platform();

    // ARM64 Linux: 使用系统 Chromium（因为 Puppeteer 的 Chrome 不支持 ARM Linux）
    if (platform === 'linux' && (arch === 'arm64' || arch === 'aarch64')) {
      const systemChromium = '/usr/bin/chromium';
      this.log('info', `ARM64 架构，使用系统 Chromium: ${systemChromium}`);
      return systemChromium;
    }

    // 其他平台使用 Puppeteer 默认的 Chrome
    return undefined;
  }

  /**
   * 获取或启动浏览器实例
   * @param {string} proxyUrl - 可选的代理地址，如 socks5://127.0.0.1:1080 或带认证的 socks5://user:pass@host:port
   * @param {boolean} useGuestProfile - 是否使用访客模式启动浏览器
   */
  async getBrowser(proxyUrl = null, useGuestProfile = false) {
    const executablePath = this.getChromePath();
    let actualProxyUrl = proxyUrl;

    // 检查是否已经在运行
    if (this.browser) {
      // 检查浏览器是否已断开连接
      if (!this.browser.isConnected()) {
        this.browser = null;
      } else {
        // 如果请求了代理，但现有浏览器没有代理（或者代理不同），则需要新实例
        // 简单起见，这里如果 currentBrowser 没有 proxy 且请求 proxy，暂不支持复用
        // 但目前逻辑是：如果有 proxyUrl，直接 create new instance，不复用 this.browser
        if (!actualProxyUrl) {
          return this.browser;
        }
      }
    }

    // 如果代理包含认证信息 (user:pass@host)，创建本地匿名代理
    if (proxyUrl && proxyUrl.includes('@')) {
      // 检查是否已经有该代理的匿名映射
      if (this.anonymizedProxies.has(proxyUrl)) {
        actualProxyUrl = this.anonymizedProxies.get(proxyUrl);
        this.log('info', `复用已有匿名代理: ${actualProxyUrl}`);
      } else {
        try {
          this.log('info', `创建匿名代理 (原始: ${proxyUrl.replace(/:[^:@]+@/, ':***@')})...`);
          actualProxyUrl = await proxyChain.anonymizeProxy(proxyUrl);
          this.anonymizedProxies.set(proxyUrl, actualProxyUrl);
          this.log('info', `匿名代理创建成功: ${actualProxyUrl}`);
        } catch (error) {
          this.log('error', `创建匿名代理失败: ${error.message}`);
          throw new Error(`代理认证转换失败: ${error.message}`);
        }
      }
    }

    const commonArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080'
    ];

    // 如果指定了代理，每次都创建新的浏览器实例
    if (actualProxyUrl) {
      this.log('info', `启动无头浏览器 (代理: ${actualProxyUrl})...`);
      const args = [...commonArgs, `--proxy-server=${actualProxyUrl}`];

      // [新增] 持久化 User Data Dir，根据代理区分 Profile
      // 简单的 hash 或文件名替换
      const safeProxyName = actualProxyUrl.replace(/[^a-zA-Z0-9]/g, '_');
      const profilePath = path.join(process.cwd(), 'data', 'browser_profiles', `proxy_${safeProxyName.substring(0, 32)}`); // 截断避免太长

      if (!fs.existsSync(profilePath)) {
        try { fs.mkdirSync(profilePath, { recursive: true }); } catch (e) { }
      }

      this.log('info', `使用持久化浏览器配置: ${profilePath}`);

      return await puppeteer.launch({
        headless: 'new',
        executablePath,
        userDataDir: profilePath, // 启用持久化
        args
      });
    }

    // 无代理时复用浏览器实例
    if (!this.browser || !this.browser.isConnected()) {
      this.log('info', '启动无头浏览器 (无代理)...');

      // [新增] 无代理的默认 Profile
      const defaultProfilePath = path.join(process.cwd(), 'data', 'browser_profiles', 'default');
      if (!fs.existsSync(defaultProfilePath)) {
        try { fs.mkdirSync(defaultProfilePath, { recursive: true }); } catch (e) { }
      }
      this.log('info', `使用持久化浏览器配置: ${defaultProfilePath}`);

      this.browser = await puppeteer.launch({
        headless: 'new',
        executablePath,
        userDataDir: defaultProfilePath, // 启用持久化
        args: commonArgs
      });
    }
    return this.browser;
  }

  /**
   * 关闭浏览器
   */
  async closeBrowser() {
    // 清理所有挂机页面
    this.pages.clear();

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.log('info', '关闭无头浏览器');
    }

    // 清理所有匿名代理
    for (const [originalUrl, anonymizedUrl] of this.anonymizedProxies) {
      try {
        await proxyChain.closeAnonymizedProxy(anonymizedUrl, true);
        this.log('info', `关闭匿名代理: ${anonymizedUrl}`);
      } catch (error) {
        // 忽略关闭错误
      }
    }
    this.anonymizedProxies.clear();
  }


  /**
   * 处理 Cloudflare Turnstile 验证
   */
  async handleCloudflareChallenge(page, id) {
    try {
      // 检查是否有 Turnstile iframe
      const turnstileFrames = await page.$$('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]');

      if (turnstileFrames.length > 0) {
        this.log('info', `检测到 ${turnstileFrames.length} 个 Cloudflare 验证框，尝试自动处理...`, id);

        for (const frameElement of turnstileFrames) {
          try {
            const frame = await frameElement.contentFrame();
            if (!frame) continue;

            await this.delay(1000);

            // 尝试查找复选框
            const checkbox = await frame.$('input[type="checkbox"]') ||
              await frame.$('.ctp-checkbox-label') ||
              await frame.$('#challenge-stage'); // 某些情况下点击容器也行

            if (checkbox) {
              this.log('info', '找到验证复选框，尝试点击...', id);
              await checkbox.click();
              await this.delay(3000);
            } else {
              // 如果找不到明确的 checkbox，尝试点击 iframe 中心
              const box = await frameElement.boundingBox();
              if (box) {
                this.log('info', '尝试点击验证框中心...', id);
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                await this.delay(3000);
              }
            }
          } catch (e) {
            this.log('warning', `处理单个验证框失败: ${e.message}`, id);
          }
        }
        return true;
      }
    } catch (error) {
      // 忽略错误，可能不是 CF 页面
    }
    return false;
  }

  /**
   * 延迟辅助函数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 使用无头浏览器自动登录获取 Cookie
   */
  async autoLoginAndGetCookies(renewal) {
    const { id, loginUrl, panelUsername, panelPassword } = renewal;

    if (!loginUrl || !panelUsername || !panelPassword) {
      throw new Error('自动登录需要配置登录URL、账号和密码');
    }

    this.log('info', `开始自动登录: ${loginUrl}`, id);

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // 设置视口和 User-Agent
      await page.setViewport({ width: 1920, height: 1080 });
      const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
      this.log('info', `使用 User-Agent: ${userAgent}`, id);
      await page.setUserAgent(userAgent);

      // 访问登录页面，等待 Cloudflare 5秒盾
      this.log('info', '访问登录页面，等待 Cloudflare 验证...', id);
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      // 等待页面加载完成（可能需要通过 5 秒盾）
      await this.delay(3000);

      // 检查是否还在 Cloudflare 验证页面
      let pageContent = await page.content();
      let waitCount = 0;
      while ((pageContent.includes('checking your browser') || pageContent.includes('Just a moment')) && waitCount < 10) {
        this.log('info', '等待 Cloudflare 验证完成...', id);
        await this.delay(3000);
        pageContent = await page.content();
        waitCount++;
      }

      // 等待页面 React/Vue 渲染完成
      this.log('info', '等待页面渲染完成...', id);
      await this.delay(2000);

      // 检查并处理 Cookie 同意对话框 (GDPR)
      try {
        const consentBtn = await page.$('.fc-cta-consent') ||
          await page.$('button.fc-button.fc-cta-consent') ||
          await page.$('[aria-label="Consent"]') ||
          await page.$('button:has-text("Accept")') ||
          await page.$('button:has-text("Consent")') ||
          await page.$('button:has-text("I agree")') ||
          await page.$('button:has-text("Accept all")');
        if (consentBtn) {
          this.log('info', '检测到 Cookie 同意对话框，点击同意...', id);
          await page.evaluate(btn => btn.click(), consentBtn);
          await this.delay(2000);
        }
      } catch (e) {
        // 忽略错误，可能没有同意对话框
      }

      // 尝试查找并填写登录表单
      this.log('info', '查找登录表单...', id);

      // 翼龙面板的登录表单 - 等待输入框出现
      // 尝试多种选择器
      const usernameSelectors = [
        'input[name="identifier"]',  // zampto.net
        'input[name="user"]',
        'input[name="username"]',
        'input[name="email"]',
        'input[type="email"]',
        'input[id="user"]',
        'input[id="username"]',
        'input[id="identifier"]',
        '#user',
        '#username',
        '#identifier',
        'input[placeholder*="email"]',
        'input[placeholder*="Email"]',
        'input[placeholder*="user"]',
        'input[placeholder*="User"]',
        'input[autocomplete*="username"]',
        'input[autocomplete*="email"]'
      ];

      const passwordSelectors = [
        'input[name="password"]',
        'input[type="password"]',
        'input[id="password"]',
        '#password'
      ];

      let usernameInput = null;
      let passwordInput = null;

      // 等待表单元素出现（最多等待 30 秒，Clerk 等 SPA 需要更长时间）
      for (let attempt = 0; attempt < 10; attempt++) {
        // 查找用户名输入框
        for (const selector of usernameSelectors) {
          try {
            usernameInput = await page.$(selector);
            if (usernameInput) {
              this.log('info', `找到用户名输入框: ${selector}`, id);
              break;
            }
          } catch (e) { }
        }

        // 查找密码输入框
        for (const selector of passwordSelectors) {
          try {
            passwordInput = await page.$(selector);
            if (passwordInput) {
              this.log('info', `找到密码输入框: ${selector}`, id);
              break;
            }
          } catch (e) { }
        }

        if (usernameInput && passwordInput) break;

        // 如果找到用户名但没找到密码，可能是 Clerk 的多步登录
        if (usernameInput && !passwordInput) {
          this.log('info', '找到用户名框但未找到密码框，可能是多步登录', id);
          break;
        }

        this.log('info', `等待表单加载... (${attempt + 1}/10)`, id);
        await this.delay(3000);
      }

      // 如果找不到表单，打印页面上所有的 input 元素用于调试
      if (!usernameInput) {
        const allInputs = await page.$$eval('input', inputs =>
          inputs.map(i => ({
            type: i.type,
            name: i.name,
            id: i.id,
            placeholder: i.placeholder,
            autocomplete: i.autocomplete
          }))
        );
        this.log('error', `页面上的 input 元素: ${JSON.stringify(allInputs)}`, id);

        const title = await page.title();
        this.log('error', `当前页面标题: ${title}`, id);
        throw new Error('找不到登录表单');
      }

      // 清空并填写表单 - 使用键盘输入方式确保 React 状态更新
      this.log('info', `填写登录信息... 用户名: ${panelUsername}`, id);

      // 先清空输入框，然后使用键盘输入
      await usernameInput.click({ clickCount: 3 }); // 选中所有文字
      await this.delay(100);
      await usernameInput.type(panelUsername, { delay: 50 });
      await this.delay(300);

      // 如果是多步登录（有用户名输入但没有密码输入），需要先点击 Continue
      if (!passwordInput) {
        this.log('info', '多步登录：点击继续按钮后等待密码框出现...', id);

        // 查找并点击 Continue/Next 按钮
        const continueSelectors = [
          'button[type="submit"]',
          'button[data-localization-key="formButtonPrimary"]',
          'button:has-text("Continue")',
          'button:has-text("continue")',
          'button:has-text("Next")',
          'button:has-text("继续")',
          'button:has-text("下一步")',
          '.cl-formButtonPrimary',
          'form button'
        ];

        let clickedContinue = false;
        for (const selector of continueSelectors) {
          try {
            const continueBtn = await page.$(selector);
            if (continueBtn) {
              await continueBtn.click();
              clickedContinue = true;
              this.log('info', `点击继续按钮: ${selector}`, id);
              break;
            }
          } catch (e) { }
        }

        if (!clickedContinue) {
          // 尝试按回车
          await page.keyboard.press('Enter');
          this.log('info', '尝试按回车继续', id);
        }

        // 等待密码框出现
        this.log('info', '等待密码输入框出现...', id);
        for (let i = 0; i < 10; i++) {
          await this.delay(2000);

          for (const selector of passwordSelectors) {
            try {
              passwordInput = await page.$(selector);
              if (passwordInput) {
                this.log('info', `找到密码输入框: ${selector}`, id);
                break;
              }
            } catch (e) { }
          }

          if (passwordInput) break;
          this.log('info', `等待密码框... (${i + 1}/10)`, id);
        }

        if (!passwordInput) {
          // 打印当前页面的 input 元素用于调试
          const allInputs = await page.$$eval('input', inputs =>
            inputs.map(i => ({
              type: i.type,
              name: i.name,
              id: i.id,
              placeholder: i.placeholder
            }))
          );
          this.log('error', `未找到密码框，页面 input 元素: ${JSON.stringify(allInputs)}`, id);
          throw new Error('多步登录失败：未找到密码输入框');
        }
      }

      // 填写密码 - 使用键盘输入方式确保 React 状态更新
      this.log('info', '填写密码...', id);
      await this.delay(300);
      await passwordInput.click({ clickCount: 3 }); // 选中所有文字
      await this.delay(100);
      await passwordInput.type(panelPassword, { delay: 50 });
      await this.delay(500);

      // 查找并点击登录按钮
      this.log('info', '查找登录按钮...', id);
      const submitSelectors = [
        'button[type="submit"]',
        'button[data-localization-key="formButtonPrimary"]',
        'input[type="submit"]',
        '.cl-formButtonPrimary',
        '.login-button',
        '#login-button',
        'form button'
      ];

      let submitBtn = null;
      for (const selector of submitSelectors) {
        try {
          submitBtn = await page.$(selector);
          if (submitBtn) {
            const btnText = await page.evaluate(el => el.textContent || '', submitBtn);
            this.log('info', `找到登录按钮: ${selector} (${btnText.trim()})`, id);
            break;
          }
        } catch (e) { }
      }

      if (submitBtn) {
        // 检查是否有 reCAPTCHA
        const hasRecaptcha = await page.evaluate(() => {
          return !!(
            document.querySelector('.g-recaptcha') ||
            document.querySelector('[data-sitekey]') ||
            document.querySelector('iframe[src*="recaptcha"]') ||
            window.grecaptcha
          );
        });

        if (hasRecaptcha) {
          this.log('info', '检测到 reCAPTCHA，等待验证...', id);
          // 等待 reCAPTCHA v3 自动评分或 invisible reCAPTCHA 加载
          await this.delay(3000);

          // 尝试执行 reCAPTCHA（如果是 v3 或 invisible）
          try {
            await page.evaluate(() => {
              if (window.grecaptcha && window.grecaptcha.execute) {
                // 尝试获取 sitekey
                const recaptchaEl = document.querySelector('[data-sitekey]');
                if (recaptchaEl) {
                  const sitekey = recaptchaEl.getAttribute('data-sitekey');
                  window.grecaptcha.execute(sitekey);
                } else {
                  window.grecaptcha.execute();
                }
              }
            });
            this.log('info', '尝试执行 reCAPTCHA...', id);
            await this.delay(3000);
          } catch (e) {
            // 忽略错误
          }
        }

        // 使用多种方式尝试提交表单
        this.log('info', '点击登录按钮', id);

        // 方式1: 直接点击按钮
        await submitBtn.click();
        await this.delay(3000);

        // 检查是否还在登录页
        let currentLoginUrl = page.url();
        if (currentLoginUrl.includes('/auth/login') || currentLoginUrl.includes('/login')) {
          // 可能 reCAPTCHA 验证中，多等待一些
          if (hasRecaptcha) {
            this.log('info', '等待 reCAPTCHA 验证完成...', id);
            await this.delay(5000);
            currentLoginUrl = page.url();
          }

          if (currentLoginUrl.includes('/auth/login') || currentLoginUrl.includes('/login')) {
            this.log('info', '尝试提交表单...', id);
            // 方式2: 尝试提交表单
            try {
              await page.evaluate(() => {
                const form = document.querySelector('form');
                if (form) form.submit();
              });
            } catch (e) {
              // 忽略，可能表单已提交
            }
            await this.delay(2000);

            // 方式3: 使用键盘按回车
            currentLoginUrl = page.url();
            if (currentLoginUrl.includes('/auth/login') || currentLoginUrl.includes('/login')) {
              this.log('info', '尝试按回车提交...', id);
              await page.keyboard.press('Enter');
            }
          }
        }
      } else {
        // 尝试按回车提交
        this.log('info', '未找到登录按钮，尝试按回车提交', id);
        await page.keyboard.press('Enter');
      }

      // 等待登录完成
      this.log('info', '等待登录完成...', id);
      await this.delay(5000);

      // 等待页面跳转或登录完成
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (e) {
        // 可能已经在目标页面了
        this.log('info', '导航超时，检查当前页面...', id);
      }

      // 再等待一下确保 cookie 设置完成
      await this.delay(2000);

      // 如果登录后还在 auth 域名，需要先导航到目标面板域名获取 cookies
      let currentUrl = page.url();
      if (currentUrl.includes('auth.') || currentUrl.includes('/sign-in')) {
        // 尝试从续期 URL 提取目标域名
        const renewUrl = new URL(renewal.url || renewal.renewPageUrl);
        const dashboardUrl = `${renewUrl.protocol}//${renewUrl.host}`;
        this.log('info', `登录后导航到目标面板: ${dashboardUrl}`, id);
        try {
          await page.goto(dashboardUrl, { waitUntil: 'networkidle2', timeout: 30000 });
          await this.delay(3000);
          currentUrl = page.url();
        } catch (e) {
          this.log('warning', `导航到面板失败: ${e.message}`, id);
        }
      }

      // 检查是否登录成功（页面是否还在登录页）
      const currentContent = await page.content();

      // 检查是否还在登录页
      const stillOnLoginPage = currentUrl.includes('/login') ||
        currentUrl.includes('/auth') ||
        currentUrl.includes('/sign-in') ||
        currentContent.includes('Sign in') ||
        currentContent.includes('Login') ||
        currentContent.includes('登录');

      // 检查是否有错误信息
      const hasError = currentContent.includes('Invalid') ||
        currentContent.includes('incorrect') ||
        currentContent.includes('wrong') ||
        currentContent.includes('credentials') ||
        currentContent.includes('failed');

      if (hasError) {
        this.log('error', '登录失败：账号或密码错误', id);
        throw new Error('登录失败：账号或密码错误');
      }

      this.log('info', `登录后页面: ${currentUrl}`, id);

      if (stillOnLoginPage) {
        this.log('warning', '登录后仍在登录页面，可能需要验证或登录失败', id);
      }

      // 获取 Cookies - 包括所有相关域名
      // 先获取当前页面的 cookies
      let cookies = await page.cookies();

      // 尝试获取续期目标 URL 域名的 cookies
      try {
        const targetUrl = renewal.url || renewal.renewPageUrl;
        if (targetUrl) {
          const targetCookies = await page.cookies(targetUrl);
          // 合并 cookies，避免重复
          const existingNames = new Set(cookies.map(c => `${c.name}@${c.domain}`));
          for (const cookie of targetCookies) {
            const key = `${cookie.name}@${cookie.domain}`;
            if (!existingNames.has(key)) {
              cookies.push(cookie);
              existingNames.add(key);
            }
          }
        }
      } catch (e) {
        // 忽略获取额外 cookies 的错误
      }

      if (cookies.length === 0) {
        throw new Error('登录后未获取到 Cookie');
      }

      // 检查是否包含关键 cookie
      const hasPterodactylSession = cookies.some(c => c.name === 'pterodactyl_session');
      const hasXsrfToken = cookies.some(c => c.name === 'XSRF-TOKEN');
      const hasCfClearance = cookies.some(c => c.name === 'cf_clearance');

      // 额外检查 zampto 特定的 session cookie
      const hasAnySession = cookies.some(c => c.name.toLowerCase().includes('session'));

      this.log('info', `获取到 ${cookies.length} 个 Cookie (session: ${hasPterodactylSession || hasAnySession}, xsrf: ${hasXsrfToken}, cf: ${hasCfClearance})`, id);

      // 如果没有找到关键 session cookie，打印所有 cookie 名称用于调试
      if (!hasPterodactylSession && !hasAnySession && !hasXsrfToken) {
        const cookieNames = cookies.map(c => `${c.name}(${c.domain})`).join(', ');
        this.log('warning', `Cookie 列表: ${cookieNames}`, id);
      }

      // 缓存 cookies
      this.cookies.set(id, cookies);

      // 构建 Cookie 字符串
      const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      return cookieString;

    } catch (error) {
      this.log('error', `自动登录失败: ${error.message}`, id);
      throw error;
    } finally {
      await page.close();
    }
  }

  /**
   * 获取缓存的 Cookie 字符串
   */
  getCachedCookieString(id) {
    const cookies = this.cookies.get(id);
    if (!cookies || cookies.length === 0) {
      return null;
    }
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  /**
   * 从缓存的 Cookie 中获取 XSRF-TOKEN
   */
  getXsrfToken(id) {
    const cookies = this.cookies.get(id);
    if (!cookies) return null;
    const xsrfCookie = cookies.find(c => c.name === 'XSRF-TOKEN');
    if (!xsrfCookie) return null;
    // XSRF-TOKEN 通常是 URL 编码的，需要解码
    try {
      return decodeURIComponent(xsrfCookie.value);
    } catch {
      return xsrfCookie.value;
    }
  }

  /**
   * 使用浏览器点击续期按钮
   */
  async browserClickRenew(renewal) {
    const { id, url, renewButtonSelector, loginUrl, panelUsername, panelPassword, browserProxy, closeBrowser, afkMode, clickWaitTime } = renewal;

    if (!loginUrl || !panelUsername || !panelPassword) {
      throw new Error('浏览器点击续期需要配置登录URL、账号和密码');
    }

    this.log('info', `开始浏览器点击续期...${browserProxy ? ` (代理: ${browserProxy})` : ''}`, id);

    // 如果有代理，创建独立的浏览器实例
    const browser = await this.getBrowser(browserProxy || null);
    const isProxyBrowser = !!browserProxy;

    let page;
    let reusedPage = false;

    // 检查是否有可复用的页面 (挂机模式)
    if (afkMode && this.pages.has(id)) {
      const existingPage = this.pages.get(id);
      if (existingPage && !existingPage.isClosed()) {
        try {
          // 检查页面是否还关联着浏览器
          if (existingPage.browser().isConnected()) {
            page = existingPage;
            reusedPage = true;
            this.log('info', '复用已有的挂机页面', id);

            // 激活标签页
            try { await page.bringToFront(); } catch (e) { }
          } else {
            this.pages.delete(id);
          }
        } catch (e) {
          this.pages.delete(id); // 页面可能已失效
        }
      } else {
        this.pages.delete(id);
      }
    }

    if (!page) {
      page = await browser.newPage();
      if (afkMode) {
        this.pages.set(id, page);
      }
    }

    try {
      // 设置视口
      await page.setViewport({ width: 1920, height: 1080 });

      // 随机选择 User-Agent
      const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
      this.log('info', `使用 User-Agent: ${userAgent}`, id);
      await page.setUserAgent(userAgent);

      // 尝试恢复 Cookies
      const savedCookies = this.cookies.get(id);
      if (savedCookies && savedCookies.length > 0) {
        try {
          this.log('info', `恢复 ${savedCookies.length} 个已保存的 Cookie...`, id);
          // 过滤掉无效或过期的 cookie (保留 session cookies：expires 为空、0 或 -1)
          const validCookies = savedCookies.filter(c => !c.expires || c.expires <= 0 || c.expires > Date.now() / 1000);
          if (validCookies.length > 0) {
            await page.setCookie(...validCookies);
          }
        } catch (e) {
          this.log('warning', `恢复 Cookie 失败: ${e.message}`, id);
        }
      }

      // ========== 登录部分 - 复用 autoLoginAndGetCookies 的逻辑 ==========
      // 访问目标页面（先尝试直接访问续期页，如果 Cookie 有效则不需要登录）
      // 如果 Cookie 无效，通常会自动跳转到登录页
      const targetUrl = url; // 续期页面 URL
      this.log('info', `尝试直接访问目标页面: ${targetUrl}`, id);

      // 增加重试逻辑，应对 net::ERR_NETWORK_CHANGED 等网络波动
      let connectAttempts = 0;
      const maxConnectAttempts = 3;

      while (connectAttempts < maxConnectAttempts) {
        try {
          // 这里使用 targetUrl 而不是 loginUrl
          await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
          break; // 成功则跳出循环
        } catch (e) {
          connectAttempts++;
          const isNetworkError = e.message.includes('ERR_NETWORK_CHANGED') ||
            e.message.includes('ERR_CONNECTION_RESET') ||
            e.message.includes('ERR_NAME_NOT_RESOLVED');

          if (connectAttempts >= maxConnectAttempts) {
            throw e; // 重试耗尽，抛出错误
          }

          this.log('warning', `访问页面失败 (${connectAttempts}/${maxConnectAttempts}): ${e.message}，3秒后重试...`, id);
          await this.delay(3000);
        }
      }

      // 等待页面加载完成（可能需要通过 5 秒盾）
      await this.delay(3000);

      // 检查是否还在 Cloudflare 验证页面
      let pageContent = await page.content();
      let waitCount = 0;
      while ((pageContent.includes('checking your browser') || pageContent.includes('Just a moment')) && waitCount < 10) {
        this.log('info', '等待 Cloudflare 验证完成...', id);
        await this.delay(3000);
        pageContent = await page.content();
        waitCount++;
      }

      // 等待页面 React/Vue 渲染完成
      this.log('info', '等待页面渲染完成...', id);
      await this.delay(2000);

      // 检查是否已经登录（浏览器可能保留了之前的登录状态）
      let currentUrl = page.url();

      // 处理 Cookie 弹窗 (参考 DrissionPage 配置) - 在任何阶段都可能出现
      try {
        const cookieBtnSelector = "button.fc-cta-do-not-consent";
        const cookieBtn = await page.$(cookieBtnSelector);
        if (cookieBtn) {
          this.log('info', '发现 Cookie 拒绝按钮，尝试点击自动关闭...', id);
          await cookieBtn.click();
          await this.delay(1000);
        }
      } catch (e) { }

      const alreadyLoggedIn = !currentUrl.includes('/login') &&
        !currentUrl.includes('/auth') &&
        !currentUrl.includes('/sign-in') &&
        !currentUrl.includes('signin');

      // 如果已登录，跳过登录流程，直接进入续期
      if (alreadyLoggedIn) {
        this.log('info', `检测到已登录状态，跳过登录步骤 (当前页面: ${currentUrl})`, id);
      } else if (reusedPage) {
        // 如果是复用的页面但未登录，可能登录失效，刷新页面重试
        this.log('warning', '复用页面未检测到登录状态，尝试刷新...', id);
        await page.reload({ waitUntil: 'networkidle2' });
        await this.delay(3000);
        // 继续下面的登录流程

        // 重新检查是否登录
        currentUrl = page.url();
        const stillNotLoggedIn = !currentUrl.includes('/login') && !currentUrl.includes('/auth') && !currentUrl.includes('/sign-in');

        if (stillNotLoggedIn) {
          this.log('info', '刷新后检测到已登录', id);
        } else {
          // 需要重新登录
          this.log('info', '刷新后仍需登录', id);
          // 这里会继续执行下面的登录代码
        }
      }

      // 再次检查 (代码结构稍微调整以支持 reusedPage 的情况)
      const shouldLogin = !alreadyLoggedIn && (page.url().includes('/login') || page.url().includes('/auth') || page.url().includes('/sign-in') || page.url().includes('signin'));

      if (!shouldLogin) {
        // considering logged in
      } else {
        // ========== 未登录，执行登录流程 ==========
        this.log('info', '未登录，开始登录流程...', id);

        // 检查并处理 Cookie 同意对话框 (GDPR)
        try {
          const consentBtn = await page.$('.fc-cta-consent') ||
            await page.$('button.fc-button.fc-cta-consent') ||
            await page.$('[aria-label="Consent"]') ||
            await page.$('button:has-text("Accept")') ||
            await page.$('button:has-text("Consent")') ||
            await page.$('button:has-text("I agree")') ||
            await page.$('button:has-text("Accept all")');
          if (consentBtn) {
            this.log('info', '检测到 Cookie 同意对话框，点击同意...', id);
            await page.evaluate(btn => btn.click(), consentBtn);
            await this.delay(2000);
          }
        } catch (e) {
          // 忽略错误，可能没有同意对话框
        }

        // 尝试查找并填写登录表单
        this.log('info', '查找登录表单...', id);

        // 翼龙面板的登录表单 - 等待输入框出现
        // 尝试多种选择器
        const usernameSelectors = [
          'input[name="identifier"]',  // zampto.net
          'input[name="user"]',
          'input[name="username"]',
          'input[name="email"]',
          'input[type="email"]',
          'input[id="user"]',
          'input[id="username"]',
          'input[id="identifier"]',
          '#user',
          '#username',
          '#identifier',
          'input[placeholder*="email"]',
          'input[placeholder*="Email"]',
          'input[placeholder*="user"]',
          'input[placeholder*="User"]',
          'input[autocomplete*="username"]',
          'input[autocomplete*="email"]'
        ];

        const passwordSelectors = [
          'input[name="password"]',
          'input[type="password"]',
          'input[id="password"]',
          '#password'
        ];

        let usernameInput = null;
        let passwordInput = null;

        // 等待表单元素出现（最多等待 30 秒，Clerk 等 SPA 需要更长时间）
        for (let attempt = 0; attempt < 10; attempt++) {
          // 查找用户名输入框
          for (const selector of usernameSelectors) {
            try {
              usernameInput = await page.$(selector);
              if (usernameInput) {
                this.log('info', `找到用户名输入框: ${selector}`, id);
                break;
              }
            } catch (e) { }
          }

          // 查找密码输入框
          for (const selector of passwordSelectors) {
            try {
              passwordInput = await page.$(selector);
              if (passwordInput) {
                this.log('info', `找到密码输入框: ${selector}`, id);
                break;
              }
            } catch (e) { }
          }

          if (usernameInput && passwordInput) break;

          // 如果找到用户名但没找到密码，可能是 Clerk 的多步登录
          if (usernameInput && !passwordInput) {
            this.log('info', '找到用户名框但未找到密码框，可能是多步登录', id);
            break;
          }

          this.log('info', `等待表单加载... (${attempt + 1}/10)`, id);
          await this.delay(3000);
        }

        // 如果找不到表单，打印页面上所有的 input 元素用于调试
        if (!usernameInput) {
          const allInputs = await page.$$eval('input', inputs =>
            inputs.map(i => ({
              type: i.type,
              name: i.name,
              id: i.id,
              placeholder: i.placeholder,
              autocomplete: i.autocomplete
            }))
          );
          this.log('error', `页面上的 input 元素: ${JSON.stringify(allInputs)}`, id);

          const title = await page.title();
          this.log('error', `当前页面标题: ${title}`, id);
          throw new Error('找不到登录表单');
        }

        // 清空并填写表单 - 使用键盘输入方式确保 React 状态更新
        this.log('info', `填写登录信息... 用户名: ${panelUsername}`, id);

        // 先清空输入框，然后使用键盘输入
        await usernameInput.click({ clickCount: 3 }); // 选中所有文字
        await this.delay(100);
        await usernameInput.type(panelUsername, { delay: 50 });
        await this.delay(300);

        // 如果是多步登录（有用户名输入但没有密码输入），需要先点击 Continue
        if (!passwordInput) {
          this.log('info', '多步登录：点击继续按钮后等待密码框出现...', id);

          // 查找并点击 Continue/Next 按钮
          const continueSelectors = [
            'button[type="submit"]',
            'button[data-localization-key="formButtonPrimary"]',
            'button:has-text("Continue")',
            'button:has-text("continue")',
            'button:has-text("Next")',
            'button:has-text("继续")',
            'button:has-text("下一步")',
            '.cl-formButtonPrimary',
            'form button'
          ];

          let clickedContinue = false;
          for (const selector of continueSelectors) {
            try {
              const continueBtn = await page.$(selector);
              if (continueBtn) {
                await continueBtn.click();
                clickedContinue = true;
                this.log('info', `点击继续按钮: ${selector}`, id);
                break;
              }
            } catch (e) { }
          }

          if (!clickedContinue) {
            // 尝试按回车
            await page.keyboard.press('Enter');
            this.log('info', '尝试按回车继续', id);
          }

          // 等待密码框出现
          this.log('info', '等待密码输入框出现...', id);
          for (let i = 0; i < 10; i++) {
            await this.delay(2000);

            for (const selector of passwordSelectors) {
              try {
                passwordInput = await page.$(selector);
                if (passwordInput) {
                  this.log('info', `找到密码输入框: ${selector}`, id);
                  break;
                }
              } catch (e) { }
            }

            if (passwordInput) break;
            this.log('info', `等待密码框... (${i + 1}/10)`, id);
          }

          if (!passwordInput) {
            // 打印当前页面的 input 元素用于调试
            const allInputs = await page.$$eval('input', inputs =>
              inputs.map(i => ({
                type: i.type,
                name: i.name,
                id: i.id,
                placeholder: i.placeholder
              }))
            );
            this.log('error', `未找到密码框，页面 input 元素: ${JSON.stringify(allInputs)}`, id);
            throw new Error('多步登录失败：未找到密码输入框');
          }
        }

        // 填写密码 - 使用键盘输入方式确保 React 状态更新
        this.log('info', '填写密码...', id);
        await this.delay(300);
        await passwordInput.click({ clickCount: 3 }); // 选中所有文字
        await this.delay(100);
        await passwordInput.type(panelPassword, { delay: 50 });
        await this.delay(500);

        // 查找并点击登录按钮
        this.log('info', '查找登录按钮...', id);
        const submitSelectors = [
          'button[type="submit"]',
          'button[data-localization-key="formButtonPrimary"]',
          'input[type="submit"]',
          '.cl-formButtonPrimary',
          '.login-button',
          '#login-button',
          'form button'
        ];

        let submitBtn = null;
        for (const selector of submitSelectors) {
          try {
            submitBtn = await page.$(selector);
            if (submitBtn) {
              const btnText = await page.evaluate(el => el.textContent || '', submitBtn);
              this.log('info', `找到登录按钮: ${selector} (${btnText.trim()})`, id);
              break;
            }
          } catch (e) { }
        }

        if (submitBtn) {
          // 检查是否有 reCAPTCHA
          const hasRecaptcha = await page.evaluate(() => {
            return !!(
              document.querySelector('.g-recaptcha') ||
              document.querySelector('[data-sitekey]') ||
              document.querySelector('iframe[src*="recaptcha"]') ||
              window.grecaptcha
            );
          });

          if (hasRecaptcha) {
            this.log('info', '检测到 reCAPTCHA，等待验证...', id);
            // 等待 reCAPTCHA v3 自动评分或 invisible reCAPTCHA 加载
            await this.delay(3000);

            // 尝试执行 reCAPTCHA（如果是 v3 或 invisible）
            try {
              await page.evaluate(() => {
                if (window.grecaptcha && window.grecaptcha.execute) {
                  // 尝试获取 sitekey
                  const recaptchaEl = document.querySelector('[data-sitekey]');
                  if (recaptchaEl) {
                    const sitekey = recaptchaEl.getAttribute('data-sitekey');
                    window.grecaptcha.execute(sitekey);
                  } else {
                    window.grecaptcha.execute();
                  }
                }
              });
              this.log('info', '尝试执行 reCAPTCHA...', id);
              await this.delay(3000);
            } catch (e) {
              // 忽略错误
            }
          }

          // 使用多种方式尝试提交表单
          this.log('info', '点击登录按钮', id);

          // 方式1: 直接点击按钮
          await submitBtn.click();
          await this.delay(3000);

          // 检查是否还在登录页
          let currentLoginUrl = page.url();
          if (currentLoginUrl.includes('/auth/login') || currentLoginUrl.includes('/login')) {
            // 可能 reCAPTCHA 验证中，多等待一些
            if (hasRecaptcha) {
              this.log('info', '等待 reCAPTCHA 验证完成...', id);
              await this.delay(5000);
              currentLoginUrl = page.url();
            }

            if (currentLoginUrl.includes('/auth/login') || currentLoginUrl.includes('/login')) {
              this.log('info', '尝试提交表单...', id);
              // 方式2: 尝试提交表单
              try {
                await page.evaluate(() => {
                  const form = document.querySelector('form');
                  if (form) form.submit();
                });
              } catch (e) {
                // 忽略，可能表单已提交
              }
              await this.delay(2000);

              // 方式3: 使用键盘按回车
              currentLoginUrl = page.url();
              if (currentLoginUrl.includes('/auth/login') || currentLoginUrl.includes('/login')) {
                this.log('info', '尝试按回车提交...', id);
                await page.keyboard.press('Enter');
              }
            }
          }
        } else {
          // 尝试按回车提交
          this.log('info', '未找到登录按钮，尝试按回车提交', id);
          await page.keyboard.press('Enter');
        }

        // 等待登录完成
        this.log('info', '等待登录完成...', id);
        await this.delay(5000);

        // 等待页面跳转或登录完成
        try {
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
        } catch (e) {
          // 可能已经在目标页面了
          this.log('info', '导航超时，检查当前页面...', id);
        }

        // 再等待一下确保登录完成
        await this.delay(2000);

        // 检查登录是否成功
        let currentUrl = page.url();
        this.log('info', `登录后页面: ${currentUrl}`, id);

        // 如果还在登录页，可能登录失败，再等待一下
        if (currentUrl.includes('/auth/login') || currentUrl.includes('/login') || currentUrl.includes('/sign-in')) {
          this.log('info', '仍在登录页，等待跳转...', id);
          await this.delay(5000);
          currentUrl = page.url();
          this.log('info', `等待后页面: ${currentUrl}`, id);

          if (currentUrl.includes('/auth/login') || currentUrl.includes('/login') || currentUrl.includes('/sign-in')) {
            const currentContent = await page.content();
            const hasError = currentContent.includes('Invalid') ||
              currentContent.includes('incorrect') ||
              currentContent.includes('wrong') ||
              currentContent.includes('credentials') ||
              currentContent.includes('These credentials do not match');
            if (hasError) {
              this.log('error', '检测到登录错误信息', id);
              throw new Error('登录失败：账号或密码错误');
            }
            // 尝试查看页面上有什么
            const pageTitle = await page.title();
            this.log('warning', `登录后仍在登录页面，页面标题: ${pageTitle}`, id);
          }
        }
      } // 结束 if (!alreadyLoggedIn) 登录流程

      // ========== 续期部分 ==========

      // 导航到续期页面（url 是服务器页面 URL）
      this.log('info', `导航到续期页面: ${url}`, id);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

      // 等待页面加载，检查 Cloudflare 5秒盾
      await this.delay(3000);
      let renewPageContent = await page.content();
      let cfWaitCount = 0;
      while ((renewPageContent.includes('checking your browser') || renewPageContent.includes('Just a moment')) && cfWaitCount < 15) {
        this.log('info', '等待续期页面 Cloudflare 验证...', id);
        await this.delay(2000);
        renewPageContent = await page.content();
        cfWaitCount++;
      }

      // 再等待页面渲染完成
      await this.delay(2000);

      // 检查并处理续期页面的 Cookie 同意对话框 (GDPR)
      try {
        const consentBtn = await page.$('.fc-cta-consent') ||
          await page.$('button.fc-button.fc-cta-consent') ||
          await page.$('[aria-label="Consent"]');
        if (consentBtn) {
          this.log('info', '检测到续期页面 Cookie 同意对话框，点击同意...', id);
          await page.evaluate(btn => btn.click(), consentBtn);
          await this.delay(2000);
        }
      } catch (e) {
        // 忽略错误
      }

      // 查找续期按钮
      this.log('info', '查找续期按钮...', id);

      // 等待页面完全加载
      await this.delay(3000);

      // 滚动页面，确保所有元素都加载
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await this.delay(2000);
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await this.delay(1000);

      let renewButton = null;

      // 如果指定了选择器，优先使用
      if (renewButtonSelector) {
        try {
          renewButton = await page.$(renewButtonSelector);
          if (renewButton) {
            this.log('info', `找到指定的续期按钮: ${renewButtonSelector}`, id);
          }
        } catch (e) { }
      }

      // 自动查找续期按钮
      if (!renewButton) {
        // 先尝试通过 onclick 属性查找包含 renewal/renew 的元素
        try {
          const renewalByOnclick = await page.$('a[onclick*="Renewal"], a[onclick*="renewal"], a[onclick*="Renew"], a[onclick*="renew"], button[onclick*="Renewal"], button[onclick*="renewal"]');
          if (renewalByOnclick) {
            renewButton = renewalByOnclick;
            this.log('info', '通过 onclick 属性找到续期按钮', id);
          }
        } catch (e) { }

        // 尝试通过 class 查找
        if (!renewButton) {
          try {
            const renewalByClass = await page.$('.action-button.action-purple, .renew-button, .renewal-button, [class*="renew"]');
            if (renewalByClass) {
              renewButton = renewalByClass;
              this.log('info', '通过 class 找到续期按钮', id);
            }
          } catch (e) { }
        }

        // 通过文字内容查找
        if (!renewButton) {
          const buttonSelectors = [
            // 包含特定文字的按钮和链接
            'button',
            'a',  // 所有链接
            'a.btn',
            '[role="button"]',
            'input[type="submit"]',
            'input[type="button"]',
            'div[onclick]',
            'span[onclick]'
          ];

          const renewKeywords = ['Renew Server', 'renew server', 'RENEW SERVER', 'renew', 'Renew', 'RENEW', '续期', '续订', '延长', 'extend', 'Extend'];

          for (const selector of buttonSelectors) {
            try {
              const buttons = await page.$$(selector);
              for (const btn of buttons) {
                const text = await page.evaluate(el => el.textContent || el.value || '', btn);
                for (const keyword of renewKeywords) {
                  if (text.includes(keyword)) {
                    renewButton = btn;
                    this.log('info', `找到续期按钮 (包含 "${keyword}"): ${text.trim().substring(0, 50)}`, id);
                    break;
                  }
                }
                if (renewButton) break;
              }
              if (renewButton) break;
            } catch (e) { }
          }
        }
      }

      if (!renewButton) {
        // 打印页面上所有按钮和链接用于调试
        const allButtons = await page.$$eval('button, a, [role="button"], [onclick]', buttons =>
          buttons.map(b => ({
            tag: b.tagName,
            text: (b.textContent || '').trim().substring(0, 50),
            class: b.className,
            onclick: b.getAttribute('onclick') ? b.getAttribute('onclick').substring(0, 50) : null,
            href: b.getAttribute('href')
          })).filter(b => b.text || b.onclick)
        );
        this.log('error', `未找到续期按钮，页面元素: ${JSON.stringify(allButtons.slice(0, 15))}`, id);
        throw new Error('找不到续期按钮');
      }

      // 点击按钮
      try {
        this.log('info', '正在点击续期按钮...', id);
        // 尝试多种方式点击
        await page.evaluate((selector) => {
          const btn = document.querySelector(selector);
          if (btn) btn.click();
        }, renewButtonSelector || 'button.btn-primary');

        // 等待操作结果 (根据用户反馈，先等待再检测 Turnstile)
        const waitTime = parseInt(clickWaitTime) || 5000;
        this.log('info', `点击后等待 ${waitTime}ms...`, id);
        await this.delay(waitTime);

        // 处理可能的 Turnstile 验证
        await this.handleTurnstile(page, id);

        // [新增] 严格的完成状态检查
        // 循环检查 "Renew Server" 弹窗或 "正在验证" 是否还在
        let waitResultCount = 0;
        const maxResultWait = 20; // 最多再等 40 秒 (20 * 2000ms)

        while (waitResultCount < maxResultWait) {
          const content = await page.content();
          // 检查是否存在未完成的验证弹窗
          const isVerifying = content.includes('Renew Server') ||
            content.includes('正在验证') ||
            content.includes('checking your browser') ||
            content.includes('Just a moment');

          if (!isVerifying) {
            this.log('info', '验证弹窗已消失，继续检查结果...', id);
            break;
          }

          this.log('info', `等待验证完成... (${waitResultCount + 1}/${maxResultWait})`, id);

          // 在等待期间，再次尝试检测 Turnstile (万一它后来才加载出来)
          await this.handleTurnstile(page, id);

          await this.delay(2000);
          waitResultCount++;
        }

        if (waitResultCount >= maxResultWait) {
          this.log('warning', '验证超时：弹窗长时间未消失，标记为失败', id);
          throw new Error('验证超时：Renew Server 弹窗未消失');
        }
      } catch (e) {
        this.log('warning', `点击按钮时出错: ${e.message}`, id);
      }

      // 检查是否遇到 CF 验证
      let afterClickContent = await page.content();

      // 尝试处理 Turnstile 验证
      await this.handleCloudflareChallenge(page, id);

      let clickCfWait = 0;
      while ((afterClickContent.includes('checking your browser') || afterClickContent.includes('Just a moment')) && clickCfWait < 15) {
        this.log('info', '续期请求遇到 Cloudflare 验证，等待中...', id);

        // 循环中也尝试处理验证
        await this.handleCloudflareChallenge(page, id);

        await this.delay(2000);
        afterClickContent = await page.content();
        clickCfWait++;
      }

      // CF 验证通过后，需要重新点击续期按钮
      if (clickCfWait > 0) {
        this.log('info', 'Cloudflare 验证通过，重新查找续期按钮...', id);
        await this.delay(3000);

        // 重新查找续期按钮
        let renewButtonAgain = null;
        for (const selector of buttonSelectors) {
          try {
            const buttons = await page.$$(selector);
            for (const btn of buttons) {
              const text = await page.evaluate(el => el.textContent || el.value || '', btn);
              for (const keyword of renewKeywords) {
                if (text.includes(keyword)) {
                  renewButtonAgain = btn;
                  this.log('info', `重新找到续期按钮: ${text.trim().substring(0, 50)}`, id);
                  break;
                }
              }
              if (renewButtonAgain) break;
            }
            if (renewButtonAgain) break;
          } catch (e) { }
        }

        if (renewButtonAgain) {
          this.log('info', '再次点击续期按钮...', id);
          await renewButtonAgain.click();
          await this.delay(5000);
        } else {
          this.log('warning', 'CF验证后未找到续期按钮，可能已经续期成功', id);
        }
      }

      // 检查是否有确认对话框
      try {
        const confirmBtn = await page.$('button:has-text("Confirm")') ||
          await page.$('button:has-text("确认")') ||
          await page.$('button:has-text("OK")') ||
          await page.$('.modal button[type="submit"]') ||
          await page.$('.dialog button[type="submit"]');
        if (confirmBtn) {
          this.log('info', '点击确认按钮...', id);
          await confirmBtn.click();
          await this.delay(3000);
        }
      } catch (e) { }

      // 等待操作完成
      await this.delay(2000);

      // 检查结果
      // 检查结果 - 使用 visible text 而不是 HTML source，避免匹配到 class="btn-success" 等
      const bodyText = await page.evaluate(() => document.body.innerText);
      const lowerText = bodyText.toLowerCase();

      const finalUrl = page.url();
      this.log('info', `续期后页面 URL: ${finalUrl}`, id);

      // 成功判定：检查可见文本中的关键词
      // [修正] 移除 'renewed' 这种容易误判的通用词 (如 "Last renewed at...")
      // 只保留明确的成功提示词
      const successKeywords = ['server renewed', 'successfully renewed', 'success', '成功', '已续期', '已延长'];
      const errorKeywords = ['failed', 'error', '失败', '错误', 'wrong', 'incorrect'];

      // 检查是否有明确的成功提示元素 (Alerts, Toasts)
      const hasSuccessElement = await page.evaluate(() => {
        const successSelectors = [
          '.alert-success',
          '.toast-success',
          '.text-success',
          '[class*="success"]', // 宽泛匹配 class 包含 success 的可见元素
          '.swal2-success' // SweetAlert2
        ];

        for (const selector of successSelectors) {
          const els = document.querySelectorAll(selector);
          for (const el of els) {
            // 必须是可见的，并且包含相关文字
            if (el.offsetParent !== null && (el.innerText.toLowerCase().includes('success') || el.innerText.includes('成功'))) {
              return true;
            }
          }
        }
        return false;
      });

      let success = hasSuccessElement;

      // 如果没有找到明确的元素，检查文本
      if (!success) {
        // [修正] 只有当没有发生点击错误时，才尝试宽泛文本匹配
        // 如果刚才的 try-catch 捕获了错误 (如超时)，则不应依赖文本猜测
        if (!clickError) {
          success = successKeywords.some(kw => lowerText.includes(kw.toLowerCase()));
        }
      }

      const hasError = errorKeywords.some(kw => lowerText.includes(kw.toLowerCase()));

      // 二次确认：如果有 error 关键字，即使有 success 也认为是失败
      if (hasError) {
        success = false;
        this.log('warning', '检测到错误关键词，标记为失败', id);
      }

      // [新增] 如果点击过程报错(如超时)且没有明确的成功元素显示，强制判负
      if (clickError && !hasSuccessElement) {
        success = false;
        this.log('warning', `点击过程异常 (${clickError.message})，且未检测到成功元素，标记为失败`, id);
      }

      const result = {
        success: !hasError && success, // 只有 success 为 true 且 no error 才是 true
        message: success ? '续期成功' : (hasError ? '续期可能失败' : '已点击续期按钮'),
        response: success ? '检测到成功提示' : (hasError ? '检测到错误提示' : '已执行点击操作'),
        timestamp: new Date().toISOString()
      };

      if (success) {
        this.log('success', '续期成功', id);

        // 截图保存证据
        try {
          if (!fs.existsSync(SCREENSHOT_DIR)) {
            fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
          }
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const screenshotPath = path.join(SCREENSHOT_DIR, `success-${id}-${timestamp}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: true });
          this.log('info', `已保存成功截图: ${screenshotPath}`, id);

          // 将截图路径添加到结果中，以便前端可能显示 (可选)
          const screenshotFilename = path.basename(screenshotPath);
          result.screenshotUrl = `/api/screenshots/${screenshotFilename}`;

          this.log('info', `截图已就绪: ${result.screenshotUrl}`, id);
        } catch (e) {
          this.log('warning', `保存截图失败: ${e.message}`, id);
        }

        // 成功后保存最新的 Cookie
        try {
          const currentCookies = await page.cookies();
          if (currentCookies && currentCookies.length > 0) {
            this.cookies.set(id, currentCookies);
            this.saveCookiesToDisk();
            this.log('info', '已更新并保存 Cookie', id);
          }
        } catch (e) {
          this.log('warning', `保存 Cookie 失败: ${e.message}`, id);
        }

      } else if (hasError) {
        this.log('error', '续期可能失败，检测到错误提示', id);
      } else {
        this.log('info', '已点击续期按钮，未检测到明确结果', id);

        // 即使未检测到明确成功，只要没有报错，我们也尝试保存 Cookie (可能是已登录状态)
        try {
          const currentCookies = await page.cookies();
          this.cookies.set(id, currentCookies);
          this.saveCookiesToDisk();
        } catch (e) { }
      }
      return result;

    } catch (error) {
      this.log('error', `浏览器点击续期失败: ${error.message}`, id);
      return {
        success: false,
        error: error.message,
        message: `浏览器点击续期失败: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    } finally {
      // 策略：
      // 1. 如果是 AFK 模式，且不强制关闭浏览器 -> 保留 Page，不关闭 Browser
      // 2. 如果强制关闭浏览器 -> 关闭 Page，关闭 Browser (即使是 AFK)
      // 3. 普通模式 -> 关闭 Page，如果不强制关闭浏览器，保留 Browser (为了复用)

      // 注意：isProxyBrowser 为 true 时，通常每个续期都是独立浏览器实例
      // 如果 !afkMode，我们通常关闭 page

      const shouldKeepPage = afkMode && !closeBrowser;

      if (!shouldKeepPage) {
        try {
          if (!page.isClosed()) await page.close();
        } catch (e) { }
        this.pages.delete(id); // 从 map 中移除
      } else {
        this.log('info', '挂机模式生效：保留页面不关闭', id);
      }

      // 处理浏览器实例关闭
      if (isProxyBrowser) {
        // 如果是代理浏览器，且不保留页面，或者强制关闭
        if (!shouldKeepPage || closeBrowser) {
          try { await browser.close(); } catch (e) { }
        }
      } else {
        // 共享浏览器实例
        if (closeBrowser) {
          // 强制关闭共享浏览器? 
          // 如果这是全局配置的话，但 closeBrowser 是 per-renewal 配置
          // 对于共享浏览器，closeBrowser=true 可能意味着 "本次任务结束后关闭共享浏览器" 
          // 但这会影响其他任务。暂定：共享浏览器仅在 cleanup 时关闭，或者
          // 这里我们只关闭 page。如果 closeBrowser=true 且是共享浏览器，我们可能不应该关闭整个 browser，除非没有其他页面了

          // 暂时：共享浏览器不在此处关闭 browser，只关闭 page。
        }
      }
    }
  }

  /**
   * 处理 Cloudflare Turnstile 验证
   * 策略：查找 iframe -> 计算坐标 -> 模拟鼠标真实点击
   */
  async handleTurnstile(page, id) {
    try {
      this.log('info', '检查是否存在 Turnstile 验证...', id);

      // 等待 iframe 出现，最多等待 5 秒
      const iframeSelector = 'iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]';
      try {
        await page.waitForSelector(iframeSelector, { visible: true, timeout: 5000 });
      } catch (e) {
        this.log('info', '未检测到显式 Turnstile 验证框，继续...', id);
        return; // 没找到就直接返回
      }

      this.log('info', '检测到 Turnstile 验证框，尝试自动点击...', id);

      // 获取 iframe 元素
      const iframeElement = await page.$(iframeSelector);
      if (!iframeElement) return;

      // 获取 iframe 的位置和大小
      const boundingBox = await iframeElement.boundingBox();
      if (!boundingBox) {
        this.log('warning', '无法获取 Turnstile 验证框位置', id);
        return;
      }

      // 计算中心点坐标
      const x = boundingBox.x + boundingBox.width / 2;
      const y = boundingBox.y + boundingBox.height / 2;

      this.log('info', `Turnstile 验证框位置: (${Math.round(x)}, ${Math.round(y)})，准备点击...`, id);

      // 模拟人类鼠标移动和点击
      try {
        await page.mouse.move(x, y, { steps: 10 }); // 平滑移动
        await this.delay(100 + Math.random() * 200);
        await page.mouse.down();
        await this.delay(50 + Math.random() * 100);
        await page.mouse.up();

        this.log('info', '点击动作已完成，等待验证结果...', id);

        // 点击后等待一段时间，让验证生效
        await this.delay(3000);
      } catch (clickError) {
        this.log('warning', `模拟点击 Turnstile 失败: ${clickError.message}`, id);
      }

    } catch (error) {
      this.log('warning', `处理 Turnstile 验证时出错: ${error.message}`, id);
    }
  }

  /**
   * 执行续期请求
   */
  async executeRenewal(id, retryWithLogin = true) {
    const renewal = this.getRenewal(id);
    if (!renewal) {
      this.log('error', `续期配置不存在`, id);
      return { success: false, error: '配置不存在' };
    }

    if (!renewal.url) {
      this.log('error', `续期URL未配置`, id);
      return { success: false, error: 'URL未配置' };
    }

    // 获取续期模式（兼容旧配置）
    const mode = renewal.mode ||
      (renewal.useBrowserClick && renewal.autoLogin ? 'browserClick' :
        renewal.autoLogin ? 'autoLoginHttp' : 'http');

    // 模式1: 浏览器自动点击
    if (mode === 'browserClick') {
      this.log('info', '使用浏览器自动点击模式...', id);
      const result = await this.browserClickRenew(renewal);
      this.updateRenewalResult(id, result);
      this.broadcast('renewalResult', { id, result });
      return result;
    }

    // 模式2 和 模式3: HTTP 请求（区别在于是否自动登录获取 Cookie）
    const useProxy = renewal.useProxy && renewal.proxyUrl;
    const renewUrl = renewal.url;
    const targetUrl = useProxy ? renewal.proxyUrl : renewUrl;

    // 模式2: 自动登录获取 Cookie
    let cookieString = null;
    if (mode === 'autoLoginHttp') {
      cookieString = this.getCachedCookieString(id);
      if (!cookieString && retryWithLogin) {
        try {
          this.log('info', '没有缓存的 Cookie，尝试自动登录...', id);
          cookieString = await this.autoLoginAndGetCookies(renewal);
        } catch (error) {
          this.log('error', `自动登录失败: ${error.message}`, id);
        }
      }
    }

    const modeLabel = mode === 'autoLoginHttp' ? '自动登录' : 'HTTP';
    this.log('info', `执行续期请求: ${renewal.method} ${renewUrl}${useProxy ? ' (通过CF代理)' : ''} [${modeLabel}]`, id);

    try {
      const requestHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        ...renewal.headers
      };

      // 如果有自动登录获取的 Cookie，使用它替换或添加到 headers
      if (cookieString && mode === 'autoLoginHttp') {
        requestHeaders['Cookie'] = cookieString;
        // 添加 XSRF-TOKEN 到请求头（翼龙面板需要）
        const xsrfToken = this.getXsrfToken(id);
        if (xsrfToken) {
          requestHeaders['X-XSRF-TOKEN'] = xsrfToken;
          this.log('info', '已添加 X-XSRF-TOKEN 请求头', id);
        }
      }

      // 如果使用代理，添加代理所需的头信息
      if (useProxy) {
        requestHeaders['X-Target-URL'] = renewal.url;
        requestHeaders['X-Target-Method'] = renewal.method;
        // 将实际的请求头（包括 Cookie 和 XSRF-TOKEN）传给代理
        const headersForProxy = { ...renewal.headers };
        if (cookieString && mode === 'autoLoginHttp') {
          headersForProxy['Cookie'] = cookieString;
          const xsrfToken = this.getXsrfToken(id);
          if (xsrfToken) {
            headersForProxy['X-XSRF-TOKEN'] = xsrfToken;
          }
        }
        requestHeaders['X-Target-Headers'] = JSON.stringify(headersForProxy);
      }

      const options = {
        method: useProxy ? 'POST' : renewal.method,
        headers: requestHeaders
      };

      // POST 请求带 body
      if (renewal.method === 'POST' && renewal.body) {
        options.body = renewal.body;
        if (!options.headers['Content-Type']) {
          options.headers['Content-Type'] = 'application/json';
        }
      }

      const response = await fetch(targetUrl, options);
      const status = response.status;
      let responseText = '';

      try {
        responseText = await response.text();
        // 截断过长的响应
        if (responseText.length > 500) {
          responseText = responseText.substring(0, 500) + '...';
        }
      } catch (e) {
        responseText = '[无法读取响应]';
      }

      // 检查是否需要重新登录 (401/403 或者响应包含登录页面特征)
      const needReLogin = (status === 401 || status === 403) ||
        responseText.includes('login') ||
        responseText.includes('sign-in') ||
        responseText.includes('Sign in') ||
        responseText.includes('unauthorized') ||
        responseText.includes('unauthenticated') ||
        responseText.includes('Please sign in');

      if (needReLogin && mode === 'autoLoginHttp' && retryWithLogin) {
        this.log('info', `Cookie 可能已过期 (状态码: ${status})，尝试重新登录...`, id);
        // 清除旧的 Cookie 缓存
        this.cookies.delete(id);
        // 重新登录并执行
        return this.executeRenewal(id, false); // 设置 retryWithLogin=false 防止无限循环
      }

      const result = {
        success: response.ok,
        status,
        message: response.ok ? '续期成功' : `续期失败 (${status})`,
        response: responseText,
        timestamp: new Date().toISOString()
      };

      // 更新最后执行结果
      this.updateRenewalResult(id, result);

      if (response.ok) {
        this.log('success', `续期成功 (状态码: ${status})`, id);
      } else {
        this.log('error', `续期失败 (状态码: ${status})`, id);
      }

      this.broadcast('renewalResult', { id, result });
      return result;

    } catch (error) {
      const result = {
        success: false,
        error: error.message,
        message: `请求失败: ${error.message}`,
        timestamp: new Date().toISOString()
      };

      this.updateRenewalResult(id, result);
      this.log('error', `续期请求失败: ${error.message}`, id);

      this.broadcast('renewalResult', { id, result });
      return result;
    }
  }

  /**
   * 更新续期执行结果
   */
  updateRenewalResult(id, result) {
    const config = this.configManager.getFullConfig();
    const renewal = config.renewals?.find(r => r.id === id);

    if (renewal) {
      renewal.lastRun = new Date().toISOString();
      renewal.lastResult = result;
      this.configManager.updateConfig(config);
    }
  }

  /**
   * 手动测试续期
   */
  async testRenewal(id) {
    return this.executeRenewal(id);
  }

  /**
   * 测试代理连接
   * @param {string} proxyUrl - 代理地址，如 socks5://127.0.0.1:1080
   * @param {string} testUrl - 测试 URL，默认 https://httpbin.org/ip
   */
  async testProxy(proxyUrl, testUrl = 'https://httpbin.org/ip') {
    if (!proxyUrl) {
      return { success: false, error: '代理地址不能为空' };
    }

    this.log('info', `启动浏览器... ${proxyUrl ? '(使用代理)' : ''}`);

    let browser = null;
    let page = null;

    try {
      // 使用 getBrowser 启动
      browser = await this.getBrowser(proxyUrl);
      page = await browser.newPage();

      await page.setViewport({ width: 1280, height: 720 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      // 设置较短的超时
      await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      const content = await page.content();
      const bodyText = await page.evaluate(() => document.body.innerText);

      this.log('success', `代理测试成功: ${proxyUrl}`);

      return {
        success: true,
        message: '代理连接成功',
        response: bodyText.substring(0, 200),
        proxyUrl
      };
    } catch (error) {
      this.log('error', `代理测试失败: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: `代理连接失败: ${error.message}`,
        proxyUrl
      };
    } finally {
      if (page) await page.close();
      if (browser) await browser.close();
    }
  }

  /**
   * 获取续期状态
   */
  getStatus() {
    const renewals = this.getRenewals();
    return renewals.map(r => ({
      ...r,
      running: this.timers.has(r.id)
    }));
  }

  /**
   * 获取全局续期日志
   */
  getLogs() {
    return this.globalLogs.slice(-50);
  }

  /**
   * 获取单个续期的日志
   */
  getRenewalLogs(id) {
    const logs = this.logs.get(id);
    return logs ? logs.slice(-50) : [];
  }

  /**
   * 清除单个续期的日志
   */
  clearRenewalLogs(id) {
    this.logs.set(id, []);
  }

  /**
   * 格式化时间间隔
   */
  formatInterval(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);

    if (hours > 0 && minutes > 0) {
      return `${hours}小时${minutes}分钟`;
    } else if (hours > 0) {
      return `${hours}小时`;
    } else {
      return `${minutes}分钟`;
    }
  }

  /**
   * 停止所有续期
   */
  stopAll() {
    for (const [id] of this.timers) {
      this.stopRenewal(id);
    }
    // 关闭浏览器
    this.closeBrowser();
  }
}
