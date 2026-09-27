// src/pages/Home.tsx
import { useNavigate } from 'react-router-dom';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useT } from '../i18n/useI18n';
import dict from '../i18n/locales/home';

export default function Home() {
  const navigate = useNavigate();
  const t = useT(dict);

  return (
    // 'w-screen h-screen' ensures it ignores any parent padding/margins
    <div className="fixed inset-0 w-screen h-screen bg-[#0f172a] flex flex-col items-center justify-center z-[9999] text-white">
      
      <div className="absolute top-4 right-4 z-20">
        <LanguageSwitcher className="bg-slate-800/80 border-slate-700 text-slate-300" />
      </div>

      {/* Visual background element */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 text-center max-w-3xl px-6">
        <div className="mb-4 inline-block px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-mono tracking-widest uppercase">
          {t('badge')}
        </div>
        
        <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-8 leading-none">
          EXCEL<span className="text-blue-500">.</span>API
        </h1>
        
        <p className="text-slate-400 text-lg md:text-xl mb-12 font-light leading-relaxed">
          {t('taglineBefore')} <span className="text-white font-medium">ExcelJS</span> {t('taglineAfter')}
        </p>

        <div className="flex flex-col sm:flex-row gap-5 justify-center items-center">
          <button 
            onClick={() => navigate('/like-excel')} 
            className="group relative px-10 py-4 bg-white text-black font-bold rounded-full transition-all hover:bg-blue-500 hover:text-white overflow-hidden"
          >
            <span className="relative z-10">{t('launchDemo')}</span>
          </button>
          
          <button 
            onClick={() => navigate('/docs')}
            className="px-10 py-4 text-slate-400 hover:text-white transition-colors flex items-center gap-2 group"
          >
            {t('readDocs')} <span className="group-hover:translate-x-1 transition-transform">→</span>
          </button>
        </div>
      </div>

      <div className="absolute bottom-10 text-slate-600 text-[10px] uppercase tracking-widest font-bold">
        {t('footer')}
      </div>
    </div>
  );
}