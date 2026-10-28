// src/components/Layout.tsx
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import LanguageSwitcher from './LanguageSwitcher';
import { useT } from '../i18n/useI18n';
import dict from '../i18n/locales/layout';

// 暫時隱藏的側邊欄項目（路由仍可直接存取）
const SHOW_DASHBOARD = false;
const SHOW_REPORT = false;

// Pages that fill the whole content area instead of sitting in the padded white card.
const FULL_BLEED_PATHS = ['/like-excel'];

const SIDEBAR_STORAGE_KEY = 'webexcelprj_sidebar_hidden';

function readSidebarHidden(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

const LOGO = (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
    <rect x="1" y="1" width="28" height="28" rx="7" fill="#6BBBAE" />
    <path d="M7 18c2.8-4.5 5-4.5 8 0s5.2 4.5 8 0" stroke="#FFFFFF" strokeWidth="2.4" fill="none" strokeLinecap="round" />
  </svg>
);

// Panel icon with an arrow: points left to hide the sidebar, right to show it.
function PanelIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d={hidden ? 'M13 10l2 2-2 2' : 'M16 10l-2 2 2 2'} />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${open ? '' : '-rotate-90'}`}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export default function Layout() {
  // 控制各分類的收摺狀態
  const [isNewFormOpen, setIsNewFormOpen] = useState(true);
  const [isFormsOpen, setIsFormsOpen] = useState(true);
  const [isSetupOpen, setIsSetupOpen] = useState(true);
  const [isReportOpen, setIsReportOpen] = useState(true);

  const [sidebarHidden, setSidebarHidden] = useState(readSidebarHidden);

  const { user } = useAuth();
  const t = useT(dict);
  const fullBleed = FULL_BLEED_PATHS.includes(useLocation().pathname);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarHidden ? '1' : '0');
    } catch {
      // storage unavailable — the choice just isn't remembered
    }
    // The Syncfusion spreadsheet only re-measures itself on window resize.
    window.dispatchEvent(new Event('resize'));
  }, [sidebarHidden]);

  return (
    <div className="flex flex-row w-screen h-screen overflow-hidden bg-[#EEF0F0]">

      {/* 側邊欄收合時：只留一條窄欄（Logo + 展開按鈕） */}
      {sidebarHidden && (
        <aside className="w-14 bg-white border-r border-[#E6E6E6] flex h-full flex-col items-center gap-4 py-5 shrink-0">
          <Link to="/" title="WebaseCell">{LOGO}</Link>
          <button
            onClick={() => setSidebarHidden(false)}
            title={t('showMenu')}
            aria-label={t('showMenu')}
            className="p-1.5 rounded-lg text-[#666666] hover:bg-[#E5F3F0] hover:text-[#1E6F64]"
          >
            <PanelIcon hidden />
          </button>
        </aside>
      )}

      {/* 側邊欄 Sidebar */}
      <aside className={`w-64 bg-white border-r border-[#E6E6E6] text-[#333333] h-full flex-col shrink-0 ${sidebarHidden ? 'hidden' : 'flex'}`}>
        <div className="p-6 border-b border-[#E6E6E6] flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Link to="/" className="flex items-center gap-2.5 text-[#6BBBAE]">
              {LOGO}
              <span className="font-bold text-[20px] tracking-wide">
                Webase<span className="text-[#1E6F64]">Cell</span>
              </span>
            </Link>
            <button
              onClick={() => setSidebarHidden(true)}
              title={t('hideMenu')}
              aria-label={t('hideMenu')}
              className="p-1.5 rounded-lg text-[#666666] hover:bg-[#E5F3F0] hover:text-[#1E6F64]"
            >
              <PanelIcon hidden={false} />
            </button>
          </div>
          {user && (
            <span className="text-xs text-[#666666] truncate" title={user.email}>{user.name || user.email}</span>
          )}
          <LanguageSwitcher className="bg-white border-[#CFD6D5] text-[#333333] self-start" />
        </div>

        <nav className="flex-1 p-4 flex flex-col gap-1 overflow-y-auto">
          {SHOW_DASHBOARD && (
            <NavLink to="/dashboard" className={({ isActive }) => `p-3 rounded-lg text-sm block ${isActive ? 'bg-[#1E6F64] text-white' : 'hover:bg-[#E5F3F0]'}`}>
              {t('dashboard')}
            </NavLink>
          )}

          {/* NEW FORM 分類 */}
          <div className="mt-2">
            <button 
              onClick={() => setIsNewFormOpen(!isNewFormOpen)}
              className="w-full flex justify-between items-center p-3 text-xs font-semibold text-[#94A3B8] uppercase tracking-wider hover:text-[#1E6F64] transition-colors"
            >
              {t('newForm')}
              <Chevron open={isNewFormOpen} />
            </button>
            
            {isNewFormOpen && (
              <div className="flex flex-col gap-1">
                <NavLink to="/like-excel" className={({ isActive }) => `flex items-center p-2 pl-9 rounded-lg text-sm ${isActive ? 'text-[#1E6F64] font-medium bg-[#E5F3F0]' : 'text-[#333333] hover:bg-[#F0F8F6] hover:text-[#1E6F64]'}`}>
                  {t('likeExcel')}
                </NavLink>
              </div>
            )}
          </div>

          {/* FORMS 分類 */}
          <div className="mt-2">
            <button 
              onClick={() => setIsFormsOpen(!isFormsOpen)}
              className="w-full flex justify-between items-center p-3 text-xs font-semibold text-[#94A3B8] uppercase tracking-wider hover:text-[#1E6F64] transition-colors"
            >
              {t('forms')}
              <Chevron open={isFormsOpen} />
            </button>

            {isFormsOpen && (
              <div className="flex flex-col gap-1">
                <NavLink to="/like-excel-list" className={({ isActive }) => `flex items-center p-2 pl-9 rounded-lg text-sm ${isActive ? 'text-[#1E6F64] font-medium bg-[#E5F3F0]' : 'text-[#333333] hover:bg-[#F0F8F6] hover:text-[#1E6F64]'}`}>
                  {t('likeExcelList')}
                </NavLink>
                <NavLink to="/db-console" className={({ isActive }) => `flex items-center p-2 pl-9 rounded-lg text-sm ${isActive ? 'text-[#1E6F64] font-medium bg-[#E5F3F0]' : 'text-[#333333] hover:bg-[#F0F8F6] hover:text-[#1E6F64]'}`}>
                  {t('dbConsole')}
                </NavLink>
              </div>
            )}
          </div>

          {/* SETUP 分類 */}
          <div className="mt-2">
            <button 
              onClick={() => setIsSetupOpen(!isSetupOpen)}
              className="w-full flex justify-between items-center p-3 text-xs font-semibold text-[#94A3B8] uppercase tracking-wider hover:text-[#1E6F64] transition-colors"
            >
              {t('setup')}
              <Chevron open={isSetupOpen} />
            </button>

            {isSetupOpen && (
              <div className="flex flex-col gap-1">
                <NavLink to="/excel-mapping-setup" className={({ isActive }) => `flex items-center p-2 pl-9 rounded-lg text-sm ${isActive ? 'text-[#1E6F64] font-medium bg-[#E5F3F0]' : 'text-[#333333] hover:bg-[#F0F8F6] hover:text-[#1E6F64]'}`}>
                  {t('excelMappingSetup')}
                </NavLink>
              </div>
            )}
          </div>

          {/* REPORT 分類 */}
          {SHOW_REPORT && (
            <div className="mt-2">
              <button
                onClick={() => setIsReportOpen(!isReportOpen)}
                className="w-full flex justify-between items-center p-3 text-xs font-semibold text-[#94A3B8] uppercase tracking-wider hover:text-[#1E6F64] transition-colors"
              >
                {t('report')}
                <Chevron open={isReportOpen} />
              </button>

              {isReportOpen && (
                <div className="flex flex-col gap-1">
                  <NavLink to="/report/forecast-change" className={({ isActive }) => `flex items-center p-2 pl-9 rounded-lg text-sm ${isActive ? 'text-[#1E6F64] font-medium bg-[#E5F3F0]' : 'text-[#333333] hover:bg-[#F0F8F6] hover:text-[#1E6F64]'}`}>
                    {t('forecastChange')}
                  </NavLink>
                </div>
              )}
            </div>
          )}
        </nav>
      </aside>

      {/* 右側主要內容區 */}
      {fullBleed ? (
        <main className="flex-1 h-full overflow-hidden bg-white">
          <Outlet />
        </main>
      ) : (
        <main className="flex-1 h-full overflow-auto p-6">
          <div className="bg-white min-h-full rounded-2xl shadow-sm border border-[#E3E8E7] p-8">
            <Outlet />
          </div>
        </main>
      )}
    </div>
  );
}