import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  username: string | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:3000';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing token
    const savedToken = localStorage.getItem('token');
    const savedUsername = localStorage.getItem('username');

    if (savedToken) {
      // Verify token
      fetch(`${API_BASE}/api/auth/check`, {
        headers: {
          'Authorization': `Bearer ${savedToken}`
        }
      })
        .then(res => res.json())
        .then(data => {
          if (data.authenticated) {
            setToken(savedToken);
            setUsername(savedUsername);
            setIsAuthenticated(true);
          } else {
            localStorage.removeItem('token');
            localStorage.removeItem('username');
          }
        })
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('username');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username: string, password: string) => {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '登录失败');
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('username', data.username);
    setToken(data.token);
    setUsername(data.username);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setToken(null);
    setUsername(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, username, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
