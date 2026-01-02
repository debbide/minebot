import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_EXPIRY = '24h';

export class AuthService {
  constructor(configManager) {
    this.configManager = configManager;
  }

  getDefaultCredentials() {
    return {
      username: 'admin',
      password: 'admin123'
    };
  }

  getCredentials() {
    const config = this.configManager.getFullConfig();
    return config.auth || this.getDefaultCredentials();
  }

  validateCredentials(username, password) {
    const creds = this.getCredentials();
    return username === creds.username && password === creds.password;
  }

  generateToken(username) {
    return jwt.sign(
      { username, iat: Date.now() },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return null;
    }
  }

  updateCredentials(username, password) {
    const config = this.configManager.getFullConfig();
    config.auth = { username, password };
    this.configManager.updateConfig(config);
  }

  // Middleware for protecting routes
  authMiddleware() {
    return (req, res, next) => {
      // Skip auth for login endpoint
      if (req.path === '/api/auth/login' || req.path === '/api/auth/check') {
        return next();
      }

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      const decoded = this.verifyToken(token);

      if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      req.user = decoded;
      next();
    };
  }
}
