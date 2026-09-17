import { useEffect, useState, type ReactNode } from 'react';
import { AD_AUTH_BASE } from '../config/adAuth';
import { setAuthToken } from '../config/apiBase';
import { AuthContext, type AuthUser } from './AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    fetch(`${AD_AUTH_BASE}/api/findAD`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.token) {
          setAuthToken(data.token);
          setUser({ domain: data.domain, username: data.username });
        } else {
          setAccessDenied(true);
        }
      })
      .catch(() => setAccessDenied(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, accessDenied }}>
      {children}
    </AuthContext.Provider>
  );
}
