// src/components/Layout.tsx
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export default function Layout() {
  // 控制各分類的收摺狀態
  const [isNewFormOpen, setIsNewFormOpen] = useState(true);
  const [isFormsOpen, setIsFormsOpen] = useState(true);
  const [isSetupOpen, setIsSetupOpen] = useState(true);
  const [isReportOpen, setIsReportOpen] = useState(true);

  const { user } = useAuth();

  return (
    <div className="flex flex-row w-screen h-screen overflow-hidden bg-gray-100">

      {/* 側邊欄 Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex h-full flex-col shrink-0">
        <div className="p-6 border-b border-slate-800 flex flex-col gap-2">
          <Link to="/" className="text-xl font-bold text-blue-400">Greenwave Demo</Link>
          {user && (
            <span className="text-xs text-slate-400 truncate">{user.domain}\{user.username}</span>
          )}
        </div>

        <nav className="flex-1 p-4 flex flex-col gap-1 overflow-y-auto">
          <NavLink to="/dashboard" className={({ isActive }) => `p-3 rounded text-sm block ${isActive ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            Dashboard
          </NavLink>

          {/* NEW FORM 分類 */}
          <div className="mt-2">
            <button 
              onClick={() => setIsNewFormOpen(!isNewFormOpen)}
              className="w-full flex justify-between items-center p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-white transition-colors"
            >
              New Form
              <span>{isNewFormOpen ? '▼' : '▶'}</span>
            </button>
            
            {isNewFormOpen && (
              <div className="flex flex-col gap-1">
                <NavLink to="/like-excel" className={({ isActive }) => `flex items-center p-2 pl-9 rounded text-sm ${isActive ? 'text-blue-400 bg-slate-800' : 'text-slate-300 hover:bg-slate-800'}`}>
                  Like Excel
                </NavLink>

                <NavLink to="/like-excel-ad" className={({ isActive }) => `flex items-center p-2 pl-9 rounded text-sm ${isActive ? 'text-blue-400 bg-slate-800' : 'text-slate-300 hover:bg-slate-800'}`}>
                  Like Excel AD
                </NavLink>
              </div>
            )}
          </div>

          {/* FORMS 分類 */}
          <div className="mt-2">
            <button 
              onClick={() => setIsFormsOpen(!isFormsOpen)}
              className="w-full flex justify-between items-center p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-white transition-colors"
            >
              Forms
              <span>{isFormsOpen ? '▼' : '▶'}</span>
            </button>

            {isFormsOpen && (
              <div className="flex flex-col gap-1">
                <NavLink to="/like-excel-list" className={({ isActive }) => `flex items-center p-2 pl-9 rounded text-sm ${isActive ? 'text-blue-400 bg-slate-800' : 'text-slate-300 hover:bg-slate-800'}`}>
                  Like Excel List
                </NavLink>
              </div>
            )}
          </div>

          {/* SETUP 分類 */}
          <div className="mt-2">
            <button 
              onClick={() => setIsSetupOpen(!isSetupOpen)}
              className="w-full flex justify-between items-center p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-white transition-colors"
            >
              Setup
              <span>{isSetupOpen ? '▼' : '▶'}</span>
            </button>

            {isSetupOpen && (
              <div className="flex flex-col gap-1">
                <NavLink to="/excel-mapping-setup" className={({ isActive }) => `flex items-center p-2 pl-9 rounded text-sm ${isActive ? 'text-blue-400 bg-slate-800' : 'text-slate-300 hover:bg-slate-800'}`}>
                  Excel Mapping Setup
                </NavLink>
                
                <NavLink to="/email-classify-setup" className={({ isActive }) => `flex items-center p-2 pl-9 rounded text-sm ${isActive ? 'text-blue-400 bg-slate-800' : 'text-slate-300 hover:bg-slate-800'}`}>
                  Email Setup
                </NavLink>
              </div>
            )}
          </div>

          {/* REPORT 分類 */}
          <div className="mt-2">
            <button
              onClick={() => setIsReportOpen(!isReportOpen)}
              className="w-full flex justify-between items-center p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-white transition-colors"
            >
              Report
              <span>{isReportOpen ? '▼' : '▶'}</span>
            </button>

            {isReportOpen && (
              <div className="flex flex-col gap-1">
                <NavLink to="/report/forecast-change" className={({ isActive }) => `flex items-center p-2 pl-9 rounded text-sm ${isActive ? 'text-blue-400 bg-slate-800' : 'text-slate-300 hover:bg-slate-800'}`}>
                  Forecast Change
                </NavLink>
              </div>
            )}
          </div>
        </nav>
      </aside>

      {/* 右側主要內容區 */}
      <main className="flex-1 h-full overflow-auto p-6">
        <div className="bg-white min-h-full rounded-2xl shadow-sm border border-gray-200 p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}