import { useT } from '../i18n/useI18n';
import dict from '../i18n/locales/approve';

export default function Approve() {
  const t = useT(dict);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t('title')}</h1>
      <p className="text-gray-600">{t('subtitle')}</p>
    </div>
  );
}