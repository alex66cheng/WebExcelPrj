import { createContext } from 'react';

export interface AuthUser {
  domain: string;
  username: string;
  // AD 'mail' attribute (falls back to the UPN) looked up by ADAuthAPI — this is
  // the user ID the file pool, invites, edit deadlines and per-user SQLite DBs
  // are keyed on, same as the Google email on the cloud build.
  email: string;
  name: string;     // AD display name, falls back to username
  picture?: string; // AD has no avatar URL; pages fall back to a placeholder
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
