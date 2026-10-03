import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUDIT_LOG_FILE = path.join(__dirname, '../data/audit.log');

/**
 * 审计日志服务
 * 记录所有安全相关事件（登录、密码变更等）
 */
export class AuditService {
  constructor() {
    this.ensureAuditDir();
    this.cleanup();
    this.cleanupTimer = setInterval(() => this.cleanup(), 24 * 60 * 60 * 1000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  ensureAuditDir() {
    const dir = path.dirname(AUDIT_LOG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 记录审计日志
   * @param {string} event - 事件类型 (LOGIN_SUCCESS, LOGIN_FAILED, PASSWORD_CHANGED, etc)
   * @param {object} details - 事件详情
   */
  log(event, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      ...details
    };

    try {
      const logLine = JSON.stringify(entry) + '\n';
      fs.appendFileSync(AUDIT_LOG_FILE, logLine, 'utf-8');
      console.log(`📝 [Audit] ${event}: ${JSON.stringify(details)}`);
    } catch (err) {
      console.error('❌ Failed to write audit log:', err.message);
    }
  }

  /**
   * 登录成功
   */
  loginSuccess(username, ip = 'unknown') {
    this.log('LOGIN_SUCCESS', {
      username,
      ip,
      userAgent: process.env.USER_AGENT || 'unknown'
    });
  }

  /**
   * 登录失败
   */
  loginFailed(username, reason = 'invalid_credentials', ip = 'unknown') {
    this.log('LOGIN_FAILED', {
      username,
      reason,
      ip,
      userAgent: process.env.USER_AGENT || 'unknown'
    });
  }

  /**
   * 密码修改
   */
  passwordChanged(username, ip = 'unknown') {
    this.log('PASSWORD_CHANGED', {
      username,
      ip
    });
  }

  /**
   * 配置更新
   */
  configUpdated(field, username = 'system', ip = 'unknown') {
    this.log('CONFIG_UPDATED', {
      field,
      username,
      ip
    });
  }

  /**
   * API访问
   */
  apiAccess(username, method, path, statusCode = 200, ip = 'unknown') {
    // 只记录某些重要API调用
    const importantPaths = ['/api/auth/', '/api/settings', '/api/tools'];
    const isImportant = importantPaths.some(p => path.startsWith(p));

    if (isImportant) {
      this.log('API_ACCESS', {
        username,
        method,
        path,
        statusCode,
        ip
      });
    }
  }

  /**
   * 工具操作
   */
  toolOperation(tool, operation, username = 'system') {
    this.log('TOOL_OPERATION', {
      tool,
      operation,
      username
    });
  }

  /**
   * 获取最近的审计日志
   * @param {number} lines - 返回行数
   */
  getRecent(lines = 100) {
    try {
      if (!fs.existsSync(AUDIT_LOG_FILE)) {
        return [];
      }

      const content = fs.readFileSync(AUDIT_LOG_FILE, 'utf-8');
      const logLines = content.trim().split('\n').filter(l => l);

      return logLines
        .slice(Math.max(0, logLines.length - lines))
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            return null;
          }
        })
        .filter(entry => entry !== null);
    } catch (err) {
      console.error('Failed to read audit log:', err.message);
      return [];
    }
  }

  /**
   * 清理旧审计日志（仅保留最近N行）
   * @param {number} maxLines - 最大保留行数
   */
  cleanup(maxLines = 10000) {
    try {
      if (!fs.existsSync(AUDIT_LOG_FILE)) {
        return;
      }

      const content = fs.readFileSync(AUDIT_LOG_FILE, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);

      if (lines.length > maxLines) {
        const remaining = lines.slice(lines.length - maxLines);
        fs.writeFileSync(AUDIT_LOG_FILE, remaining.join('\n') + '\n', 'utf-8');
        console.log(`🧹 Audit log cleaned: removed ${lines.length - maxLines} old entries`);
      }
    } catch (err) {
      console.error('Failed to cleanup audit log:', err.message);
    }
  }
}

// 导出单例
export const auditService = new AuditService();
