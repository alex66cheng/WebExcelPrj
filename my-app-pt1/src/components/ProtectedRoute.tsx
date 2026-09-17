import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export default function ProtectedRoute() {
  const { user, loading, accessDenied } = useAuth();

  if (loading) return null;

  if (accessDenied || !user) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-900 text-white">
        <div className="max-w-md text-center px-6">
          <h1 className="text-2xl font-bold mb-3">Access Denied</h1>
          <p className="text-slate-400 text-sm">
            This application requires Windows Authentication against the corporate
            Active Directory. Please make sure you are on the corporate network and
            signed in to a domain-joined machine, then reload this page.
          </p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
