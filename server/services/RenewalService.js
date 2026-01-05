/**
 * 自动续期服务
 * 用于自动续期翼龙面板等服务器托管商的服务器
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// 使用 stealth 插件绑过检测
puppeteer.use(StealthPlugin());

export class RenewalService {
  constructor(configManager, broadcast) {
    this.configManager = configManager;
    this.broadcast = broadcast;
    this.timers = new Map(); // id -> timer
    this.cookies = new Map(); // id -> cookies (缓存登录后的 cookies)
    this.browser = null; // 共享浏览器实例
    this.logs = [];
    this.maxLogs = 100;

    // 启动时加载已保存的续期配置
    this.loadSavedRenewals();
  }

  log(type, message, renewalId = null) {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const entry = {
      id: Date.now(),
      timestamp,
      type,
      message: renewalId ? `[${renewalId}] ${message}` : message,
      renewalId
    };

    console.log(`[${timestamp}] [续期] ${message}`);
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
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
    const renewal = {
      id,
      name: renewalConfig.name || '未命名续期',
      url: renewalConfig.url || '',
      method: renewalConfig.method || 'GET',
      headers: renewalConfig.headers || {},
      body: renewalConfig.body || '',
      interval: renewalConfig.interval || 21600000, // 默认6小时
      enabled: renewalConfig.enabled !== false,
      useProxy: renewalConfig.useProxy || false,
      proxyUrl: renewalConfig.proxyUrl || '',
      // 自动登录配置
      autoLogin: renewalConfig.autoLogin || false,
      loginUrl: renewalConfig.loginUrl || '',
      panelUsername: renewalConfig.panelUsername || '',
      panelPassword: renewalConfig.panelPassword || '',
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
      return true;
    }
    return false;
  }

  /**
   * 获取或启动浏览器实例
   */
  async getBrowser() {
    if (!this.browser || !this.browser.isConnected()) {
      this.log('info', '启动无头浏览器...');
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080'
        ]
      });
    }
    return this.browser;
  }

  /**
   * 关闭浏览器
   */
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.log('info', '关闭无头浏览器');
    }
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
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

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
          } catch (e) {}
        }

        // 查找密码输入框
        for (const selector of passwordSelectors) {
          try {
            passwordInput = await page.$(selector);
            if (passwordInput) {
              this.log('info', `找到密码输入框: ${selector}`, id);
              break;
            }
          } catch (e) {}
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

      // 清空并填写表单
      this.log('info', '填写登录信息...', id);
      await usernameInput.click({ clickCount: 3 });
      await this.delay(100);
      await usernameInput.type(panelUsername, { delay: 30 });

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
          } catch (e) {}
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
            } catch (e) {}
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

      // 填写密码
      await this.delay(500);
      await passwordInput.click({ clickCount: 3 });
      await this.delay(100);
      await passwordInput.type(panelPassword, { delay: 30 });

      // 查找并点击登录按钮
      this.log('info', '查找登录按钮...', id);
      const submitSelectors = [
        'button[type="submit"]',
        'button[data-localization-key="formButtonPrimary"]',
        'input[type="submit"]',
        '.cl-formButtonPrimary',
        'button:has-text("Sign in")',
        'button:has-text("Login")',
        'button:has-text("登录")',
        '.login-button',
        '#login-button',
        'form button'
      ];

      let submitted = false;
      for (const selector of submitSelectors) {
        try {
          const submitBtn = await page.$(selector);
          if (submitBtn) {
            await submitBtn.click();
            submitted = true;
            this.log('info', `点击登录按钮: ${selector}`, id);
            break;
          }
        } catch (e) {}
      }

      if (!submitted) {
        // 尝试按回车提交
        await page.keyboard.press('Enter');
        this.log('info', '尝试按回车提交', id);
      }

      // 等待登录完成
      this.log('info', '等待登录完成...', id);
      await this.delay(5000);

      // 等待页面跳转或登录完成
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (e) {
        // 可能已经在目标页面了
      }

      // 再等待一下确保 cookie 设置完成
      await this.delay(2000);

      // 检查是否登录成功（页面是否还在登录页）
      const currentUrl = page.url();
      const currentContent = await page.content();

      // 检查是否还在登录页
      const stillOnLoginPage = currentUrl.includes('/login') ||
                               currentUrl.includes('/auth') ||
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

      // 获取 Cookies
      const cookies = await page.cookies();

      if (cookies.length === 0) {
        throw new Error('登录后未获取到 Cookie');
      }

      // 检查是否包含关键 cookie
      const hasPterodactylSession = cookies.some(c => c.name === 'pterodactyl_session');
      const hasXsrfToken = cookies.some(c => c.name === 'XSRF-TOKEN');
      const hasCfClearance = cookies.some(c => c.name === 'cf_clearance');

      this.log('info', `获取到 ${cookies.length} 个 Cookie (session: ${hasPterodactylSession}, xsrf: ${hasXsrfToken}, cf: ${hasCfClearance})`, id);

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

    // 判断是否使用代理
    const useProxy = renewal.useProxy && renewal.proxyUrl;
    const targetUrl = useProxy ? renewal.proxyUrl : renewal.url;

    // 如果启用自动登录，尝试使用缓存的 Cookie
    let cookieString = null;
    if (renewal.autoLogin) {
      cookieString = this.getCachedCookieString(id);
      if (!cookieString && retryWithLogin) {
        // 没有缓存的 Cookie，先登录获取
        try {
          this.log('info', '没有缓存的 Cookie，尝试自动登录...', id);
          cookieString = await this.autoLoginAndGetCookies(renewal);
        } catch (error) {
          this.log('error', `自动登录失败: ${error.message}`, id);
        }
      }
    }

    this.log('info', `执行续期请求: ${renewal.method} ${renewal.url}${useProxy ? ' (通过CF代理)' : ''}${renewal.autoLogin ? ' (自动登录)' : ''}`, id);

    try {
      const requestHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        ...renewal.headers
      };

      // 如果有自动登录获取的 Cookie，使用它替换或添加到 headers
      if (cookieString && renewal.autoLogin) {
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
        if (cookieString && renewal.autoLogin) {
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
                         responseText.includes('unauthorized') ||
                         responseText.includes('unauthenticated');

      if (needReLogin && renewal.autoLogin && retryWithLogin) {
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
   * 获取续期日志
   */
  getLogs() {
    return this.logs.slice(-50);
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
