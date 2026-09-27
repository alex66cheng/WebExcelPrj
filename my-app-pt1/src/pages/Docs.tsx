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
    // Same dark full-screen shell as Home, but scrollable for long content.
    <div className="fixed inset-0 w-screen h-screen overflow-y-auto bg-[#0f172a] text-white z-[9999]">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px]" />
      </div>

      <header className="relative z-20 flex items-center justify-between max-w-3xl mx-auto px-6 pt-6">
        <button
          onClick={() => navigate('/')}
          className="text-slate-400 hover:text-white transition-colors text-sm"
        >
          {t('back')}
        </button>
        <LanguageSwitcher className="bg-slate-800/80 border-slate-700 text-slate-300" />
      </header>

      <main className="relative z-10 max-w-3xl mx-auto px-6 py-12">
        <div className="mb-4 inline-block px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-mono tracking-widest uppercase">
          {t('badge')}
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-12">{t('title')}</h1>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4 text-blue-400">{t('problemsTitle')}</h2>
          <ol className="space-y-3 list-decimal list-outside pl-6 text-slate-300 leading-relaxed">
            {PROBLEM_KEYS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ol>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4 text-blue-400">{t('solutionTitle')}</h2>
          <p className="text-slate-300 leading-relaxed">{t('solution')}</p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 text-blue-400">{t('stepsTitle')}</h2>
          <ol className="space-y-4">
            {STEP_KEYS.map((key, i) => (
              <li key={key} className="flex gap-4 items-start">
                <span className="flex-none w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/40 text-blue-300 text-sm font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="text-slate-300 leading-relaxed pt-1">{t(key)}</span>
              </li>
            ))}
          </ol>
        </section>

        <button
          onClick={() => navigate('/login')}
          className="px-10 py-4 bg-white text-black font-bold rounded-full transition-all hover:bg-blue-500 hover:text-white"
        >
          {t('getStarted')}
        </button>
      </main>
    </div>
  );
}
