import React, { useState, useEffect } from 'react';
import { apiFetch } from '../config/apiBase';

// ==========================================
// 1. TypeScript Interfaces & Definitions
// ==========================================
export interface DbField {
  name: string;
  type: string;
  length?: string;     
  allowNull: boolean;  
}

export interface RowHeaderMapping {
  id: string;
  excelColumn: string;
  dbFieldName: string;
  isGrouped: boolean;
  filterType: 'none' | 'not_empty' | 'numeric' | 'regex';
  filterExpression: string;
}

export interface ExcelPoolFile {
  fileName: string;
  displayName: string;
  ext: string;
  editable: boolean;
  size: number;
  uploadedAt: string;
}

const AVAILABLE_DATA_TYPES = [
  { value: 'varchar', label: 'varchar' },
  { value: 'nvarchar', label: 'nvarchar' },
  { value: 'int', label: 'int' },
  { value: 'decimal', label: 'decimal(18,4)' },
  { value: 'datetime', label: 'datetime' },
  { value: 'float', label: 'float' },
];

const DEFAULT_MACRO_TEMPLATE = `// ⚡ 步驟 5 自訂 JavaScript 巨集處理引擎
// 您可以直接使用 'rows' 陣列（代表 Syncfusion 工作表的橫列數據）進行資料清洗或動態重算。

rows.forEach(row => {
  if (!row || !row.cells) return;
  
  row.cells.forEach(cell => {
    if (cell && typeof cell.value === 'number' && cell.value < 0) {
      cell.value = 0;
    }
  });
});

console.log("⚡ 巨集執行完畢");`;

