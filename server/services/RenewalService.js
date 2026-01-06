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
    this.logs = new Map(); // id -> logs[] (每个续期配置单独的日志)
    this.globalLogs = []; // 全局日志
    this.maxLogsPerRenewal = 50;
    this.maxGlobalLogs = 100;

    // 启动时加载已保存的续期配置
    this.loadSavedRenewals();
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
        } catch (e) {}
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
    const { id, url, renewPageUrl, renewButtonSelector, loginUrl, panelUsername, panelPassword } = renewal;

    if (!loginUrl || !panelUsername || !panelPassword) {
      throw new Error('浏览器点击续期需要配置登录URL、账号和密码');
    }

    this.log('info', '开始浏览器点击续期...', id);

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // 设置视口和 User-Agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

      // ========== 登录部分 - 复用 autoLoginAndGetCookies 的逻辑 ==========
      // 访问登录页面，等待 Cloudflare 5秒盾
      this.log('info', `访问登录页面: ${loginUrl}`, id);
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

      // 检查是否已经登录（浏览器可能保留了之前的登录状态）
      let currentUrl = page.url();
      const alreadyLoggedIn = !currentUrl.includes('/login') &&
                              !currentUrl.includes('/auth') &&
                              !currentUrl.includes('/sign-in') &&
                              !currentUrl.includes('signin');

      // 如果已登录，跳过登录流程，直接进入续期
      if (alreadyLoggedIn) {
        this.log('info', `检测到已登录状态，跳过登录步骤 (当前页面: ${currentUrl})`, id);
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
        } catch (e) {}
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

      // 导航到续期页面
      const targetUrl = renewPageUrl || url;

      this.log('info', `导航到续期页面: ${targetUrl}`, id);
      await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

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

      // 检查是否通过 URL 参数直接续期成功（如 zampto.net 的 renew=true）
      renewPageContent = await page.content();
      const renewedByUrl = renewPageContent.includes('renewed') ||
                          renewPageContent.includes('Renewed') ||
                          renewPageContent.includes('successfully') ||
                          renewPageContent.includes('Success') ||
                          renewPageContent.includes('extended') ||
                          renewPageContent.includes('Server renewal successful');

      if (renewedByUrl) {
        this.log('success', '通过 URL 参数续期成功', id);
        return {
          success: true,
          message: '续期成功（通过URL参数）',
          response: '检测到成功提示',
          timestamp: new Date().toISOString()
        };
      }

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
        } catch (e) {}
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
        } catch (e) {}

        // 尝试通过 class 查找
        if (!renewButton) {
          try {
            const renewalByClass = await page.$('.action-button.action-purple, .renew-button, .renewal-button, [class*="renew"]');
            if (renewalByClass) {
              renewButton = renewalByClass;
              this.log('info', '通过 class 找到续期按钮', id);
            }
          } catch (e) {}
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
            } catch (e) {}
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

      // 点击续期按钮
      this.log('info', '点击续期按钮...', id);
      await renewButton.click();

      // 等待续期请求完成，可能会有 CF 5秒盾
      this.log('info', '等待续期请求完成...', id);
      await this.delay(5000);

      // 检查是否遇到 CF 验证
      let afterClickContent = await page.content();
      let clickCfWait = 0;
      while ((afterClickContent.includes('checking your browser') || afterClickContent.includes('Just a moment')) && clickCfWait < 15) {
        this.log('info', '续期请求遇到 Cloudflare 验证，等待中...', id);
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
          } catch (e) {}
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
      } catch (e) {}

      // 等待操作完成
      await this.delay(2000);

      // 检查结果
      const finalContent = await page.content();
      const finalUrl = page.url();
      this.log('info', `续期后页面: ${finalUrl}`, id);

      const success = finalContent.includes('success') ||
                     finalContent.includes('Success') ||
                     finalContent.includes('成功') ||
                     finalContent.includes('renewed') ||
                     finalContent.includes('Renewed') ||
                     finalContent.includes('extended') ||
                     finalContent.includes('Extended');

      const hasError = finalContent.includes('error') ||
                      finalContent.includes('Error') ||
                      finalContent.includes('failed') ||
                      finalContent.includes('Failed') ||
                      finalContent.includes('失败');

      const result = {
        success: !hasError,
        message: success ? '续期成功' : (hasError ? '续期可能失败' : '已点击续期按钮'),
        response: success ? '检测到成功提示' : (hasError ? '检测到错误提示' : '已执行点击操作'),
        timestamp: new Date().toISOString()
      };

      if (success) {
        this.log('success', '续期成功', id);
      } else if (hasError) {
        this.log('error', '续期可能失败，检测到错误提示', id);
      } else {
        this.log('info', '已点击续期按钮，未检测到明确结果', id);
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
      await page.close();
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
