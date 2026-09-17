import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { apiFetch } from '../config/apiBase';
import { useAuth } from '../context/useAuth';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  // 使用 OAuth 彈窗授權流程（跟 likeexcelG.tsx 原本驗證過可用的方式一致），
  // 而非 Google 官方 "Sign In With Google" 按鈕元件 —— 後者的 Google Identity
  // Services 只允許 http://localhost 或 https:// 來源，在測試機的公網 IP + HTTP
  // 環境下會直接被 Google 政策擋下。
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

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-900">
      <div className="bg-white rounded-2xl shadow-xl p-10 flex flex-col items-center gap-6 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-slate-800">EXCEL.API</h1>
        <p className="text-slate-500 text-sm text-center">請使用 Google 帳號登入以繼續</p>
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
