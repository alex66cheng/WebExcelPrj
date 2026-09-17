// src/pages/LikeExcelList.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../config/apiBase';

interface ExcelPoolFile {
  fileName: string;    // 實體檔案名稱（檔案池內唯一，下載/匯入皆以此為準）
  displayName: string; // 顯示別名（可自訂，不影響實體檔名）
  ext: string;         // 副檔名 xlsx / xls / xlsm / csv
  editable: boolean;   // 是否可於線上編輯器開啟 (僅 xlsx / xlsm)
  size: number;        // 檔案大小 (bytes)
  uploadedAt: string;  // 上傳（最後異動）時間 ISO 字串
}

const EXT_STYLE: Record<string, string> = {
  xlsx: 'bg-green-100 text-green-700',
  xlsm: 'bg-emerald-100 text-emerald-700',
  xlsb: 'bg-teal-100 text-teal-700',
  xls: 'bg-lime-100 text-lime-700',
  csv: 'bg-sky-100 text-sky-700'
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function LikeExcelList() {
  const [files, setFiles] = useState<ExcelPoolFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [extFilter, setExtFilter] = useState<string>('all');
  const [isDragging, setIsDragging] = useState(false);
  // 正在編輯別名的檔案（實體檔名）與編輯中的暫存文字
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // 讀取伺服器端 Excel 檔案池清單
  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/excel-pool/list`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || '讀取清單失敗');
      setFiles(data.files as ExcelPoolFile[]);
    } catch (err) {
      setMessage({ type: 'error', text: `無法連線至檔案池：${(err as Error).message}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // 上傳檔案（支援多檔）
  const uploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const formData = new FormData();
    Array.from(fileList).forEach(f => formData.append('files', f));

    setUploading(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/excel-pool/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || '上傳失敗');
      setMessage({ type: 'success', text: data.message });
      await loadFiles();
    } catch (err) {
      setMessage({ type: 'error', text: `上傳失敗：${(err as Error).message}` });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (fileName: string) => {
    if (!window.confirm(`確定要從檔案池刪除「${fileName}」嗎？此動作無法復原。`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/excel-pool/${encodeURIComponent(fileName)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || '刪除失敗');
      setMessage({ type: 'success', text: `已刪除 ${fileName}` });
      await loadFiles();
    } catch (err) {
      setMessage({ type: 'error', text: `刪除失敗：${(err as Error).message}` });
    }
  };

  // --- 別名編輯 ---
  const startEditName = (file: ExcelPoolFile) => {
    setEditingFile(file.fileName);
    setEditingName(file.displayName);
  };

  const cancelEditName = () => {
    setEditingFile(null);
    setEditingName('');
  };

  const submitEditName = async (fileName: string) => {
    const newName = editingName.trim();
    if (!newName) {
      setMessage({ type: 'error', text: '名稱不可空白' });
      return;
    }
    setSavingName(true);
    try {
      const res = await fetch(`${API_BASE}/api/excel-pool/${encodeURIComponent(fileName)}/name`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: newName })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || '更新名稱失敗');
      setFiles(prev => prev.map(f => (f.fileName === fileName ? { ...f, displayName: data.displayName } : f)));
      setMessage({ type: 'success', text: `名稱已更新為「${data.displayName}」` });
      cancelEditName();
    } catch (err) {
      setMessage({ type: 'error', text: `更新名稱失敗：${(err as Error).message}` });
    } finally {
      setSavingName(false);
    }
  };

  // --- 開啟線上編輯器 ---
  const handleOpen = (file: ExcelPoolFile) => {
    if (!file.editable) {
      setMessage({
        type: 'error',
        text: `.${file.ext} 格式無法於線上編輯器開啟，請下載後另存為 .xlsx 再上傳。`
      });
      return;
    }
    navigate(`/like-excel?poolFile=${encodeURIComponent(file.fileName)}`);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    uploadFiles(e.dataTransfer.files);
  };

  // 搜尋（別名 + 實體檔名）與副檔名篩選
  const filteredFiles = files.filter(item => {
    const keyword = searchTerm.toLowerCase();
    const matchesSearch =
      item.fileName.toLowerCase().includes(keyword) ||
      item.displayName.toLowerCase().includes(keyword);
    const matchesExt = extFilter === 'all' || item.ext === extFilter;
    return matchesSearch && matchesExt;
  });

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const latestUpload = files.length > 0 ? formatTime(files[0].uploadedAt) : '—';
  const availableExts = Array.from(new Set(files.map(f => f.ext))).sort();

  return (
    <div className="flex flex-col h-full text-slate-800">

      {/* 頂部標頭與操作 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-5 mb-6 border-b border-gray-100 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Excel 檔案池</h1>
          <p className="text-sm text-gray-500 mt-1">集中管理所有上傳至伺服器的 Excel 原始檔，供範本對應與匯入流程取用</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={loadFiles}
            disabled={loading || uploading}
            className="bg-white hover:bg-slate-50 text-slate-600 border border-gray-300 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
          >
            🔄 重新整理
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm shadow-sm transition-all flex items-center gap-2 disabled:opacity-60"
          >
            {uploading ? '⏳ 上傳中…' : '📤 上傳 Excel 檔案'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".xlsx,.xls,.xlsm,.xlsb,.csv"
            className="hidden"
            onChange={(e) => uploadFiles(e.target.files)}
          />
        </div>
      </div>

      {/* 操作結果訊息 */}
      {message && (
        <div
          className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium border flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{message.type === 'success' ? '✅' : '⚠️'} {message.text}</span>
          <button onClick={() => setMessage(null)} className="text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* 拖曳上傳區 */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`mb-6 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          isDragging ? 'border-blue-500 bg-blue-50/60' : 'border-gray-300 bg-gray-50/60 hover:bg-gray-50'
        }`}
      >
        <div className="text-3xl mb-1">📁</div>
        <div className="text-sm font-semibold text-slate-700">將 Excel 檔案拖曳到此處，或點擊選擇檔案</div>
        <div className="text-xs text-gray-400 mt-1">支援 .xlsx / .xlsm / .xlsb / .xls / .csv，單檔上限 50 MB，可一次選取多個檔案</div>
      </div>

      {/* 關鍵數據儀表板小卡 (KPI) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl">
          <span className="text-xs font-bold text-slate-400 uppercase">檔案總數</span>
          <div className="text-2xl font-bold text-slate-800 mt-1">{files.length} 個</div>
        </div>
        <div className="bg-green-50/50 border border-green-100 p-4 rounded-xl">
          <span className="text-xs font-bold text-green-600 uppercase">佔用空間</span>
          <div className="text-2xl font-bold text-green-700 mt-1">{formatSize(totalSize)}</div>
        </div>
        <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl">
          <span className="text-xs font-bold text-blue-600 uppercase">最新上傳</span>
          <div className="text-xl font-bold text-blue-700 mt-1.5">{latestUpload}</div>
        </div>
      </div>

      {/* 工具列：搜尋與條件過濾 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4 bg-gray-50 p-3 rounded-xl border border-gray-200">
        <div className="flex-1 relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="搜尋檔案名稱..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-2 pl-9 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={extFilter}
          onChange={(e) => setExtFilter(e.target.value)}
          className="p-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">📊 所有格式</option>
          {availableExts.map(ext => (
            <option key={ext} value={ext}>.{ext}</option>
          ))}
        </select>
      </div>

      {/* 檔案清單表格區 */}
      <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-200 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <th className="p-4">名稱 (可編輯)</th>
                <th className="p-4">實體檔案名稱</th>
                <th className="p-4 w-24">格式</th>
                <th className="p-4 w-28 text-right">檔案大小</th>
                <th className="p-4 w-40">上傳時間</th>
                <th className="p-4 w-56 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center p-10 text-gray-400 italic bg-gray-50/30">
                    ⏳ 正在讀取檔案池清單...
                  </td>
                </tr>
              ) : filteredFiles.length > 0 ? (
                filteredFiles.map((item) => (
                  <tr key={item.fileName} className="hover:bg-slate-50/80 transition-colors group">
                    {/* 顯示名稱（別名）：可就地編輯 */}
                    <td className="p-4 font-medium text-slate-900">
                      {editingFile === item.fileName ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            autoFocus
                            type="text"
                            value={editingName}
                            maxLength={120}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') submitEditName(item.fileName);
                              if (e.key === 'Escape') cancelEditName();
                            }}
                            className="flex-1 min-w-0 p-1.5 border border-blue-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => submitEditName(item.fileName)}
                            disabled={savingName}
                            className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                          >
                            儲存
                          </button>
                          <button
                            onClick={cancelEditName}
                            className="text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-1.5 rounded-lg"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>📄</span>
                          <span className="truncate max-w-xs" title={item.displayName}>{item.displayName}</span>
                          <button
                            onClick={() => startEditName(item)}
                            title="修改名稱"
                            className="opacity-0 group-hover:opacity-100 text-xs text-slate-400 hover:text-blue-600 transition-opacity shrink-0"
                          >
                            ✏️
                          </button>
                        </div>
                      )}
                    </td>
                    {/* 實體檔案名稱 */}
                    <td className="p-4 text-slate-500">
                      <span className="font-mono text-xs truncate max-w-xs inline-block align-middle" title={item.fileName}>
                        {item.fileName}
                      </span>
                    </td>
                    {/* 副檔名標籤 */}
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${EXT_STYLE[item.ext] || 'bg-slate-100 text-slate-700'}`}>
                        {item.ext}
                      </span>
                    </td>
                    {/* 檔案大小 */}
                    <td className="p-4 text-right font-mono font-medium text-slate-600">
                      {formatSize(item.size)}
                    </td>
                    {/* 上傳時間 */}
                    <td className="p-4 text-xs text-slate-500">
                      {formatTime(item.uploadedAt)}
                    </td>
                    {/* 操作按鈕 */}
                    <td className="p-4 text-center whitespace-nowrap">
                      <button
                        onClick={() => handleOpen(item)}
                        disabled={!item.editable}
                        title={item.editable ? '在線上編輯器開啟' : `.${item.ext} 格式不支援線上開啟`}
                        className="text-emerald-700 hover:text-emerald-900 font-semibold text-xs bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-50"
                      >
                        開啟
                      </button>
                      <a
                        href={`${API_BASE}/api/excel-pool/download/${encodeURIComponent(item.fileName)}`}
                        className="ml-2 text-blue-600 hover:text-blue-800 font-semibold text-xs bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        下載
                      </a>
                      <button
                        onClick={() => handleDelete(item.fileName)}
                        className="ml-2 text-red-600 hover:text-red-800 font-semibold text-xs bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="text-center p-10 text-gray-400 italic bg-gray-50/30">
                    {files.length === 0
                      ? '💡 檔案池目前沒有任何 Excel 檔案，請先上傳。'
                      : '💡 找不到符合條件的檔案。'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