// 範本識別碼改為系統自動產生，不再開放使用者手動輸入/修改
function generateTemplateCode(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TPL-${ts}-${rand}`;
}

export const ExcelMappingSetup: React.FC = () => {
  const [dbTemplates, setDbTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState<boolean>(true);
  const [selectedTemplateCode, setSelectedTemplateCode] = useState<string>('NEW');

  // 改為與資料庫 filename 欄位完全對應的狀態變數
  const [filenameField, setFilenameField] = useState('');

  // 「資料庫對應檔名」改為從 Excel 檔案池 (like-excel-list) 選擇，不再另外上傳
  const [poolFiles, setPoolFiles] = useState<ExcelPoolFile[]>([]);
  const [loadingPoolFiles, setLoadingPoolFiles] = useState(true);

  const [dbFile, setDbFile] = useState('');
  const [availableDbFiles, setAvailableDbFiles] = useState<string[]>([]);
  const [loadingDbFiles, setLoadingDbFiles] = useState(true);
  const [newDbFileName, setNewDbFileName] = useState('');
  const [creatingDbFile, setCreatingDbFile] = useState(false);

  const [templateCode, setTemplateCode] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [description, setDescription] = useState('');
  const [targetTable, setTargetTable] = useState('');
  const [sheetMode, setSheetMode] = useState<'name' | 'index'>('index');
  const [sheetValue, setSheetValue] = useState<string | number>(1);
  const [dataStartRow, setDataStartRow] = useState<number>(1);
  
  const [tableStatus, setTableStatus] = useState<{ type: 'success' | 'missing' | 'error'; text: string } | null>(null);
  const [checkingTable, setCheckingTable] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [previewFields, setPreviewFields] = useState<DbField[]>([]);
  const [dbFields, setDbFields] = useState<{ name: string; type: string }[]>([]);

  const [rowHeaders, setRowHeaders] = useState<RowHeaderMapping[]>([
    { id: '1', excelColumn: '', dbFieldName: '', isGrouped: false, filterType: 'none', filterExpression: '' }
  ]);
  const [testInputs, setTestInputs] = useState<Record<string, string>>({}); 

  const [timeline, setTimeline] = useState({
    startColumn: '',
    endColumn: '',
    yearRow: 1,
    dbYearField: '',
    itemRow: 1,
    dbItemField: '',
    dbValueField: '',
    skipSpace: 0,
  });
  const [skipHeaders, setSkipHeaders] = useState<string[]>([]);
  const [newSkipInput, setNewSkipInput] = useState('');
  const [macroScript, setMacroScript] = useState<string>(DEFAULT_MACRO_TEMPLATE);

  // 初始掛載：從後端取得清單
  useEffect(() => {
    apiFetch('/api/spreadsheet/get-templates')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch templates');
        return res.json();
      })
      .then((data) => {
        setDbTemplates(data);
        setLoadingTemplates(false);
      })
      .catch((err) => {
        console.error('Error loading templates:', err);
        setLoadingTemplates(false);
      });
  }, []);

  // 初始掛載：取得目前伺服器上已存在的本機 SQLite 資料庫檔案清單
  const refreshDbFiles = async () => {
    setLoadingDbFiles(true);
    try {
      const response = await apiFetch('/api/spreadsheet/sqlite/list-dbs');
      const data = await response.json();
      if (data.success) {
        setAvailableDbFiles(data.files || []);
      }
    } catch (err) {
      console.error('Error loading sqlite db files:', err);
    } finally {
      setLoadingDbFiles(false);
    }
  };

  useEffect(() => {
    refreshDbFiles();
  }, []);

  // 初始掛載：取得目前使用者的 Excel 檔案池清單（給「資料庫對應檔名」下拉選單用）
  useEffect(() => {
    setLoadingPoolFiles(true);
    apiFetch('/api/excel-pool/list')
      .then(res => res.json())
      .then(data => {
        if (data.success) setPoolFiles(data.files || []);
      })
      .catch(err => console.error('Error loading excel pool files:', err))
      .finally(() => setLoadingPoolFiles(false));
  }, []);

 const fetchTableColumns = async (tableName: string, dbFileOverride?: string) => {
  const targetDbFile = dbFileOverride ?? dbFile;
  if (!tableName || !targetDbFile) return;

  try {
    const response = await apiFetch(`/api/table-columns?table=${encodeURIComponent(tableName)}&dbFile=${encodeURIComponent(targetDbFile)}`);
    const data = await response.json();

    if (data.success) {
      setDbFields(data.columns);
    } else {
      console.error('❌ 伺服器回傳錯誤:', data.message);
      setDbFields([]);
    }
  } catch (err) {
    console.error('❌ 無法取得資料庫欄位:', err);
    setDbFields([]);
  }
};

 // 副作用：切換範本時自動載入資料庫中的欄位設定與 filename
useEffect(() => {
  setTableStatus(null); 
  if (selectedTemplateCode === 'NEW') {
    setTemplateCode(generateTemplateCode());
    setTemplateName('');
    setDescription('');
    setTargetTable('');
    setSheetMode('index');
    setSheetValue(1);
    setDataStartRow(1);
    setRowHeaders([{ id: '1', excelColumn: '', dbFieldName: '', isGrouped: false, filterType: 'none', filterExpression: '' }]);
    setTimeline({ startColumn: '', endColumn: '', yearRow: 1, dbYearField: '', itemRow: 1, dbItemField: '', dbValueField: '', skipSpace: 0 });
    setSkipHeaders([]);
    setTestInputs({});
    setDbFields([]);
    setFilenameField('');
    setMacroScript(DEFAULT_MACRO_TEMPLATE);
    setDbFile('');
  } else {
    const targetObj = dbTemplates.find(t => String(t.ID) === selectedTemplateCode || t.name === selectedTemplateCode);
    console.log('🔍 目前選中的範本完整物件:', targetObj); // 👈 檢查這裡有沒有 startcol, skipspace 等欄位
    if (targetObj) {
      setTemplateCode(targetObj.ID ? String(targetObj.ID) : '');
      setTemplateName(targetObj.name || '');
      setDescription(targetObj.descriptionl || '');
      setTargetTable(targetObj.dbname || '');
      setSheetMode('index');
      setSheetValue(targetObj.sheet ?? 1);
      setDataStartRow(targetObj.rowstart || 1);
      
      // 1. 對應檔名欄位
      const resolvedFilename = targetObj.filename || targetObj.filepath || '';
      setFilenameField(resolvedFilename);

      // 1b. 對應綁定的本機 SQLite 資料庫檔案
      setDbFile(targetObj.dbFile || '');

      // 2. 自動載入從 xlsx2dbsetL2 關聯過來的固定維度欄位對應清單
      if (targetObj.rowHeaders && targetObj.rowHeaders.length > 0) {
        setRowHeaders(targetObj.rowHeaders);
      } else {
        setRowHeaders([{ id: '1', excelColumn: '', dbFieldName: '', isGrouped: false, filterType: 'none', filterExpression: '' }]);
      }

     // 3. 從 l3Settings 正確載入動態時間與項目軸設定
setTimeline({
  startColumn: targetObj.l3Settings?.startCol || '',
  endColumn: targetObj.l3Settings?.endCol || '',
  yearRow: targetObj.l3Settings?.yearRow ?? 1,
  itemRow: targetObj.l3Settings?.itemRow ?? 1,
  skipSpace: targetObj.l3Settings?.skipSpace ?? 0,
  dbYearField: targetObj.l3Settings?.dbYearField || '',
  dbItemField: targetObj.l3Settings?.dbItemField || '',
  dbValueField: targetObj.l3Settings?.dbValueField || '',
});
      
      setMacroScript(DEFAULT_MACRO_TEMPLATE);

      if (targetObj.dbname && targetObj.dbFile) {
        fetchTableColumns(targetObj.dbname, targetObj.dbFile);
      }
    }
  }
}, [selectedTemplateCode, dbTemplates]);

  const handleCreateDbFile = async () => {
    if (!newDbFileName.trim()) {
      alert('請輸入要建立的資料庫檔名！');
      return;
    }
    setCreatingDbFile(true);
    try {
      const response = await apiFetch('/api/spreadsheet/sqlite/create-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbFile: newDbFileName.trim() })
      });
      const result = await response.json();
      if (response.ok && result.success) {
        alert(`🟢 ${result.message}`);
        setDbFile(result.dbFile);
        setNewDbFileName('');
        refreshDbFiles();
      } else {
        alert(`❌ 建立失敗: ${result.message}`);
      }
    } catch (error: any) {
      alert(`❌ 無法連線至伺服器進行建立: ${error.message}`);
    } finally {
      setCreatingDbFile(false);
    }
  };

  const handleAddRowHeader = () => setRowHeaders([
    ...rowHeaders, 
    { id: Date.now().toString(), excelColumn: '', dbFieldName: '', isGrouped: false, filterType: 'none', filterExpression: '' }
  ]);
  const handleRemoveRowHeader = (id: string) => setRowHeaders(rowHeaders.filter(row => row.id !== id));
  const handleUpdateRowHeader = (id: string, key: keyof RowHeaderMapping, value: any) => setRowHeaders(rowHeaders.map(row => row.id === id ? { ...row, [key]: value } : row));
  const handleUpdateTimeline = (key: string, value: any) => setTimeline(prev => ({ ...prev, [key]: value }));
  const handleAddSkipHeader = () => { if (newSkipInput.trim() && !skipHeaders.includes(newSkipInput.trim())) { setSkipHeaders([...skipHeaders, newSkipInput.trim()]); setNewSkipInput(''); } };
  const handleRemoveSkipHeader = (header: string) => setSkipHeaders(skipHeaders.filter(h => h !== header));

  const checkRegexMatch = (pattern: string, testValue: string) => {
    if (!pattern) return { valid: true, match: false };
    try {
      const regex = new RegExp(pattern);
      return { valid: true, match: regex.test(testValue || '') };
    } catch (e) {
      return { valid: false, match: false };
    }
  };

  const handleCheckTable = async () => {
    if (!targetTable.trim()) {
      setTableStatus({ type: 'error', text: '❌ 請先輸入目標資料庫 Table Name' });
      return;
    }
    if (!dbFile) {
      setTableStatus({ type: 'error', text: '❌ 請先建立或選擇本機 SQLite 資料庫檔案' });
      return;
    }
    setCheckingTable(true);
    setTableStatus(null);

    try {
      const response = await apiFetch('/api/spreadsheet/check-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTable: targetTable, dbFile: dbFile })
      });
      const result = await response.json();

      if (response.ok && result.success) {
        if (result.exists) {
          setTableStatus({ type: 'success', text: `🟢 ${result.message}` });
          fetchTableColumns(targetTable);
        } else {
          setTableStatus({ type: 'missing', text: `⚠️ 資料表 [${targetTable}] 目前不存在於本機資料庫。` });
          setDbFields([]);
        }
      } else {
        setTableStatus({ type: 'error', text: `❌ 錯誤: ${result.message}` });
      }
    } catch (error: any) {
      setTableStatus({ type: 'error', text: `❌ 無法連線至後端: ${error.message}` });
    } finally {
      setCheckingTable(false);
    }
  };

  const handleOpenCreateModal = () => {
    const activeFields = [
      ...rowHeaders.filter(r => r.dbFieldName).map(r => r.dbFieldName),
      timeline.dbYearField,
      timeline.dbItemField,
      timeline.dbValueField
    ].filter((v, i, self) => v && self.indexOf(v) === i);

    const initialPreview: DbField[] = activeFields.length > 0
      ? activeFields.map(name => {
          let defaultType = 'varchar';
          let defaultLen = '50';
          if (name.toLowerCase().includes('value') || name.toLowerCase().includes('share') || name.toLowerCase().includes('usage')) {
            defaultType = 'decimal';
            defaultLen = '';
          } else if (name.toLowerCase().includes('id') || name.toLowerCase().includes('count')) {
            defaultType = 'int';
            defaultLen = '';
          }
          return { name, type: defaultType, length: defaultLen, allowNull: true };
        })
      : [{ name: '', type: 'varchar', length: '50', allowNull: true }];

    setPreviewFields(initialPreview);
    setIsCreateModalOpen(true);
  };

  const handleUpdatePreviewField = (index: number, key: keyof DbField, value: any) => {
    setPreviewFields(prev => prev.map((f, i) => i === index ? { ...f, [key]: value } : f));
  };

  const handleExecuteCreateTable = async () => {
    if (previewFields.some(f => !f.name.trim())) {
      alert('請確認所有「資料行名稱」皆已填寫！');
      return;
    }
    if (!dbFile) {
      alert('請先建立或選擇本機 SQLite 資料庫檔案！');
      return;
    }

    setCheckingTable(true);
    setIsCreateModalOpen(false);

    try {
      const response = await apiFetch('/api/spreadsheet/check-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetTable: targetTable,
          fields: previewFields,
          dbFile: dbFile
        })
      });

      const result = await response.json();
      if (response.ok && result.success) {
        setTableStatus({ type: 'success', text: result.message });
        fetchTableColumns(targetTable);
      } else {
        setTableStatus({ type: 'error', text: `❌ 建表失敗: ${result.message}` });
      }
    } catch (error: any) {
      setTableStatus({ type: 'error', text: `❌ 連線失敗: ${error.message}` });
    } finally {
      setCheckingTable(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!templateName.trim()) {
      alert("❌ 請填寫範本顯示名稱！");
      return;
    }

    const configPayload = {
      templateCode: templateCode.toUpperCase().trim(),
      templateName: templateName.trim(),
      description: description.trim(),
      targetTable: targetTable.trim(),
      dataStartRow: dataStartRow,
      sheetMode: sheetMode,
      sheetValue: sheetValue,
      filename: filenameField.trim(), // 傳送資料庫對應的 filename 欄位值
      dbFile: dbFile,
      rowHeaders: rowHeaders.map(({ excelColumn, dbFieldName, isGrouped, filterType, filterExpression }) => ({
        excelColumn, dbFieldName, isGrouped, filterType, filterExpression
      })),
      timeline: timeline,
      skipHeaders: skipHeaders,
      macroScript: macroScript 
    };

    try {
      const response = await apiFetch('/api/spreadsheet/save-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configPayload)
      });
      const result = await response.json();
      if (response.ok && result.success) {
        alert(`💾 範本配置與資料庫檔名設定已成功同步儲存！`);
      } else {
        alert(`❌ 儲存失敗: ${result.message}`);
      }
    } catch (error: any) {
      alert("❌ 無法連線至後端伺服器進行儲存");
    }
  };

  const currentSelectedTemplateObj = dbTemplates.find(t => String(t.ID) === selectedTemplateCode || t.name === selectedTemplateCode);

  return (
    <div className="w-full text-slate-800 p-2 max-w-7xl mx-auto font-sans bg-white">
      
      {/* Master Top Header with Combined Dropdown Selection */}
      <div className="mb-6 border-b border-gray-200 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Excel 匯入範本設定 (XLSX Template Setup)</h2>
          <p className="text-sm text-gray-500 mt-1">本機 SQLite 專用整合介面</p>
        </div>
        
        <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg border border-slate-200">
          <label className="text-sm font-bold text-slate-700 shrink-0">📂 選擇範本：</label>
          <select 
            value={selectedTemplateCode} 
            onChange={(e) => setSelectedTemplateCode(e.target.value)}
            disabled={loadingTemplates}
            className="p-1.5 bg-white border border-slate-300 rounded md:w-64 font-medium text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="NEW">➕ 建立全新設定範本</option>
            {dbTemplates.map(t => (
              <option key={t.ID} value={t.name}>
                {t.ID} - {t.name} ({t.dbname})
              </option>
            ))}
          </select>
          {loadingTemplates && <span className="text-xs text-slate-500">載入中...</span>}
        </div>
      </div>

      {/* 📋 目標資料庫環境設定：本機 SQLite 檔案 */}
      <div className="bg-amber-50/40 p-5 rounded-xl border border-amber-200 mb-6">
        <label className="block text-sm font-bold text-amber-900 mb-3">⚡ 目標資料庫環境設定 (Local SQLite Target)</label>
        <p className="text-[11px] text-amber-700 mb-3">請先建立（或選擇既有的）本機 SQLite 資料庫檔案（.db），再將此範本綁定到該檔案。</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1">選擇既有的 .db 檔案</label>
            <select
              value={dbFile}
              onChange={e => setDbFile(e.target.value)}
              disabled={loadingDbFiles}
              className="w-full p-2 border border-gray-300 rounded-md bg-white font-mono text-sm"
            >
              <option value="">-- 尚未綁定資料庫檔案 --</option>
              {availableDbFiles.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">新增資料庫檔名</label>
            <input type="text" value={newDbFileName} onChange={e => setNewDbFileName(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md bg-white font-mono text-sm" placeholder="例如: epsidemodb.db" />
          </div>
          <button
            type="button"
            onClick={handleCreateDbFile}
            disabled={creatingDbFile}
            className="w-full py-2 px-4 bg-amber-600 text-white font-bold text-sm rounded-lg hover:bg-amber-700 transition-all shadow-sm disabled:opacity-50"
          >
            {creatingDbFile ? '⏳ 建立中...' : '🗄️ 建立並綁定 .db 檔案'}
          </button>
        </div>
        {dbFile && (
          <p className="text-xs text-amber-800 font-mono font-semibold mt-3">✅ 目前綁定的資料庫檔案：{dbFile}</p>
        )}
      </div>

      {/* 📋 步驟 1：定義範本基本資訊與動態資料庫檔名欄位 */}
      <div className="bg-blue-50/50 p-6 rounded-xl border border-blue-200 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-blue-200 pb-3 mb-4">
          <h3 className="text-lg font-bold text-blue-900 border-l-4 border-blue-600 pl-3">📋 步驟 1：定義範本基本資訊與檔名對應</h3>
          {selectedTemplateCode !== 'NEW' && currentSelectedTemplateObj && (
            <div className="bg-white/80 border border-blue-200 px-3 py-1.5 rounded-lg text-xs flex flex-wrap items-center gap-x-4 gap-y-1 shadow-sm">
              <span className="text-slate-500">目前選取狀態:</span>
              <span className="font-mono font-bold text-blue-700">ID: {currentSelectedTemplateObj.ID}</span>
              <span className="text-slate-300">|</span>
              <span className="font-semibold text-slate-800">名稱: {currentSelectedTemplateObj.name}</span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-600 truncate max-w-xs">描述: {currentSelectedTemplateObj.descriptionl || '(無)'}</span>
              <span className="text-slate-300">|</span>
              <span className="font-mono text-indigo-700 font-semibold">檔名 (filename): {filenameField || '未設定檔名'}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">範本識別碼 / ID（系統自動產生）</label>
            <input
              type="text"
              value={templateCode}
              disabled
              readOnly
              className="w-full p-2 border border-gray-300 rounded-md bg-gray-100 font-mono uppercase cursor-not-allowed"
              placeholder="系統自動產生"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">範本顯示名稱 (name)</label>
            <input 
              type="text" 
              value={templateName} 
              onChange={e => setTemplateName(e.target.value)} 
              className="w-full p-2 border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500" 
              placeholder="輸入範本名稱"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm font-semibold text-gray-700 mb-1">範本功能描述 (descriptionl)</label>
            <input 
              type="text" 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              className="w-full p-2 border border-gray-300 rounded-md bg-white" 
              placeholder="輸入範本詳細描述"
            />
          </div>
        </div>

        {/* 動態綁定資料庫 filename 欄位：從 Excel 檔案池選擇 */}
        <div className="bg-white/80 p-4 rounded-lg border border-blue-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-blue-900 mb-1">📁 從 Excel 檔案池選擇</label>
            <select
              value={poolFiles.some(f => f.fileName === filenameField) ? filenameField : ''}
              onChange={e => setFilenameField(e.target.value)}
              disabled={loadingPoolFiles}
              className="w-full p-2 border border-blue-300 rounded-md bg-white text-sm"
            >
              <option value="">-- 請選擇檔案池中的 Excel 檔案 --</option>
              {poolFiles.map(f => (
                <option key={f.fileName} value={f.fileName}>{f.displayName} ({f.fileName})</option>
              ))}
            </select>
            {!loadingPoolFiles && poolFiles.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1">檔案池目前沒有檔案，請先至「Like Excel List」頁面上傳。</p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-blue-900 mb-1">📂 資料庫對應檔名 (filename 欄位)</label>
            <input
              type="text"
              value={filenameField}
              readOnly
              className="w-full p-2 border border-blue-300 rounded-md bg-slate-100 font-mono text-sm text-blue-900 font-semibold cursor-not-allowed"
              placeholder="請於左側從檔案池選擇一個 Excel 檔案"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              * 此欄位直接對應資料庫中的 <code className="text-blue-700 font-bold">filename</code> 設定，由左側的檔案池選擇自動帶入。
            </p>
          </div>
        </div>
      </div>

      {/* 📋 步驟 2：工作表 (Worksheet) 與目標資料庫 */}
      <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 mb-6">
        <h3 className="text-lg font-bold text-slate-900 border-l-4 border-slate-500 pl-3 mb-4">⚙️ 步驟 2：工作表 (Worksheet) 與目標資料庫</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">本機 SQLite Table Name (dbname)</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={targetTable} 
                onChange={e => setTargetTable(e.target.value)} 
                className="flex-1 p-2 border border-gray-300 rounded-md bg-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" 
                placeholder="e.g. xlsx2dbqtyl1"
              />
              <button
                type="button"
                onClick={handleCheckTable}
                disabled={checkingTable}
                className="px-4 py-2 text-sm font-bold rounded-md bg-slate-700 hover:bg-slate-800 text-white shadow-sm transition-all shrink-0 disabled:opacity-50"
              >
                {checkingTable ? '⏳ 處理中...' : '🔍 檢查表格狀態'}
              </button>
            </div>

            {tableStatus && (
              <div className="mt-3">
                {tableStatus.type === 'error' && (
                  <div className="p-3 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                    {tableStatus.text}
                  </div>
                )}
                {tableStatus.type === 'success' && (
                  <div className="p-3 rounded-lg text-xs font-semibold bg-green-50 text-green-800 border border-green-200">
                    {tableStatus.text} <span className="block text-[11px] text-green-600 font-normal mt-0.5">已自動從實體資料庫連動同步 {dbFields.length} 個有效欄位。</span>
                  </div>
                )}
                {tableStatus.type === 'missing' && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 shadow-sm">
                    <p className="text-xs font-bold flex items-center gap-1">{tableStatus.text}</p>
                    <p className="text-[11px] text-amber-700 mt-1 mb-3">
                      系統可以引導您開啟 SQL Server 視覺化建表視窗，自訂或修改欄位結構。
                    </p>
                    <button
                      type="button"
                      onClick={handleOpenCreateModal}
                      className="w-full py-2 px-3 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded shadow transition-all flex items-center justify-center gap-1"
                    >
                      🛠️ 開啟實體資料表結構設定視窗
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">明細資料起始列 (rowstart)</label>
            <input type="number" min={1} value={dataStartRow} onChange={e => setDataStartRow(Number(e.target.value))} className="w-full p-2 border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="md:col-span-2 border-t border-gray-200 pt-3 mt-1">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Excel 指定工作表 (sheet)</label>
            <div className="flex gap-6 my-2 text-sm">
              <label className="inline-flex items-center cursor-pointer"><input type="radio" className="mr-2" checked={sheetMode === 'index'} onChange={() => { setSheetMode('index'); setSheetValue(1); }} /> 依分頁順序 (Index)</label>
              <label className="inline-flex items-center cursor-pointer"><input type="radio" className="mr-2" checked={sheetMode === 'name'} onChange={() => { setSheetMode('name'); setSheetValue(''); }} /> 依分頁名稱 (Sheet Name)</label>
            </div>
            <input type={sheetMode === 'index' ? 'number' : 'text'} value={sheetValue} onChange={e => setSheetValue(e.target.value)} className="w-full md:w-1/2 p-2 border border-gray-300 rounded-md bg-white" />
          </div>
        </div>
      </div>

      {/* 📋 步驟 3：固定維度欄位對應與 Regex 檢核 */}
      <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 mb-6">
        <h3 className="text-lg font-bold text-slate-900 border-l-4 border-slate-500 pl-3 mb-2">📌 步驟 3：固定維度欄位對應與 Regex 檢核</h3>
        <div className="overflow-x-auto">
          <table className="w-full mb-4 border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="p-2 text-sm font-bold text-gray-600 w-24">Excel 欄位</th>
                <th className="p-2 text-center w-6">➡️</th>
                <th className="p-2 text-sm font-bold text-gray-600 w-44">資料庫欄位 (Field)</th>
                <th className="p-2 text-sm font-bold text-gray-600 w-36">進階設定</th>
                <th className="p-2 text-sm font-bold text-gray-600 min-w-[450px]">⚙️ 正規表示式過濾條件與沙盒測試</th>
                <th className="p-2 text-sm font-bold text-gray-600 w-16">操作</th>
              </tr>
            </thead>
            <tbody>
              {rowHeaders.map((row) => {
                const testVal = testInputs[row.id] || '';
                const { valid, match } = checkRegexMatch(row.filterExpression, testVal);

                return (
                  <tr key={row.id} className="border-b border-gray-200 align-middle">
                    <td className="p-2">
                      <input type="text" value={row.excelColumn} onChange={e => handleUpdateRowHeader(row.id, 'excelColumn', e.target.value.toUpperCase())} className="w-full p-1.5 border border-gray-300 rounded uppercase font-mono text-sm" placeholder="A" />
                    </td>
                    <td className="p-2 text-center text-gray-400">➡️</td>
                    <td className="p-2">
                      <input
                        type="text"
                        list={`dbfield-options-${row.id}`}
                        value={row.dbFieldName}
                        onChange={e => handleUpdateRowHeader(row.id, 'dbFieldName', e.target.value)}
                        className="w-full p-1.5 border border-gray-300 rounded bg-white text-sm font-mono"
                        placeholder="輸入資料庫欄位名稱"
                      />
                      <datalist id={`dbfield-options-${row.id}`}>
                        {dbFields.map(f => (<option key={f.name} value={f.name}>{f.type}</option>))}
                      </datalist>
                    </td>
                    <td className="p-2">
                      <label className="inline-flex items-center text-xs text-gray-600 bg-white p-1.5 border border-gray-200 rounded w-full cursor-pointer select-none">
                        <input type="checkbox" className="mr-1 text-blue-600" checked={row.isGrouped} onChange={e => handleUpdateRowHeader(row.id, 'isGrouped', e.target.checked)} /> 遇空向下沿用
                      </label>
                    </td>
                    <td className="p-2">
                      <div className="flex flex-col gap-2 bg-slate-100 p-2 rounded border border-slate-200">
                        <div className="flex flex-wrap items-center gap-2">
                          <select value={row.filterType} onChange={e => handleUpdateRowHeader(row.id, 'filterType', e.target.value)} className="p-1 border text-xs bg-white rounded">
                            <option value="none">🟢 不檢查 (全部允許)</option>
                            <option value="not_empty">🚫 排除空值 (Not Empty)</option>
                            <option value="numeric">🔢 限制純數字 (^[0-9]+$)</option>
                            <option value="regex">🔍 符合 Regex 規則</option>
                          </select>

                          {row.filterType === 'regex' && (
                            <input 
                              type="text" value={row.filterExpression} onChange={e => handleUpdateRowHeader(row.id, 'filterExpression', e.target.value)}
                              className="flex-1 min-w-[180px] p-1 border rounded text-xs font-mono" placeholder="請輸入正規表示式"
                            />
                          )}
                        </div>

                        {row.filterType === 'regex' && (
                          <div className="flex gap-2 items-center border-t border-dashed border-gray-300 pt-1.5 mt-0.5">
                            <span className="text-[11px] font-bold text-gray-500 shrink-0">🧪 測試沙盒:</span>
                            <input 
                              type="text" value={testVal} onChange={e => setTestInputs({ ...testInputs, [row.id]: e.target.value })}
                              className="flex-1 p-1 border text-xs bg-white rounded" placeholder="輸入資料進行匹配測試"
                            />
                            {!valid ? (
                              <span className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-1.5 rounded">語法錯誤</span>
                            ) : testVal ? (
                              match ? (
                                <span className="text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 px-1.5 rounded">🟢 通過 (Match)</span>
                              ) : (
                                <span className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-1.5 rounded">❌ 阻擋 (Mismatch)</span>
                              )
                            ) : null}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-2">
                      <button type="button" onClick={() => handleRemoveRowHeader(row.id)} disabled={rowHeaders.length === 1} className="text-red-500 border border-red-200 bg-red-50 px-2 py-1.5 rounded text-xs disabled:opacity-50 w-full hover:bg-red-100 transition-all">刪除</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={handleAddRowHeader} className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-md shadow-sm font-medium hover:bg-gray-50 transition-all">+ 新增固定對應欄位</button>
      </div>

     {/* 📋 步驟 4：動態時間與項目軸設定 */}
<div className="bg-gray-50 p-6 rounded-xl border border-gray-200 mb-6 font-sans">
  <h3 className="text-lg font-bold text-slate-900 border-l-4 border-slate-500 pl-3 mb-2">⚡ 步驟 4：動態時間與項目軸設定 (xlsx2dbsetL3)</h3>
  <p className="text-xs text-gray-500 mb-4">設定矩陣範圍的起迄欄位、年份列、項目列以及空間跳過設定。</p>

  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">矩陣起始欄位 (Start Column)</label>
      <input 
        type="text" 
        value={timeline?.startColumn ?? ''} 
        onChange={e => handleUpdateTimeline('startColumn', e.target.value.toUpperCase())} 
        className="w-full p-2 border border-gray-300 rounded-md font-mono uppercase bg-white text-slate-800" 
        placeholder="E.g. Z" 
      />
    </div>
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">矩陣結束欄位 (End Column)</label>
      <input 
        type="text" 
        value={timeline?.endColumn ?? ''} 
        onChange={e => handleUpdateTimeline('endColumn', e.target.value.toUpperCase())} 
        className="w-full p-2 border border-gray-300 rounded-md font-mono uppercase bg-white text-slate-800" 
        placeholder="E.g. AH" 
      />
    </div>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-200 pt-4 mb-4">
    <div className="text-sm">
      <label className="block font-semibold text-gray-700 mb-2 text-xs">1. 年份設定軸 (Year Row)</label>
      <div className="flex items-center gap-2">
        <span>第</span>
        <input 
          type="number" 
          min={1} 
          value={timeline?.yearRow ?? 1} 
          onChange={e => handleUpdateTimeline('yearRow', Number(e.target.value))} 
          className="w-16 p-1.5 border border-gray-300 rounded text-center bg-white font-mono text-slate-800" 
        />
        <span>列</span>
      </div>
    </div>
    <div className="text-sm">
      <label className="block font-semibold text-gray-700 mb-2 text-xs">2. 項目設定軸 (Item Row)</label>
      <div className="flex items-center gap-2">
        <span>第</span>
        <input 
          type="number" 
          min={1} 
          value={timeline?.itemRow ?? 1} 
          onChange={e => handleUpdateTimeline('itemRow', Number(e.target.value))} 
          className="w-16 p-1.5 border border-gray-300 rounded text-center bg-white font-mono text-slate-800" 
        />
        <span>列</span>
      </div>
    </div>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-gray-200 pt-4 mb-4">
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">年份對應資料庫欄位 (DB Year Field)</label>
      <input
        type="text"
        value={timeline?.dbYearField ?? ''}
        onChange={e => handleUpdateTimeline('dbYearField', e.target.value)}
        className="w-full p-2 border border-gray-300 rounded-md font-mono bg-white text-slate-800"
        placeholder="E.g. Year"
      />
    </div>
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">項目對應資料庫欄位 (DB Item Field)</label>
      <input
        type="text"
        value={timeline?.dbItemField ?? ''}
        onChange={e => handleUpdateTimeline('dbItemField', e.target.value)}
        className="w-full p-2 border border-gray-300 rounded-md font-mono bg-white text-slate-800"
        placeholder="E.g. Month"
      />
    </div>
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">數值對應資料庫欄位 (DB Value Field)</label>
      <input
        type="text"
        value={timeline?.dbValueField ?? ''}
        onChange={e => handleUpdateTimeline('dbValueField', e.target.value)}
        className="w-full p-2 border border-gray-300 rounded-md font-mono bg-white text-slate-800"
        placeholder="E.g. Value"
      />
    </div>
  </div>

  <div className="border-t border-gray-200 pt-4">
    <label className="block text-xs font-semibold text-gray-700 mb-1">📐 空間跳過設定 (Skip Space)</label>
    <div className="flex items-center gap-2 max-w-xs">
      <input 
        type="number" 
        min={0}
        value={timeline?.skipSpace ?? 0} 
        onChange={e => handleUpdateTimeline('skipSpace', Number(e.target.value))} 
        className="w-24 p-1.5 border border-gray-300 text-xs rounded bg-white font-mono text-slate-800 text-center" 
        placeholder="0" 
      />
      <span className="text-xs text-gray-500">列/行間距或空白跳過設定值</span>
    </div>
  </div>
</div>

      {/* 🌟 步驟 5：自訂 JavaScript 巨集控制台 */}
      <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span className="text-amber-500">⚙️</span> 步驟 5：自訂 JavaScript 巨集指令碼控制台
          </h3>
          <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-mono font-bold tracking-wider">
            VBA ALTERNATIVE ENGINE
          </span>
        </div>
        
        <p className="text-xs text-slate-600 mb-4 leading-relaxed">
          當使用者在 LikeExcel 介面點擊 <span className="text-amber-700 font-bold">"VBA like"</span> 按鈕時，系統後端將會安全加載並動態執行下方區塊的指令。您可以編寫原生 JavaScript 邏輯，在寫入資料庫前，先行對試算表網格數據進行全自動化的格式清洗、空值置換、或自訂進階運算。
        </p>

        <div className="relative rounded-lg overflow-hidden border border-slate-300 bg-white shadow-inner">
          <div className="flex items-center justify-between bg-slate-100 px-4 py-2 text-xs text-slate-600 font-mono border-b border-slate-200">
            <span className="font-semibold text-slate-700">macro_script_sandbox.js</span>
            <button 
              type="button"
              onClick={() => { if(window.confirm("確定要將腳本還原成預設範本結構嗎？")) setMacroScript(DEFAULT_MACRO_TEMPLATE); }}
              className="text-amber-600 hover:text-amber-700 font-bold transition-colors"
            >
              🔄 還原預設範本
            </button>
          </div>
          
          <textarea
            value={macroScript}
            onChange={(e) => setMacroScript(e.target.value)}
            rows={10}
            className="w-full p-4 bg-white text-slate-800 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 leading-relaxed resize-y border-0"
            style={{ tabSize: 2 }}
            placeholder="// 請在此撰寫自訂的 JavaScript 巨集代碼..."
          />
        </div>
        
        <div className="mt-3 flex flex-wrap gap-2 items-center text-[11px] text-slate-500">
          <span className="text-slate-700 font-bold">💡 環境可用變數說明:</span>
          <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">rows</span> (當前試算表橫列資料陣列)
          <span className="text-slate-300">|</span>
          <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">console</span> (日誌追蹤輸出)
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end mt-8 border-t border-gray-200 pt-4">
        <button type="button" onClick={handleSaveConfig} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm text-lg transition-all transform active:scale-95">
          💾 {selectedTemplateCode === 'NEW' ? '儲存全新發布' : '更新目前範本設定'}
        </button>
      </div>

      {/* SQLite 表格設計工具彈窗 (Modal) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-300 w-full max-w-3xl overflow-hidden flex flex-col">
            
            <div className="bg-slate-800 text-white px-4 py-3 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-lg">📋</span>
                <div>
                  <h4 className="font-bold text-sm tracking-wide">本機資料表結構設計工具</h4>
                  <p className="text-[11px] text-slate-400">建立目標：{targetTable}</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-white text-xl font-bold">&times;</button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto max-h-[60vh]">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-300 bg-slate-50">
                    <th className="p-2 font-semibold text-gray-600">資料行名稱 (Column Name)</th>
                    <th className="p-2 font-semibold text-gray-600 w-36">資料類型 (Data Type)</th>
                    <th className="p-2 font-semibold text-gray-600 w-24">長度 (Length)</th>
                    <th className="p-2 font-semibold text-gray-600 w-24 text-center">允許 Null</th>
                  </tr>
                </thead>
                <tbody>
                  {previewFields.map((field, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="p-1.5">
                        <input type="text" value={field.name} onChange={e => handleUpdatePreviewField(idx, 'name', e.target.value)} className="w-full p-1 border rounded bg-white font-mono text-xs" />
                      </td>
                      <td className="p-1.5">
                        <select value={field.type} onChange={e => handleUpdatePreviewField(idx, 'type', e.target.value)} className="w-full p-1 border rounded bg-white text-xs">
                          {AVAILABLE_DATA_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </td>
                      <td className="p-1.5">
                        <input 
                          type="text" 
                          disabled={['int', 'datetime', 'float'].includes(field.type)} 
                          value={field.length || ''} 
                          onChange={e => handleUpdatePreviewField(idx, 'length', e.target.value)} 
                          className="w-full p-1 border rounded bg-white font-mono text-xs text-center disabled:bg-gray-100" 
                          placeholder={field.type === 'decimal' ? '18,4' : '50'}
                        />
                      </td>
                      <td className="p-1.5 text-center">
                        <input type="checkbox" checked={field.allowNull} onChange={e => handleUpdatePreviewField(idx, 'allowNull', e.target.checked)} className="rounded text-blue-600" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button 
                type="button" 
                onClick={() => setPreviewFields([...previewFields, { name: '', type: 'varchar', length: '50', allowNull: true }])} 
                className="mt-3 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1.5 rounded hover:bg-blue-100 transition-all"
              >
                + 新增自訂欄位 (Column)
              </button>
            </div>

            <div className="bg-slate-50 px-4 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-xs font-medium border border-gray-300 rounded bg-white hover:bg-gray-50">取消</button>
              <button type="button" onClick={handleExecuteCreateTable} className="px-4 py-2 text-xs font-bold bg-blue-600 text-white rounded hover:bg-blue-700 shadow-sm">⚡ 執行實體建表 SQL</button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default ExcelMappingSetup;