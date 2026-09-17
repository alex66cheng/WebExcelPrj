import { createContext } from 'react';

export interface AuthUser {
  email: string;
  name: string;
  picture?: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
