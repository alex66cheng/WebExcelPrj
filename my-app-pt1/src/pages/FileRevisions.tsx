// src/pages/FileRevisions.tsx
// 📜 單一檔案池檔案的修訂紀錄：誰在什麼時候改了哪一格（舊值 → 新值、原因），以及每次回存。
//    網址：/file-revisions?poolFile=<實體檔名>[&owner=<擁有者 email>]（受邀者檢視別人的檔案時帶 owner）
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../config/apiBase';
import { useLanguage, useT } from '../i18n/useI18n';
import dict from '../i18n/locales/fileRevisions';

interface RevisionEntry {
  id: string;
  type: 'cell' | 'save';
  user: string;
  at: string;
  cellAddress: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  saveMode: 'overwrite' | 'new' | null;
  savedAs: string | null;
  auto: boolean;
}

interface RevisionsResponse {
  success: boolean;
  message?: string;
  displayName: string;
  ownerEmail: string;
  users: string[];
  total: number;
  hasMore: boolean;
  entries: RevisionEntry[];
}

const PAGE_SIZE = 100;
const DATE_LOCALE = { en: 'en-US', ja: 'ja-JP', 'zh-TW': 'zh-TW' } as const;

// 日期輸入框是本地日期；結束日要包含當天整天
function dayStartIso(date: string) {
  return date ? new Date(`${date}T00:00:00`).toISOString() : '';
}
function dayEndIso(date: string) {
  return date ? new Date(`${date}T23:59:59.999`).toISOString() : '';
}

