// src/pages/Docs.tsx — public user's manual, linked from Home's "Read Docs" button.
import { useNavigate } from 'react-router-dom';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useT } from '../i18n/useI18n';
import dict from '../i18n/locales/docs';

const PROBLEM_KEYS = ['problem1', 'problem2', 'problem3'] as const;
const STEP_KEYS = ['step1', 'step2', 'step3', 'step4', 'step5', 'step6'] as const;

export default function Docs() {
  const navigate = useNavigate();
  const t = useT(dict);

  return (
    // Same light full-screen shell as Home, scrollable for long content.
    <div className="fixed inset-0 w-screen h-screen overflow-y-auto bg-white text-[#555555] z-[9999] leading-relaxed">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-[#E6E6E6]">
        <div className="max-w-[1240px] mx-auto px-6 min-h-[72px] flex items-center justify-between gap-4">
          <button onClick={() => navigate('/')} className="flex items-center gap-2.5 text-[#6BBBAE]">
            <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
              <rect x="1" y="1" width="28" height="28" rx="7" fill="#6BBBAE" />
              <path d="M7 18c2.8-4.5 5-4.5 8 0s5.2 4.5 8 0" stroke="#FFFFFF" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            </svg>
            <span className="font-bold text-[21px] tracking-wide">
              Webase<span className="text-[#1E6F64]">Cell</span>
            </span>
          </button>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="text-sm text-[#333333] hover:text-[#1E6F64]">
              {t('back')}
            </button>
            <LanguageSwitcher className="bg-white border-[#CFD6D5] text-[#333333] py-1.5" />
          </div>
        </div>
      </header>

      <section className="bg-gradient-to-b from-[#E5F3F0] to-white">
        <div className="max-w-3xl mx-auto px-6 pt-14 pb-8">
          <div className="mb-4 inline-block px-3 py-1 rounded-full bg-white border border-[#6BBBAE] text-[#1E6F64] text-sm font-medium">
            {t('badge')}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-[#1A1A1A]">{t('title')}</h1>
        </div>
      </section>

      <main className="max-w-3xl mx-auto px-6 pb-16 pt-6">
        <section className="mb-8 rounded-2xl border border-[#E5E7EB] bg-[#F3F4F6] p-7">
          <h2 className="text-2xl font-bold mb-4 text-[#1A1A1A]">{t('problemsTitle')}</h2>
          <ol className="space-y-3 list-decimal list-outside pl-6 marker:text-[#94A3B8]">
            {PROBLEM_KEYS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ol>
        </section>

        <section className="mb-8 rounded-2xl border-2 border-[#6BBBAE] bg-[#E5F3F0] p-7">
          <h2 className="text-2xl font-bold mb-4 text-[#0E3B36]">{t('solutionTitle')}</h2>
          <p className="text-[#334155]">{t('solution')}</p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 text-[#1A1A1A]">{t('stepsTitle')}</h2>
          <ol className="space-y-4">
            {STEP_KEYS.map((key, i) => (
              <li key={key} className="flex gap-4 items-start rounded-2xl border border-[#E3E8E7] bg-white p-5">
                <span className="flex-none w-9 h-9 rounded-full bg-[#6BBBAE] text-white text-sm font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="pt-1.5">{t(key)}</span>
              </li>
            ))}
          </ol>
        </section>

        <button
          onClick={() => navigate('/login')}
          className="px-10 py-3.5 rounded-full bg-[#1E6F64] text-white font-bold hover:bg-[#0E3B36] transition-colors"
        >
          {t('getStarted')}
        </button>
      </main>

      <footer className="border-t border-[#E6E6E6]">
        <div className="max-w-[1240px] mx-auto px-6 py-8 text-sm text-[#666666] text-center">
          © 2026 Greenwave. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
