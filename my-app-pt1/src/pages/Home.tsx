// src/pages/Home.tsx
// Landing page styled after https://www.greenwave.com.tw (white + teal, Noto Sans TC,
// dashboard mockup hero, Excel-vs-Web comparison, steps and feature cards).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LanguageSwitcher from '../components/LanguageSwitcher';
import LoginPanel from '../components/LoginPanel';
import { useAuth } from '../context/useAuth';
import { useLanguage, useT } from '../i18n/useI18n';
import dict from '../i18n/locales/home';

// "Contact Us" goes to the contact form on greenwave.com.tw, in the visitor's language.
const CONTACT_URL = { en: 'https://greenwave.com.tw/en/#contact', ja: 'https://greenwave.com.tw/ja/#contact', 'zh-TW': 'https://greenwave.com.tw/#contact' };

const COMPARE_ROWS = [
  ['rowVersion', 'excelVersion', 'webVersion'],
  ['rowAccess', 'excelAccess', 'webAccess'],
  ['rowTrack', 'excelTrack', 'webTrack'],
  ['rowReport', 'excelReport', 'webReport'],
  ['rowCollab', 'excelCollab', 'webCollab'],
  ['rowIntegrate', 'excelIntegrate', 'webIntegrate'],
] as const;

const STEPS = [
  ['step1Title', 'step1Body'],
  ['step2Title', 'step2Body'],
  ['step3Title', 'step3Body'],
  ['step4Title', 'step4Body'],
] as const;

const FEATURES = [
  ['▦', 'f1Title', 'f1Body'],
  ['🗂', 'f2Title', 'f2Body'],
  ['⇄', 'f3Title', 'f3Body'],
  ['⤓', 'f4Title', 'f4Body'],
  ['{}', 'f5Title', 'f5Body'],
  ['📈', 'f6Title', 'f6Body'],
] as const;

function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
      <rect x="1" y="1" width="28" height="28" rx="7" fill="#6BBBAE" />
      <path d="M7 18c2.8-4.5 5-4.5 8 0s5.2 4.5 8 0" stroke="#FFFFFF" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// The /login route renders this page with the sign-in dialog already open (showLogin).
function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}

