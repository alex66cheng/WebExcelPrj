import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { apiFetch } from '../config/apiBase';
import { useAuth } from '../context/useAuth';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSuccess = async (credentialResponse: CredentialResponse) => {
    setError(null);
    const credential = credentialResponse.credential;
    if (!credential) {
      setError('Google 未回傳有效的登入憑證');
      return;
    }
    try {
      const res = await apiFetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
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
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-900">
      <div className="bg-white rounded-2xl shadow-xl p-10 flex flex-col items-center gap-6 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-slate-800">EXCEL.API</h1>
        <p className="text-slate-500 text-sm text-center">請使用 Google 帳號登入以繼續</p>
        <GoogleLogin
          onSuccess={handleSuccess}
          onError={() => setError('Google 登入失敗，請再試一次')}
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </div>
    </div>
  );
}
