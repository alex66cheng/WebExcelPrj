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
          setUser({
            domain: data.domain,
            username: data.username,
            // 與 WebSideAPI 的 adUserFromToken 相同規則：舊版 ADAuthAPI 沒回傳 email 時退回 username@domain
            email: String(data.email || `${data.username}@${data.domain}`).toLowerCase(),
            name: data.displayName || data.username,
          });
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