function csvCell(value: unknown) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function FileRevisions() {
  const t = useT(dict);
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const poolFile = searchParams.get('poolFile') || '';
  const owner = searchParams.get('owner') || '';

  const [typeFilter, setTypeFilter] = useState<'' | 'cell' | 'save'>('');
  const [userFilter, setUserFilter] = useState('');
  const [cellInput, setCellInput] = useState('');
  const [cellFilter, setCellFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [info, setInfo] = useState<{ displayName: string; ownerEmail: string; users: string[] } | null>(null);
  const [entries, setEntries] = useState<RevisionEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 儲存格關鍵字輸入時稍等一下再查詢，避免每打一個字就打一次 API
  useEffect(() => {
    const timer = setTimeout(() => setCellFilter(cellInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [cellInput]);

  const buildQuery = useCallback((extra: Record<string, string>) => {
    const params = new URLSearchParams();
    if (owner) params.set('owner', owner);
    if (typeFilter) params.set('type', typeFilter);
    if (userFilter) params.set('user', userFilter);
    if (cellFilter) params.set('cell', cellFilter);
    if (fromDate) params.set('from', dayStartIso(fromDate));
    if (toDate) params.set('to', dayEndIso(toDate));
    Object.entries(extra).forEach(([k, v]) => params.set(k, v));
    return `/api/excel-pool/${encodeURIComponent(poolFile)}/revisions?${params.toString()}`;
  }, [owner, poolFile, typeFilter, userFilter, cellFilter, fromDate, toDate]);

  const fetchPage = useCallback(async (before?: string, limit = PAGE_SIZE): Promise<RevisionsResponse> => {
    const res = await apiFetch(buildQuery({ limit: String(limit), ...(before ? { before } : {}) }));
    const data: RevisionsResponse = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || res.statusText);
    return data;
  }, [buildQuery]);

  useEffect(() => {
    if (!poolFile) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPage()
      .then((data) => {
        if (cancelled) return;
        setInfo({ displayName: data.displayName, ownerEmail: data.ownerEmail, users: data.users });
        setEntries(data.entries);
        setTotal(data.total);
        setHasMore(data.hasMore);
      })
      .catch((err) => { if (!cancelled) setError(t('loadFailed', { error: (err as Error).message })); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [poolFile, fetchPage, t]);

  const loadMore = () => {
    const last = entries[entries.length - 1];
    if (!last) return;
    setLoadingMore(true);
    fetchPage(last.id)
      .then((data) => {
        setEntries((prev) => [...prev, ...data.entries]);
        setHasMore(data.hasMore);
      })
      .catch((err) => setError(t('loadFailed', { error: (err as Error).message })))
      .finally(() => setLoadingMore(false));
  };

  // 匯出目前篩選條件下的全部紀錄（後端上限 5000 筆一頁，超過就逐頁接著抓）
  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: RevisionEntry[] = [];
      let before: string | undefined;
      for (;;) {
        const data = await fetchPage(before, 5000);
        all.push(...data.entries);
        if (!data.hasMore || data.entries.length === 0) break;
        before = data.entries[data.entries.length - 1].id;
      }
      const rows = all.map((e) => [
        new Date(e.at).toISOString(), e.user, e.type, e.cellAddress, e.oldValue, e.newValue, e.reason,
        e.saveMode, e.savedAs, e.type === 'save' ? (e.auto ? 'Y' : 'N') : '',
      ].map(csvCell).join(','));
      // 開頭加 BOM，Excel 才會以 UTF-8 開啟、中文/日文不會變亂碼
      const blob = new Blob(['﻿' + [t('csvHeader'), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(info?.displayName || poolFile).replace(/[\\/:*?"<>|]/g, '_')}_revisions.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(t('loadFailed', { error: (err as Error).message }));
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setTypeFilter('');
    setUserFilter('');
    setCellInput('');
    setFromDate('');
    setToDate('');
  };
  const hasFilters = !!(typeFilter || userFilter || cellInput || fromDate || toDate);

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString(DATE_LOCALE[lang], {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

  const valueChip = (value: string | null, tone: 'old' | 'new') => (
    <span
      className={`inline-block max-w-[16rem] truncate align-middle px-1.5 py-0.5 rounded font-mono text-xs ${
        tone === 'old' ? 'bg-red-50 text-red-700 line-through decoration-red-300' : 'bg-green-50 text-green-700'
      }`}
      title={value ?? ''}
    >
      {value === null || value === '' ? t('empty') : value}
    </span>
  );

  if (!poolFile) {
    return <div className="p-6 text-slate-500">{t('missingFile')}</div>;
  }

  const openQuery = `poolFile=${encodeURIComponent(poolFile)}${owner ? `&owner=${encodeURIComponent(owner)}` : ''}`;

  return (
    <div className="flex flex-col h-full text-slate-800">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-5 mb-5 border-b border-gray-100 gap-4">
        <div className="min-w-0">
          <Link to="/like-excel-list" className="text-xs font-semibold text-blue-600 hover:text-blue-800">{t('back')}</Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">📜 {t('title')}</h1>
          <p className="text-sm text-gray-500 mt-1 truncate" title={poolFile}>
            📄 <span className="font-medium text-slate-700">{info?.displayName || poolFile}</span>
            <span className="font-mono text-xs ml-2 text-slate-400">({poolFile})</span>
            {info && <span className="ml-3 text-xs">{t('owner', { email: info.ownerEmail })}</span>}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => navigate(`/like-excel?${openQuery}`)}
            className="text-sm font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-4 py-2 rounded-lg transition-colors"
          >
            {t('openFile')}
          </button>
          <button
            onClick={exportCsv}
            disabled={exporting || total === 0}
            className="text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {exporting ? t('exporting') : t('exportCsv')}
          </button>
        </div>
      </div>

      {/* 篩選列 */}
      <div className="flex flex-wrap items-end gap-3 mb-4 bg-gray-50 p-3 rounded-xl border border-gray-200 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-500">{t('filterType')}</span>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as '' | 'cell' | 'save')} className="p-2 bg-white border border-gray-300 rounded-lg">
            <option value="">{t('typeAll')}</option>
            <option value="cell">{t('typeCell')}</option>
            <option value="save">{t('typeSave')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-500">{t('filterUser')}</span>
          <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="p-2 bg-white border border-gray-300 rounded-lg max-w-[16rem]">
            <option value="">{t('userAll')}</option>
            {(info?.users || []).map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-500">{t('filterCell')}</span>
          <input
            value={cellInput}
            onChange={(e) => setCellInput(e.target.value)}
            placeholder={t('cellPlaceholder')}
            className="p-2 bg-white border border-gray-300 rounded-lg w-44 font-mono"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-500">{t('filterFrom')}</span>
          <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className="p-2 bg-white border border-gray-300 rounded-lg" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-500">{t('filterTo')}</span>
          <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className="p-2 bg-white border border-gray-300 rounded-lg" />
        </label>
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-gray-300 px-3 py-2 rounded-lg">
            {t('clearFilters')}
          </button>
        )}
        <div className="flex-1" />
        <span className="text-xs font-semibold text-slate-500 self-center">{t('totalCount', { count: total })}</span>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">❌ {error}</div>}

      <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-200 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <th className="p-3 w-44">{t('colTime')}</th>
                <th className="p-3 w-52">{t('colUser')}</th>
                <th className="p-3 w-24">{t('colType')}</th>
                <th className="p-3 w-36">{t('colCell')}</th>
                <th className="p-3">{t('colChange')}</th>
                <th className="p-3">{t('colReason')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading ? (
                <tr><td colSpan={6} className="text-center p-10 text-gray-400 italic">{t('loading')}</td></tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center p-10 text-gray-400 italic bg-gray-50/30">
                    {hasFilters ? t('noMatches') : t('noEntries')}
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/80 transition-colors align-top">
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap font-mono">{formatTime(e.at)}</td>
                    <td className="p-3 text-xs text-slate-700 truncate max-w-[13rem]" title={e.user}>{e.user}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap ${e.type === 'cell' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                        {e.type === 'cell' ? t('badgeCell') : t('badgeSave')}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs text-slate-700">{e.type === 'cell' ? e.cellAddress : ''}</td>
                    <td className="p-3">
                      {e.type === 'cell' ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          {valueChip(e.oldValue, 'old')}
                          <span className="text-slate-400">→</span>
                          {valueChip(e.newValue, 'new')}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600">
                          {e.saveMode === 'overwrite' ? t('savedOverwrite') : t('savedAs', { name: e.savedAs || '' })}
                          {e.auto && <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px]">{t('autoSave')}</span>}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-slate-600 whitespace-pre-wrap break-words max-w-xs">{e.reason || ''}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {hasMore && !loading && (
          <div className="p-3 border-t border-gray-100 text-center">
            <button onClick={loadMore} disabled={loadingMore} className="text-sm font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50">
              {loadingMore ? t('loading') : t('loadMore')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
