import { createContext } from 'react';

export interface AuthUser {
  domain: string;
  username: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  // true once the initial /api/findAD resolution has completed and failed —
  // distinct from `loading` so ProtectedRoute can show "access denied"
  // instead of silently redirecting anywhere (there's no login page to send
  // people to on this build).
  accessDenied: boolean;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
