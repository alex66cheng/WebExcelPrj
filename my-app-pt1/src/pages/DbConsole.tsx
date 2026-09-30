import { useEffect, useState } from 'react';
import { apiFetch } from '../config/apiBase';
import { useT } from '../i18n/useI18n';
import dict from '../i18n/locales/dbConsole';

interface ExecuteSqlResult {
  success: boolean;
  mode?: 'rows' | 'run' | 'exec';
  columns?: string[];
  rows?: Record<string, unknown>[];
  changes?: number;
  lastInsertRowid?: string | null;
  message?: string;
}

const DESTRUCTIVE_PATTERN = /^\s*(delete|drop|update|alter|truncate)\b/i;

export default function DbConsole() {
  const t = useT(dict);
  const [dbFiles, setDbFiles] = useState<string[]>([]);
  const [loadingDbFiles, setLoadingDbFiles] = useState(true);
  const [selectedDbFile, setSelectedDbFile] = useState('');
  const [sqlText, setSqlText] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<ExecuteSqlResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/spreadsheet/sqlite/list-dbs')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setDbFiles(data.files || []);
          if ((data.files || []).length > 0) setSelectedDbFile(data.files[0]);
        }
      })
      .catch(err => console.error('Error loading sqlite db files:', err))
      .finally(() => setLoadingDbFiles(false));
  }, []);

  const runSql = async (sqlOverride?: string) => {
    const sqlToRun = (sqlOverride ?? sqlText).trim();
    if (!selectedDbFile) {
      setError(t('selectDbFirst'));
      return;
    }
    if (!sqlToRun) {
      setError(t('enterSql'));
      return;
    }
    if (DESTRUCTIVE_PATTERN.test(sqlToRun)) {
      if (!window.confirm(t('confirmDestructive', { sql: sqlToRun, dbFile: selectedDbFile }))) {
        return;
      }
    }

    setIsExecuting(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch('/api/spreadsheet/sqlite/execute-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbFile: selectedDbFile, sql: sqlToRun }),
      });
      const data: ExecuteSqlResult = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || t('execFailed'));
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsExecuting(false);
    }
  };

  const listTables = () => {
    const q = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;";
    setSqlText(q);
    runSql(q);
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold text-slate-900 mb-1">{t('title')}</h1>
      <p className="text-sm text-gray-500 mb-6">{t('subtitle')}</p>

      <div className="mb-4">
        <label className="block text-sm font-semibold text-gray-700 mb-1">{t('dbFile')}</label>
        <select
          value={selectedDbFile}
          onChange={e => setSelectedDbFile(e.target.value)}
          disabled={loadingDbFiles}
          className="w-full max-w-sm p-2 border border-gray-300 rounded-md bg-white text-slate-800"
        >
          {loadingDbFiles && <option>{t('loading')}</option>}
          {!loadingDbFiles && dbFiles.length === 0 && <option value="">{t('noDbFiles')}</option>}
          {dbFiles.map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <label className="block text-sm font-semibold text-gray-700">{t('sqlLabel')}</label>
        <button
          type="button"
          onClick={listTables}
          disabled={!selectedDbFile || isExecuting}
          className="text-xs text-blue-600 hover:underline disabled:text-gray-400"
        >
          {t('listTables')}
        </button>
      </div>
      <textarea
        value={sqlText}
        onChange={e => setSqlText(e.target.value)}
        rows={6}
        placeholder={t('sqlPlaceholder')}
        className="w-full p-3 border border-gray-300 rounded-md font-mono text-sm bg-white text-slate-800"
      />

      <div className="mt-3 mb-6">
        <button
          type="button"
          onClick={() => runSql()}
          disabled={isExecuting || !selectedDbFile}
          className="px-4 py-2 bg-slate-800 text-white text-sm font-semibold rounded-md hover:bg-slate-700 disabled:bg-gray-300"
        >
          {isExecuting ? t('executing') : t('execute')}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700 whitespace-pre-wrap">
          ❌ {error}
        </div>
      )}

      {result && result.mode === 'rows' && (
        <div>
          <p className="text-sm text-gray-600 mb-2">{result.message}</p>
          {result.rows && result.rows.length > 0 ? (
            <div className="overflow-auto border border-gray-200 rounded-md max-h-[28rem]">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    {result.columns!.map(col => (
                      <th key={col} className="px-3 py-2 text-left font-semibold text-gray-700 border-b border-gray-200">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      {result.columns!.map(col => (
                        <td key={col} className="px-3 py-1.5 border-b border-gray-100 text-slate-700 whitespace-pre-wrap">
                          {row[col] === null || row[col] === undefined ? <span className="text-gray-400">NULL</span> : String(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500">{t('noResults')}</p>
          )}
        </div>
      )}

      {result && result.mode !== 'rows' && (
        <div className="p-3 rounded-md bg-green-50 border border-green-200 text-sm text-green-700">
          🎉 {result.message}
        </div>
      )}
    </div>
  );
}