export default function Home({ showLogin = false }: { showLogin?: boolean }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const t = useT(dict);
  const { lang } = useLanguage();
  // Where to go after signing in: Login → stay on the home page, Demo → Like Excel.
  const [loginTarget, setLoginTarget] = useState<string | null>(showLogin && !user ? '/' : null);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  const openApp = (path: string) => (user ? navigate(path) : setLoginTarget(path));
  const openDemo = () => openApp('/like-excel');
  const closeLogin = () => {
    setLoginTarget(null);
    if (showLogin) navigate('/', { replace: true });
  };

  return (
    // 'fixed inset-0' ignores any parent padding/margins; the page scrolls inside it
    <div className="fixed inset-0 overflow-y-auto bg-white text-[#555555] z-[9999] leading-relaxed">
      {/* ===== Nav ===== */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-[#E6E6E6]">
        <nav className="max-w-[1240px] mx-auto px-6 min-h-[72px] flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <button onClick={() => scrollTo('top')} className="flex items-center gap-2.5 text-[#6BBBAE]">
            <Logo />
            <span className="font-bold text-[21px] tracking-wide">
              Webase<span className="text-[#1E6F64]">Cell</span>
            </span>
          </button>

          <div className="hidden md:flex items-center gap-7 text-[16px] text-[#333333]">
            <button onClick={() => scrollTo('compare')} className="hover:text-[#1E6F64]">{t('navCompare')}</button>
            <button onClick={() => scrollTo('steps')} className="hover:text-[#1E6F64]">{t('navSteps')}</button>
            <button onClick={() => scrollTo('features')} className="hover:text-[#1E6F64]">{t('navFeatures')}</button>
            <button onClick={() => navigate('/docs')} className="hover:text-[#1E6F64]">{t('navDocs')}</button>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher className="bg-white border-[#CFD6D5] text-[#333333] py-1.5" />
            {!user && (
              <button
                onClick={() => setLoginTarget('/')}
                className="inline-flex items-center gap-2 min-h-[40px] px-4 rounded-full border-[1.5px] border-[#6BBBAE] text-[#1E6F64] text-sm font-medium hover:bg-[#E5F3F0] transition-colors"
              >
                <UserIcon />
                {t('login')}
              </button>
            )}
            {user && (
              <>
                <span className="inline-flex items-center gap-2 text-sm text-[#333333] max-w-[180px]" title={user.email}>
                  {user.picture ? (
                    <img src={user.picture} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-[#E5F3F0] text-[#1E6F64] flex items-center justify-center shrink-0">
                      <UserIcon />
                    </span>
                  )}
                  <span className="truncate font-medium">{user.name || user.email}</span>
                </span>
                <button
                  onClick={logout}
                  className="min-h-[40px] px-4 rounded-full border-[1.5px] border-[#CFD6D5] text-[#666666] text-sm font-medium hover:border-[#6BBBAE] hover:text-[#1E6F64] transition-colors"
                >
                  {t('logout')}
                </button>
              </>
            )}
            {/* Demo is always the right-most item */}
            <button
              onClick={openDemo}
              className="inline-flex items-center gap-2 min-h-[40px] px-5 rounded-full bg-[#1E6F64] text-white text-sm font-medium hover:bg-[#0E3B36] transition-colors"
            >
              <span aria-hidden="true">▶</span>
              {t('demo')}
            </button>
          </div>
        </nav>
      </header>

      {/* ===== Hero ===== */}
      <section id="top" className="bg-gradient-to-b from-[#E5F3F0] to-white">
        <div className="max-w-[1240px] mx-auto px-6 py-16 md:py-24 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-block px-3 py-1 mb-5 rounded-full bg-white border border-[#6BBBAE] text-[#1E6F64] text-sm font-medium">
              {t('eyebrow')}
            </div>
            <h1 className="text-4xl md:text-[52px] font-bold text-[#1A1A1A] leading-tight mb-6">
              {t('heroBefore')}
              <span className="text-[#1E6F64]">{t('heroHighlight')}</span>
              {t('heroAfter')}
            </h1>
            <p className="text-lg mb-8 max-w-xl">{t('heroBody')}</p>

            <div className="flex flex-wrap gap-4 mb-8">
              <a
                href={CONTACT_URL[lang]}
                className="px-8 py-3.5 rounded-full bg-[#1E6F64] text-white font-bold hover:bg-[#0E3B36] transition-colors"
              >
                {t('contactUs')}
              </a>
              <button
                onClick={() => navigate('/docs')}
                className="px-8 py-3.5 rounded-full border-[1.5px] border-[#6BBBAE] text-[#1E6F64] font-medium hover:bg-[#E5F3F0] transition-colors"
              >
                {t('readDocs')} →
              </button>
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              {(['pillGoogle', 'pillLang', 'pillSql'] as const).map((k) => (
                <span key={k} className="px-3 py-1 rounded-full bg-[#EEF0F0] text-[#334155]">✓ {t(k)}</span>
              ))}
            </div>
          </div>

          {/* Dashboard mockup */}
          <div className="relative">
            <div className="rounded-2xl border border-[#E3E8E7] bg-white shadow-[0_20px_50px_-20px_rgba(14,59,54,0.35)] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-[#F3F4F6] border-b border-[#E5E7EB]">
                <span className="w-3 h-3 rounded-full bg-[#F87171]" />
                <span className="w-3 h-3 rounded-full bg-[#FBBF24]" />
                <span className="w-3 h-3 rounded-full bg-[#34D399]" />
                <span className="ml-3 text-xs text-[#94A3B8] font-mono">webasecell / dashboard</span>
              </div>
              <div className="p-5">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm font-bold text-[#1E293B]">{t('mockTitle')}</span>
                  <span className="text-xs px-2 py-1 rounded border border-[#CBD5E1] text-[#334155]">{t('mockYear')}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="rounded-lg bg-[#E5F3F0] p-3">
                    <div className="text-[11px] text-[#334155]">{t('kpiTotal')}</div>
                    <div className="text-xl font-bold text-[#0E3B36]">650 / 670</div>
                  </div>
                  <div className="rounded-lg bg-[#E5F3F0] p-3">
                    <div className="text-[11px] text-[#334155]">{t('kpiRate')}</div>
                    <div className="text-xl font-bold text-[#0E3B36]">103%</div>
                  </div>
                  <div className="rounded-lg bg-[#E5F3F0] p-3">
                    <div className="text-[11px] text-[#334155]">{t('kpiDiff')}</div>
                    <div className="text-xl font-bold text-[#1E6F64]">↗ +20</div>
                  </div>
                </div>
                <div className="text-xs text-[#334155] mb-2 flex justify-between">
                  <span>{t('mockChart')}</span>
                  <span className="flex gap-3">
                    <span className="flex items-center gap-1"><i className="w-3 h-0.5 bg-[#1E6F64] inline-block" />{t('legendActual')}</span>
                    <span className="flex items-center gap-1"><i className="w-3 h-0.5 bg-[#94A3B8] inline-block" />{t('legendForecast')}</span>
                  </span>
                </div>
                <svg viewBox="0 0 400 130" className="w-full h-auto" aria-hidden="true">
                  {[20, 55, 90].map((y) => <line key={y} x1="0" x2="400" y1={y} y2={y} stroke="#EEEEEE" />)}
                  <polyline points="0,95 60,85 120,80 180,70 240,65 300,55 360,50 400,45" fill="none" stroke="#94A3B8" strokeWidth="2" strokeDasharray="5 4" />
                  <polygon points="0,100 60,90 120,70 180,75 240,55 300,50 360,35 400,30 400,120 0,120" fill="#6BBBAE" opacity="0.18" />
                  <polyline points="0,100 60,90 120,70 180,75 240,55 300,50 360,35 400,30" fill="none" stroke="#1E6F64" strokeWidth="2.5" />
                  {['07-01', '07-05', '07-10', '07-20'].map((d, i) => (
                    <text key={d} x={10 + i * 120} y="128" fontSize="10" fill="#94A3B8">{d}</text>
                  ))}
                </svg>
              </div>
            </div>
            <div className="absolute -bottom-6 -left-4 md:-left-8 flex items-center gap-3 bg-white rounded-xl border border-[#E3E8E7] shadow-lg px-4 py-3">
              <span className="w-7 h-7 rounded-full bg-[#6BBBAE] text-white flex items-center justify-center text-sm">✓</span>
              <div>
                <div className="text-sm font-bold text-[#1A1A1A]">{t('toastTitle')}</div>
                <div className="text-xs text-[#666666]">{t('toastBody')}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Excel vs Web ===== */}
      <section id="compare" className="py-20">
        <div className="max-w-[1240px] mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[#1A1A1A] mb-2">{t('compareTitle')}</h2>
            <p className="text-[#666666]">{t('compareSub')}</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-[#E5E7EB] bg-[#F3F4F6] p-7">
              <h3 className="text-xl font-bold text-[#333333]">{t('excelHead')}</h3>
              <p className="text-sm text-[#666666] mb-5">{t('excelSub')}</p>
              <ul className="space-y-4">
                {COMPARE_ROWS.map(([row, excel]) => (
                  <li key={row} className="flex gap-3">
                    <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-[#CBD5E1] text-white text-xs flex items-center justify-center">✕</span>
                    <div>
                      <div className="font-medium text-[#333333]">{t(row)}</div>
                      <div className="text-sm">{t(excel)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border-2 border-[#6BBBAE] bg-[#E5F3F0] p-7">
              <h3 className="text-xl font-bold text-[#0E3B36]">{t('webHead')}</h3>
              <p className="text-sm text-[#1E6F64] mb-5">{t('webSub')}</p>
              <ul className="space-y-4">
                {COMPARE_ROWS.map(([row, , web]) => (
                  <li key={row} className="flex gap-3">
                    <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-[#1E6F64] text-white text-xs flex items-center justify-center">✓</span>
                    <div>
                      <div className="font-medium text-[#0E3B36]">{t(row)}</div>
                      <div className="text-sm text-[#334155]">{t(web)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Steps ===== */}
      <section id="steps" className="py-20 bg-[#EEF0F0]">
        <div className="max-w-[1240px] mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[#1A1A1A] mb-2">{t('stepsTitle')}</h2>
            <p className="text-[#666666]">{t('stepsSub')}</p>
          </div>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="rounded-2xl bg-white border border-[#E3E8E7] p-6">
                <div className="w-10 h-10 mb-4 rounded-full bg-[#6BBBAE] text-white font-bold flex items-center justify-center">{i + 1}</div>
                <div className="font-bold text-[#1A1A1A] mb-1">{t(title)}</div>
                <div className="text-sm">{t(body)}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ===== Features ===== */}
      <section id="features" className="py-20">
        <div className="max-w-[1240px] mx-auto px-6">
          <h2 className="text-3xl font-bold text-[#1A1A1A] text-center mb-12">{t('featuresTitle')}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(([icon, title, body]) => (
              <div key={title} className="rounded-2xl border border-[#E5E7EB] p-6 hover:border-[#6BBBAE] hover:shadow-md transition">
                <div className="w-11 h-11 mb-4 rounded-xl bg-[#E5F3F0] text-[#1E6F64] font-bold flex items-center justify-center">{icon}</div>
                <div className="font-bold text-[#1A1A1A] mb-2">{t(title)}</div>
                <div className="text-sm">{t(body)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="px-6 pb-20">
        <div className="max-w-[1240px] mx-auto rounded-3xl bg-[#0E3B36] text-white px-8 py-14 text-center">
          <h2 className="text-3xl font-bold mb-3">{t('ctaTitle')}</h2>
          <p className="text-[#CFD6D5] mb-8">{t('ctaBody')}</p>
          <a
            href={CONTACT_URL[lang]}
            className="inline-block px-10 py-3.5 rounded-full bg-[#6BBBAE] text-[#0E3B36] font-bold hover:bg-white transition-colors"
          >
            {t('contactUs')}
          </a>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="border-t border-[#E6E6E6]">
        <div className="max-w-[1240px] mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2 text-[#6BBBAE] font-bold">
            <Logo /> Greenwave
          </div>
          <a href="mailto:service@greenwave.com.tw" className="text-[#1E6F64] hover:text-[#0E3B36]">service@greenwave.com.tw</a>
          <div className="text-[#666666]">{t('footer')}</div>
        </div>
      </footer>

      {loginTarget && !user && <LoginPanel redirectTo={loginTarget} onClose={closeLogin} />}
    </div>
  );
}
