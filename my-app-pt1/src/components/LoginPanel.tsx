import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { apiFetch } from '../config/apiBase';
import { useAuth } from '../context/useAuth';
import { useT } from '../i18n/useI18n';
import dict from '../i18n/locales/login';

// 🔐 Sign-in / sign-up form, shown as a dialog on the home page (Home.tsx).
// The /login route renders Home with this dialog already open.
export default function LoginPanel({ redirectTo, onClose }: { redirectTo: string; onClose: () => void }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const t = useT(dict);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 使用 OAuth 彈窗授權流程（跟 likeexcelG.tsx 原本驗證過可用的方式一致），
  // 而非 Google 官方 "Sign In With Google" 按鈕元件 —— 兩者都要求
  // http://localhost 或 https:// 來源，純 IP + HTTP 環境下會被 Google 政策擋下
  // （Error 400: invalid_request）。現在 www.mygwsite.com 透過 Caddy 提供
  // HTTPS，所以走網域登入時 Google 登入就能用；email/password 表單保留作為
  // 不想用 Google 帳號時的備用登入方式。
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setError(null);
      try {
        const res = await apiFetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: tokenResponse.access_token }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || t('loginFailed'));
        }
        login(data.token, data.user);
        navigate(redirectTo, { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : t('loginFailed'));
      }
    },
    onError: () => setError(t('googleFailed')),
  });

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login' ? { email, password } : { email, password, name };
      const res = await apiFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || (mode === 'login' ? t('loginFailed') : t('registerFailed')));
      }
      login(data.token, data.user);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'border border-[#CFD6D5] rounded-lg px-3 py-2.5 text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#6BBBAE]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0E3B36]/50 backdrop-blur-sm px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        className="relative bg-white rounded-2xl shadow-2xl p-8 sm:p-10 flex flex-col items-center gap-5 w-full max-w-sm"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-4 text-2xl leading-none text-[#94A3B8] hover:text-[#1A1A1A]"
        >
          ×
        </button>
        <h2 id="login-title" className="text-2xl font-bold text-[#1A1A1A]">
          Webase<span className="text-[#1E6F64]">Cell</span>
        </h2>
        <p className="text-[#666666] text-sm text-center -mt-2">
          {mode === 'login' ? t('subtitleLogin') : t('subtitleRegister')}
        </p>

        <form onSubmit={handleEmailSubmit} className="w-full flex flex-col gap-3">
          {mode === 'register' && (
            <input
              type="text"
              placeholder={t('namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={inputClass}
            />
          )}
          <input
            type="email"
            placeholder={t('emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className={inputClass}
          />
          <input
            type="password"
            placeholder={t('passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={submitting}
            className="bg-[#1E6F64] hover:bg-[#0E3B36] disabled:opacity-60 text-white text-sm font-bold px-4 py-2.5 rounded-full transition-colors"
          >
            {submitting ? t('processing') : mode === 'login' ? t('login') : t('register')}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
          className="text-xs text-[#1E6F64] hover:text-[#0E3B36] -mt-2"
        >
          {mode === 'login' ? t('toRegister') : t('toLogin')}
        </button>

        <div className="w-full flex items-center gap-3 text-xs text-[#94A3B8]">
          <div className="flex-1 h-px bg-[#E5E7EB]" />
          {t('or')}
          <div className="flex-1 h-px bg-[#E5E7EB]" />
        </div>

        <button
          type="button"
          onClick={() => googleLogin()}
          className="w-full bg-white text-[#333333] text-sm font-medium px-4 py-2.5 rounded-full border border-[#CFD6D5] hover:bg-[#EEF0F0] transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.5 24c0-1.61-.15-3.16-.42-4.69H24v8.87h12.66c-.54 2.94-2.2 5.43-4.69 7.11l7.29 5.65C43.53 36.6 46.5 30.9 46.5 24z"/>
            <path fill="#FBBC05" d="M10.54 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.98-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.29-5.65c-2.02 1.35-4.61 2.16-8.6 2.16-6.26 0-11.57-4.22-13.46-10.42l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {t('googleLogin')}
        </button>

        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
      </div>
    </div>
  );
}
