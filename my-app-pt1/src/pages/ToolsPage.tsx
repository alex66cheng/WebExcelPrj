// src/pages/ToolsPage.tsx
// src/pages/ToolsPage.tsx
import { Link } from 'react-router-dom';
import { useT } from '../i18n/useI18n';
import dict from '../i18n/locales/tools';

export default function ToolsPage() {
  const t = useT(dict);
  return (
    <div className="overflow-hidden">
      <h1 className="text-3xl font-bold mb-6 text-slate-800">{t('title')}</h1>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b-2 border-slate-100 bg-slate-50">
            <th className="py-4 px-4 font-semibold text-slate-700">{t('projectName')}</th>
            <th className="py-4 px-4 font-semibold text-slate-700">{t('status')}</th>
            <th className="py-4 px-4 text-right font-semibold text-slate-700">{t('actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          <tr className="hover:bg-blue-50/50 transition-colors">
            <td className="py-4 px-4 font-medium text-slate-900 text-lg">Excel</td>
            <td className="py-4 px-4">
              <span className="text-green-600 bg-green-50 px-3 py-1 rounded-full text-xs font-bold uppercase">{t('active')}</span>
            </td>
            <td className="py-4 px-4 text-right">
              {/* Link to our new specialized Excel page */}
              <Link to="/like-excel" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-bold shadow-sm">
                {t('openWorkbook')}
              </Link>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}