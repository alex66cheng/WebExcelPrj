import { useEffect, useState, type ReactNode } from 'react';
import { apiFetch, getAuthToken, setAuthToken } from '../config/apiBase';
import { AuthContext, type AuthUser } from './AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(() => !!getAuthToken());

  useEffect(() => {
    if (!getAuthToken()) return;
    apiFetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) throw new Error('session expired');
        return res.json();
      })
      .then((data) => setUser(data.user))
      .catch(() => setAuthToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = (token: string, loggedInUser: AuthUser) => {
    setAuthToken(token);
    setUser(loggedInUser);
  };

  const logout = () => {
    setAuthToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
