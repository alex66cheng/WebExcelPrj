import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { apiFetch } from '../config/apiBase';
import { useAuth } from '../context/useAuth';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
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
          throw new Error(data.message || '登入失敗');
        }
        login(data.token, data.user);
        navigate('/dashboard', { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : '登入失敗');
      }
    },
    onError: () => setError('Google 登入失敗，請再試一次'),
  });

  if (user) return <Navigate to="/dashboard" replace />;

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
        throw new Error(data.message || (mode === 'login' ? '登入失敗' : '註冊失敗'));
      }
      login(data.token, data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-900">
      <div className="bg-white rounded-2xl shadow-xl p-10 flex flex-col items-center gap-6 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-slate-800">EXCEL.API</h1>
        <p className="text-slate-500 text-sm text-center">
          {mode === 'login' ? '請登入以繼續' : '建立新帳號'}
        </p>

        <form onSubmit={handleEmailSubmit} className="w-full flex flex-col gap-3">
          {mode === 'register' && (
            <input
              type="text"
              placeholder="姓名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="密碼（至少 8 個字元）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-bold px-4 py-2 rounded transition-all"
          >
            {submitting ? '處理中...' : mode === 'login' ? '登入' : '註冊'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
          className="text-xs text-slate-500 hover:text-slate-800 -mt-2"
        >
          {mode === 'login' ? '還沒有帳號？點此註冊' : '已經有帳號？點此登入'}
        </button>

        <div className="w-full flex items-center gap-3 text-xs text-slate-400">
          <div className="flex-1 h-px bg-slate-200" />
          或
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <button
          type="button"
          onClick={() => googleLogin()}
          className="bg-white text-slate-800 text-xs font-bold px-4 py-2 rounded shadow border border-slate-200 hover:bg-slate-100 transition-all flex items-center gap-2"
        >
          <svg className="w-4 h-4" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.5 24c0-1.61-.15-3.16-.42-4.69H24v8.87h12.66c-.54 2.94-2.2 5.43-4.69 7.11l7.29 5.65C43.53 36.6 46.5 30.9 46.5 24z"/>
            <path fill="#FBBC05" d="M10.54 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.98-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.29-5.65c-2.02 1.35-4.61 2.16-8.6 2.16-6.26 0-11.57-4.22-13.46-10.42l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Google 帳號登入
        </button>

        {error && <p className="text-red-500 text-sm">{error}</p>}
      </div>
    </div>
  );
}
