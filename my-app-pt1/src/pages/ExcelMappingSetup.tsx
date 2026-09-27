import React, { useState, useEffect, useRef, useMemo } from 'react';
import { apiFetch } from '../config/apiBase';
import { useT } from '../i18n/useI18n';
import dict from '../i18n/locales/excelMappingSetup';
import { listTopLevelFunctions } from '../utils/macroFunctions';

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

const DEFAULT_MACRO_TEMPLATE = '';

interface MacroLogLine {
  level: 'log' | 'info' | 'warn' | 'error' | 'system' | 'success';
  text: string;
}

const MACRO_LOG_COLORS: Record<MacroLogLine['level'], string> = {
  log: 'text-slate-200',
  info: 'text-sky-300',
  warn: 'text-amber-300',
  error: 'text-red-400',
  system: 'text-slate-500',
  success: 'text-emerald-400',
};

// 依步驟 3/4 的欄位對應產生試跑用的範例 rows（與後端 runUnpivotImport 產生的扁平紀錄同形）
function buildSampleRows(rowHeaders: RowHeaderMapping[], timeline: { dbYearField: string; dbItemField: string; dbValueField: string }) {
  const fixed = rowHeaders.map(h => h.dbFieldName.trim()).filter(Boolean);
  const yearField = timeline.dbYearField.trim() || 'Year';
  const itemField = timeline.dbItemField.trim() || 'Item';
  const valueField = timeline.dbValueField.trim() || 'Value';
  const values = [120, -5, null];
  return values.map((v, i) => {
    const row: Record<string, unknown> = {};
    (fixed.length ? fixed : ['Field1']).forEach(f => { row[f] = `${f}_${i + 1}`; });
    row[yearField] = String(new Date().getFullYear());
    row[itemField] = 'Qty';
    row[valueField] = v;
    return row;
  });
}

// 範本識別碼改為系統自動產生，不再開放使用者手動輸入/修改
function generateTemplateCode(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TPL-${ts}-${rand}`;
}

export const ExcelMappingSetup: React.FC = () => {
  const t = useT(dict);
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
  const [macroLogs, setMacroLogs] = useState<MacroLogLine[]>([]);
  const [macroRunning, setMacroRunning] = useState(false);
  const [macroEntry, setMacroEntry] = useState('');
  const macroFunctions = useMemo(() => listTopLevelFunctions(macroScript), [macroScript]);
  // 選取的函式被改名或刪除時，自動退回「執行整份腳本」
  const activeMacroEntry = macroFunctions.includes(macroEntry) ? macroEntry : '';
  const macroGutterRef = useRef<HTMLDivElement>(null);
  // 儲存後就地更新 dbTemplates 時，略過下一次「切換範本 → 重新套用欄位」的同步，避免把畫面上剛存的內容又蓋掉
  const skipNextTemplateSyncRef = useRef(false);

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
  if (skipNextTemplateSyncRef.current) {
    skipNextTemplateSyncRef.current = false;
    return;
  }
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
      
      setMacroScript(targetObj.macroScript ?? DEFAULT_MACRO_TEMPLATE);

      if (targetObj.dbname && targetObj.dbFile) {
        fetchTableColumns(targetObj.dbname, targetObj.dbFile);
      }
    }
  }
}, [selectedTemplateCode, dbTemplates]);

  const handleCreateDbFile = async () => {
    if (!newDbFileName.trim()) {
      alert(t('enterDbFileName'));
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
        alert(t('createFailed', { message: result.message }));
      }
    } catch (error: any) {
      alert(t('createConnectFailed', { message: error.message }));
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
      setTableStatus({ type: 'error', text: t('enterTableName') });
      return;
    }
    if (!dbFile) {
      setTableStatus({ type: 'error', text: t('selectDbFileFirst') });
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
          setTableStatus({ type: 'missing', text: t('tableMissing', { table: targetTable }) });
          setDbFields([]);
        }
      } else {
        setTableStatus({ type: 'error', text: t('errorPrefix', { message: result.message }) });
      }
    } catch (error: any) {
      setTableStatus({ type: 'error', text: t('backendConnectFailed', { message: error.message }) });
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
      alert(t('fillAllColumnNames'));
      return;
    }
    if (!dbFile) {
      alert(t('selectDbFileFirstAlert'));
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
        setTableStatus({ type: 'error', text: t('createTableFailed', { message: result.message }) });
      }
    } catch (error: any) {
      setTableStatus({ type: 'error', text: t('connectFailed', { message: error.message }) });
    } finally {
      setCheckingTable(false);
    }
  };

  // 🧪 步驟 5：在後端 vm 沙盒試跑巨集（與實際匯入同一個執行環境），結果顯示在右側除錯主控台
  // saveToFile：試跑成功後把 sheet.set() 改過的儲存格寫回步驟 1 選的檔案池原檔（不寫入資料庫）
  const handleRunMacro = async (saveToFile = false) => {
    if (macroRunning) return;
    if (saveToFile && !window.confirm(t('confirmRunSaveFile', { file: filenameField }))) return;
    const sampleRows = buildSampleRows(rowHeaders, timeline);
    setMacroRunning(true);
    // 步驟 1 選了檔案池檔案時，後端改用該檔案的實際工作表（sheet 可用、rows 為實際展開結果）
    const source = filenameField || '';
    setMacroLogs([{
      level: 'system',
      text: source
        ? (activeMacroEntry
          ? t('runFunctionStartedFile', { name: activeMacroEntry, file: source })
          : t('runStartedFile', { file: source }))
        : (activeMacroEntry
          ? t('runFunctionStarted', { name: activeMacroEntry, count: sampleRows.length })
          : t('runStarted', { count: sampleRows.length }))
    }]);
    try {
      const response = await apiFetch('/api/spreadsheet/run-macro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: macroScript, rows: sampleRows, entry: activeMacroEntry,
          fileName: source, sheetMode, sheetValue, dataStartRow, rowHeaders, timeline, skipHeaders, saveToFile, dbFile
        })
      });
      const result = await response.json();
      const lines: MacroLogLine[] = [...(result.logs || [])];
      if (result.success) {
        if (result.returnValue !== undefined) {
          lines.push({ level: 'system', text: t('returnValue') }, { level: 'log', text: result.returnValue });
        }
        lines.push({ level: 'system', text: t('rowCountAfterRun', { count: result.rowCount ?? 0 }) });
        if (result.savedToFile) {
          lines.push({ level: 'success', text: t('savedToFile', { file: result.savedToFile, cells: (result.changedCells || []).join(', ') }) });
        } else if (saveToFile) {
          lines.push({ level: 'warn', text: t('noCellChanges') });
        } else if (result.changedCells?.length) {
          // ▶ 執行只是試跑：提醒 sheet.set() 的修改沒有存進檔案
          lines.push({ level: 'warn', text: t('testRunNotSaved', { cells: result.changedCells.join(', ') }) });
        }
        lines.push({ level: 'success', text: t('runFinished', { ms: result.durationMs }) });
      } else {
        lines.push(
          { level: 'error', text: result.error || result.message || 'Error' },
          { level: 'error', text: t('runFailed', { ms: result.durationMs ?? 0 }) }
        );
      }
      setMacroLogs(prev => [...prev, ...lines]);
    } catch (err: any) {
      setMacroLogs(prev => [...prev, { level: 'error', text: t('runNetworkError', { message: err.message }) }]);
    } finally {
      setMacroRunning(false);
    }
  };

  const handleMacroKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRunMacro();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart, selectionEnd } = el;
      const next = macroScript.slice(0, selectionStart) + '  ' + macroScript.slice(selectionEnd);
      setMacroScript(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = selectionStart + 2; });
    }
  };

  const handleSaveConfig = async () => {
    if (!templateName.trim()) {
      alert(t('enterTemplateName'));
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
        // 同步本機範本清單（與 get-templates 回傳同形），之後切換回這個範本時才會看到剛存的內容（含步驟 5 巨集）
        const savedEntry = {
          ID: configPayload.templateCode,
          name: configPayload.templateName,
          dbname: configPayload.targetTable,
          descriptionl: configPayload.description,
          sheet: configPayload.sheetValue,
          rowstart: configPayload.dataStartRow,
          filename: configPayload.filename,
          dbFile: configPayload.dbFile,
          rowHeaders: configPayload.rowHeaders,
          skipHeaders: configPayload.skipHeaders,
          macroScript: configPayload.macroScript,
          l3Settings: {
            startCol: timeline.startColumn,
            endCol: timeline.endColumn,
            yearRow: timeline.yearRow,
            itemRow: timeline.itemRow,
            skipSpace: timeline.skipSpace,
            dbYearField: timeline.dbYearField,
            dbItemField: timeline.dbItemField,
            dbValueField: timeline.dbValueField,
          },
        };
        skipNextTemplateSyncRef.current = true;
        setDbTemplates(prev => prev.some(t => String(t.ID) === savedEntry.ID)
          ? prev.map(t => String(t.ID) === savedEntry.ID ? { ...t, ...savedEntry } : t)
          : [...prev, savedEntry]);
        alert(t('saveSuccess'));
      } else {
        alert(t('saveFailed', { message: result.message }));
      }
    } catch (error: any) {
      alert(t('saveConnectFailed'));
    }
  };

  const currentSelectedTemplateObj = dbTemplates.find(t => String(t.ID) === selectedTemplateCode || t.name === selectedTemplateCode);

  return (
    <div className="w-full text-slate-800 p-2 max-w-7xl mx-auto font-sans bg-white">
      
      {/* Master Top Header with Combined Dropdown Selection */}
      <div className="mb-6 border-b border-gray-200 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('pageTitle')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('pageSubtitle')}</p>
        </div>
        
        <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg border border-slate-200">
          <label className="text-sm font-bold text-slate-700 shrink-0">{t('selectTemplate')}</label>
          <select 
            value={selectedTemplateCode} 
            onChange={(e) => setSelectedTemplateCode(e.target.value)}
            disabled={loadingTemplates}
            className="p-1.5 bg-white border border-slate-300 rounded md:w-64 font-medium text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="NEW">{t('createNewTemplate')}</option>
            {dbTemplates.map(t => (
              <option key={t.ID} value={t.name}>
                {t.ID} - {t.name} ({t.dbname})
              </option>
            ))}
          </select>
          {loadingTemplates && <span className="text-xs text-slate-500">{t('loading')}</span>}
        </div>
      </div>

      {/* 📋 目標資料庫環境設定：本機 SQLite 檔案 */}
      <div className="bg-amber-50/40 p-5 rounded-xl border border-amber-200 mb-6">
        <label className="block text-sm font-bold text-amber-900 mb-3">{t('dbTargetTitle')}</label>
        <p className="text-[11px] text-amber-700 mb-3">{t('dbTargetHint')}</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1">{t('selectExistingDb')}</label>
            <select
              value={dbFile}
              onChange={e => setDbFile(e.target.value)}
              disabled={loadingDbFiles}
              className="w-full p-2 border border-gray-300 rounded-md bg-white font-mono text-sm"
            >
              <option value="">{t('noDbBound')}</option>
              {availableDbFiles.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">{t('newDbFileName')}</label>
            <input type="text" value={newDbFileName} onChange={e => setNewDbFileName(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md bg-white font-mono text-sm" placeholder={t('newDbFilePlaceholder')} />
          </div>
          <button
            type="button"
            onClick={handleCreateDbFile}
            disabled={creatingDbFile}
            className="w-full py-2 px-4 bg-amber-600 text-white font-bold text-sm rounded-lg hover:bg-amber-700 transition-all shadow-sm disabled:opacity-50"
          >
            {creatingDbFile ? t('creating') : t('createAndBindDb')}
          </button>
        </div>
        {dbFile && (
          <p className="text-xs text-amber-800 font-mono font-semibold mt-3">{t('currentDbFile', { dbFile })}</p>
        )}
      </div>

      {/* 📋 步驟 1：定義範本基本資訊與動態資料庫檔名欄位 */}
      <div className="bg-blue-50/50 p-6 rounded-xl border border-blue-200 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-blue-200 pb-3 mb-4">
          <h3 className="text-lg font-bold text-blue-900 border-l-4 border-blue-600 pl-3">{t('step1Title')}</h3>
          {selectedTemplateCode !== 'NEW' && currentSelectedTemplateObj && (
            <div className="bg-white/80 border border-blue-200 px-3 py-1.5 rounded-lg text-xs flex flex-wrap items-center gap-x-4 gap-y-1 shadow-sm">
              <span className="text-slate-500">{t('currentSelection')}</span>
              <span className="font-mono font-bold text-blue-700">ID: {currentSelectedTemplateObj.ID}</span>
              <span className="text-slate-300">|</span>
              <span className="font-semibold text-slate-800">{t('nameLabel', { name: currentSelectedTemplateObj.name })}</span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-600 truncate max-w-xs">{t('descriptionLabel', { description: currentSelectedTemplateObj.descriptionl || t('none') })}</span>
              <span className="text-slate-300">|</span>
              <span className="font-mono text-indigo-700 font-semibold">{t('filenameLabel', { filename: filenameField || t('filenameNotSet') })}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('templateIdLabel')}</label>
            <input
              type="text"
              value={templateCode}
              disabled
              readOnly
              className="w-full p-2 border border-gray-300 rounded-md bg-gray-100 font-mono uppercase cursor-not-allowed"
              placeholder={t('autoGenerated')}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('templateNameLabel')}</label>
            <input 
              type="text" 
              value={templateName} 
              onChange={e => setTemplateName(e.target.value)} 
              className="w-full p-2 border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500" 
              placeholder={t('templateNamePlaceholder')}
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('templateDescLabel')}</label>
            <input 
              type="text" 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              className="w-full p-2 border border-gray-300 rounded-md bg-white" 
              placeholder={t('templateDescPlaceholder')}
            />
          </div>
        </div>

        {/* 動態綁定資料庫 filename 欄位：從 Excel 檔案池選擇 */}
        <div className="bg-white/80 p-4 rounded-lg border border-blue-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-blue-900 mb-1">{t('pickFromPool')}</label>
            <select
              value={poolFiles.some(f => f.fileName === filenameField) ? filenameField : ''}
              onChange={e => setFilenameField(e.target.value)}
              disabled={loadingPoolFiles}
              className="w-full p-2 border border-blue-300 rounded-md bg-white text-sm"
            >
              <option value="">{t('pickPoolFilePlaceholder')}</option>
              {poolFiles.map(f => (
                <option key={f.fileName} value={f.fileName}>{f.displayName} ({f.fileName})</option>
              ))}
            </select>
            {!loadingPoolFiles && poolFiles.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1">{t('poolEmpty')}</p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-blue-900 mb-1">{t('dbFilenameLabel')}</label>
            <input
              type="text"
              value={filenameField}
              readOnly
              className="w-full p-2 border border-blue-300 rounded-md bg-slate-100 font-mono text-sm text-blue-900 font-semibold cursor-not-allowed"
              placeholder={t('dbFilenamePlaceholder')}
            />
            <p className="text-[11px] text-slate-500 mt-1">
              {t('dbFilenameHintBefore')} <code className="text-blue-700 font-bold">filename</code> {t('dbFilenameHintAfter')}
            </p>
          </div>
        </div>
      </div>

      {/* 📋 步驟 2：工作表 (Worksheet) 與目標資料庫 */}
      <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 mb-6">
        <h3 className="text-lg font-bold text-slate-900 border-l-4 border-slate-500 pl-3 mb-4">{t('step2Title')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('tableNameLabel')}</label>
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
                {checkingTable ? t('processing') : t('checkTable')}
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
                    {tableStatus.text} <span className="block text-[11px] text-green-600 font-normal mt-0.5">{t('columnsSynced', { count: dbFields.length })}</span>
                  </div>
                )}
                {tableStatus.type === 'missing' && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 shadow-sm">
                    <p className="text-xs font-bold flex items-center gap-1">{tableStatus.text}</p>
                    <p className="text-[11px] text-amber-700 mt-1 mb-3">
                      {t('createTableHint')}
                    </p>
                    <button
                      type="button"
                      onClick={handleOpenCreateModal}
                      className="w-full py-2 px-3 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded shadow transition-all flex items-center justify-center gap-1"
                    >
                      {t('openTableDesigner')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('dataStartRow')}</label>
            <input type="number" min={1} value={dataStartRow} onChange={e => setDataStartRow(Number(e.target.value))} className="w-full p-2 border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="md:col-span-2 border-t border-gray-200 pt-3 mt-1">
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('sheetLabel')}</label>
            <div className="flex gap-6 my-2 text-sm">
              <label className="inline-flex items-center cursor-pointer"><input type="radio" className="mr-2" checked={sheetMode === 'index'} onChange={() => { setSheetMode('index'); setSheetValue(1); }} /> {t('byIndex')}</label>
              <label className="inline-flex items-center cursor-pointer"><input type="radio" className="mr-2" checked={sheetMode === 'name'} onChange={() => { setSheetMode('name'); setSheetValue(''); }} /> {t('byName')}</label>
            </div>
            <input type={sheetMode === 'index' ? 'number' : 'text'} value={sheetValue} onChange={e => setSheetValue(e.target.value)} className="w-full md:w-1/2 p-2 border border-gray-300 rounded-md bg-white" />
          </div>
        </div>
      </div>

      {/* 📋 步驟 3：固定維度欄位對應與 Regex 檢核 */}
      <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 mb-6">
        <h3 className="text-lg font-bold text-slate-900 border-l-4 border-slate-500 pl-3 mb-2">{t('step3Title')}</h3>
        <div className="overflow-x-auto">
          <table className="w-full mb-4 border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="p-2 text-sm font-bold text-gray-600 w-24">{t('excelColumn')}</th>
                <th className="p-2 text-center w-6">➡️</th>
                <th className="p-2 text-sm font-bold text-gray-600 w-44">{t('dbField')}</th>
                <th className="p-2 text-sm font-bold text-gray-600 w-36">{t('advanced')}</th>
                <th className="p-2 text-sm font-bold text-gray-600 min-w-[450px]">{t('regexHeader')}</th>
                <th className="p-2 text-sm font-bold text-gray-600 w-16">{t('actions')}</th>
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
                        placeholder={t('dbFieldPlaceholder')}
                      />
                      <datalist id={`dbfield-options-${row.id}`}>
                        {dbFields.map(f => (<option key={f.name} value={f.name}>{f.type}</option>))}
                      </datalist>
                    </td>
                    <td className="p-2">
                      <label className="inline-flex items-center text-xs text-gray-600 bg-white p-1.5 border border-gray-200 rounded w-full cursor-pointer select-none">
                        <input type="checkbox" className="mr-1 text-blue-600" checked={row.isGrouped} onChange={e => handleUpdateRowHeader(row.id, 'isGrouped', e.target.checked)} /> {t('fillDown')}
                      </label>
                    </td>
                    <td className="p-2">
                      <div className="flex flex-col gap-2 bg-slate-100 p-2 rounded border border-slate-200">
                        <div className="flex flex-wrap items-center gap-2">
                          <select value={row.filterType} onChange={e => handleUpdateRowHeader(row.id, 'filterType', e.target.value)} className="p-1 border text-xs bg-white rounded">
                            <option value="none">{t('filterNone')}</option>
                            <option value="not_empty">{t('filterNotEmpty')}</option>
                            <option value="numeric">{t('filterNumeric')}</option>
                            <option value="regex">{t('filterRegex')}</option>
                          </select>

                          {row.filterType === 'regex' && (
                            <input 
                              type="text" value={row.filterExpression} onChange={e => handleUpdateRowHeader(row.id, 'filterExpression', e.target.value)}
                              className="flex-1 min-w-[180px] p-1 border rounded text-xs font-mono" placeholder={t('regexPlaceholder')}
                            />
                          )}
                        </div>

                        {row.filterType === 'regex' && (
                          <div className="flex gap-2 items-center border-t border-dashed border-gray-300 pt-1.5 mt-0.5">
                            <span className="text-[11px] font-bold text-gray-500 shrink-0">{t('testSandbox')}</span>
                            <input 
                              type="text" value={testVal} onChange={e => setTestInputs({ ...testInputs, [row.id]: e.target.value })}
                              className="flex-1 p-1 border text-xs bg-white rounded" placeholder={t('testPlaceholder')}
                            />
                            {!valid ? (
                              <span className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-1.5 rounded">{t('syntaxError')}</span>
                            ) : testVal ? (
                              match ? (
                                <span className="text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 px-1.5 rounded">{t('matchPass')}</span>
                              ) : (
                                <span className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-1.5 rounded">{t('matchBlock')}</span>
                              )
                            ) : null}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-2">
                      <button type="button" onClick={() => handleRemoveRowHeader(row.id)} disabled={rowHeaders.length === 1} className="text-red-500 border border-red-200 bg-red-50 px-2 py-1.5 rounded text-xs disabled:opacity-50 w-full hover:bg-red-100 transition-all">{t('delete')}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={handleAddRowHeader} className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-md shadow-sm font-medium hover:bg-gray-50 transition-all">{t('addFixedColumn')}</button>
      </div>

     {/* 📋 步驟 4：動態時間與項目軸設定 */}
<div className="bg-gray-50 p-6 rounded-xl border border-gray-200 mb-6 font-sans">
  <h3 className="text-lg font-bold text-slate-900 border-l-4 border-slate-500 pl-3 mb-2">{t('step4Title')}</h3>
  <p className="text-xs text-gray-500 mb-4">{t('step4Hint')}</p>

  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{t('startColumn')}</label>
      <input 
        type="text" 
        value={timeline?.startColumn ?? ''} 
        onChange={e => handleUpdateTimeline('startColumn', e.target.value.toUpperCase())} 
        className="w-full p-2 border border-gray-300 rounded-md font-mono uppercase bg-white text-slate-800" 
        placeholder="E.g. Z" 
      />
    </div>
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{t('endColumn')}</label>
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
      <label className="block font-semibold text-gray-700 mb-2 text-xs">{t('yearAxis')}</label>
      <div className="flex items-center gap-2">
        {t('rowPrefix') && <span>{t('rowPrefix')}</span>}
        <input 
          type="number" 
          min={1} 
          value={timeline?.yearRow ?? 1} 
          onChange={e => handleUpdateTimeline('yearRow', Number(e.target.value))} 
          className="w-16 p-1.5 border border-gray-300 rounded text-center bg-white font-mono text-slate-800" 
        />
        {t('rowSuffix') && <span>{t('rowSuffix')}</span>}
      </div>
    </div>
    <div className="text-sm">
      <label className="block font-semibold text-gray-700 mb-2 text-xs">{t('itemAxis')}</label>
      <div className="flex items-center gap-2">
        {t('rowPrefix') && <span>{t('rowPrefix')}</span>}
        <input 
          type="number" 
          min={1} 
          value={timeline?.itemRow ?? 1} 
          onChange={e => handleUpdateTimeline('itemRow', Number(e.target.value))} 
          className="w-16 p-1.5 border border-gray-300 rounded text-center bg-white font-mono text-slate-800" 
        />
        {t('rowSuffix') && <span>{t('rowSuffix')}</span>}
      </div>
    </div>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-gray-200 pt-4 mb-4">
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{t('dbYearField')}</label>
      <input
        type="text"
        value={timeline?.dbYearField ?? ''}
        onChange={e => handleUpdateTimeline('dbYearField', e.target.value)}
        className="w-full p-2 border border-gray-300 rounded-md font-mono bg-white text-slate-800"
        placeholder="E.g. Year"
      />
    </div>
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{t('dbItemField')}</label>
      <input
        type="text"
        value={timeline?.dbItemField ?? ''}
        onChange={e => handleUpdateTimeline('dbItemField', e.target.value)}
        className="w-full p-2 border border-gray-300 rounded-md font-mono bg-white text-slate-800"
        placeholder="E.g. Month"
      />
    </div>
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{t('dbValueField')}</label>
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
    <label className="block text-xs font-semibold text-gray-700 mb-1">{t('skipSpace')}</label>
    <div className="flex items-center gap-2 max-w-xs">
      <input 
        type="number" 
        min={0}
        value={timeline?.skipSpace ?? 0} 
        onChange={e => handleUpdateTimeline('skipSpace', Number(e.target.value))} 
        className="w-24 p-1.5 border border-gray-300 text-xs rounded bg-white font-mono text-slate-800 text-center" 
        placeholder="0" 
      />
      <span className="text-xs text-gray-500">{t('skipSpaceHint')}</span>
    </div>
  </div>
</div>

      {/* 🌟 步驟 5：自訂 JavaScript 巨集控制台 */}
      <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span className="text-amber-500">⚙️</span> {t('step5Title')}
          </h3>
          <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-mono font-bold tracking-wider">
            VBA ALTERNATIVE ENGINE
          </span>
        </div>
        
        <p className="text-xs text-slate-600 mb-4 leading-relaxed">
          {t('step5DescBefore')} <span className="text-amber-700 font-bold">"VBA like"</span> {t('step5DescAfter')}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 左側：程式碼編輯器 */}
          <div className="flex flex-col rounded-lg overflow-hidden border border-slate-300 bg-white shadow-inner">
            <div className="flex items-center justify-between bg-slate-100 px-4 py-2 text-xs text-slate-600 font-mono border-b border-slate-200">
              <span className="font-semibold text-slate-700">macro_script_sandbox.js</span>
              <div className="flex items-center gap-3">
                <select
                  value={activeMacroEntry}
                  onChange={(e) => setMacroEntry(e.target.value)}
                  title={t('selectFunction')}
                  className="max-w-[12rem] px-2 py-1 border border-slate-300 rounded bg-white text-slate-700 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">{t('runWholeScript')}</option>
                  {macroFunctions.map(name => <option key={name} value={name}>{name}()</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => { if (!macroScript || window.confirm(t('confirmClearMacro'))) setMacroScript(''); }}
                  className="text-slate-500 hover:text-slate-700 font-bold transition-colors"
                >
                  {t('clearConsole')}
                </button>
                <button
                  type="button"
                  onClick={() => handleRunMacro(true)}
                  disabled={macroRunning || !filenameField}
                  title={filenameField ? t('runAndSaveTitle', { file: filenameField }) : t('runAndSaveNeedsFile')}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold rounded shadow-sm transition-colors"
                >
                  {t('runAndSave')}
                </button>
                <button
                  type="button"
                  onClick={() => handleRunMacro()}
                  disabled={macroRunning}
                  title="Ctrl+Enter"
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-bold rounded shadow-sm transition-colors"
                >
                  {macroRunning ? t('runningMacro') : t('runMacro')}
                </button>
              </div>
            </div>

            <div className="flex h-96">
              <div
                ref={macroGutterRef}
                className="select-none overflow-hidden bg-slate-50 border-r border-slate-200 py-4 px-2 text-right font-mono text-xs leading-relaxed text-slate-400"
              >
                {macroScript.split('\n').map((_, i) => <div key={i}>{i + 1}</div>)}
              </div>
              <textarea
                value={macroScript}
                onChange={(e) => setMacroScript(e.target.value)}
                onKeyDown={handleMacroKeyDown}
                onScroll={(e) => { if (macroGutterRef.current) macroGutterRef.current.scrollTop = e.currentTarget.scrollTop; }}
                spellCheck={false}
                wrap="off"
                className="flex-1 p-4 bg-white text-slate-800 font-mono text-xs focus:outline-none leading-relaxed resize-none border-0 whitespace-pre overflow-auto"
                style={{ tabSize: 2 }}
                placeholder={t('macroPlaceholder')}
              />
            </div>
          </div>

          {/* 右側：除錯主控台 */}
          <div className="flex flex-col rounded-lg overflow-hidden border border-slate-700 bg-slate-900 shadow-inner">
            <div className="flex items-center justify-between bg-slate-800 px-4 py-2 text-xs font-mono border-b border-slate-700">
              <span className="font-semibold text-slate-200">{t('debugConsole')}</span>
              <button
                type="button"
                onClick={() => setMacroLogs([])}
                className="text-slate-400 hover:text-slate-200 font-bold transition-colors"
              >
                {t('clearConsole')}
              </button>
            </div>
            <div className="h-96 overflow-auto p-4 font-mono text-xs leading-relaxed">
              {macroLogs.length === 0 ? (
                <div className="text-slate-500">{t('consoleEmpty')}</div>
              ) : (
                macroLogs.map((line, i) => (
                  <pre key={i} className={`whitespace-pre-wrap break-words ${MACRO_LOG_COLORS[line.level] || MACRO_LOG_COLORS.log}`}>{line.text}</pre>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 items-center text-[11px] text-slate-500">
          <span className="text-slate-700 font-bold">{t('envVars')}</span>
          <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">rows</span> {t('rowsDesc')}
          <span className="text-slate-300">|</span>
          <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">sheet</span> {t('sheetDesc')}
          <span className="text-slate-300">|</span>
          <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">db</span> {t('dbDesc')}
          <span className="text-slate-300">|</span>
          <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">console</span> {t('consoleDesc')}
          <span className="text-slate-300">|</span>
          <span>{t('sampleRowsHint')}</span>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end mt-8 border-t border-gray-200 pt-4">
        <button type="button" onClick={handleSaveConfig} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm text-lg transition-all transform active:scale-95">
          💾 {selectedTemplateCode === 'NEW' ? t('saveNew') : t('updateTemplate')}
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
                  <h4 className="font-bold text-sm tracking-wide">{t('tableDesignerTitle')}</h4>
                  <p className="text-[11px] text-slate-400">{t('createTarget', { table: targetTable })}</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-white text-xl font-bold">&times;</button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto max-h-[60vh]">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-300 bg-slate-50">
                    <th className="p-2 font-semibold text-gray-600">{t('columnName')}</th>
                    <th className="p-2 font-semibold text-gray-600 w-36">{t('dataType')}</th>
                    <th className="p-2 font-semibold text-gray-600 w-24">{t('length')}</th>
                    <th className="p-2 font-semibold text-gray-600 w-24 text-center">{t('allowNull')}</th>
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
                {t('addColumn')}
              </button>
            </div>

            <div className="bg-slate-50 px-4 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-xs font-medium border border-gray-300 rounded bg-white hover:bg-gray-50">{t('cancel')}</button>
              <button type="button" onClick={handleExecuteCreateTable} className="px-4 py-2 text-xs font-bold bg-blue-600 text-white rounded hover:bg-blue-700 shadow-sm">{t('executeCreateTable')}</button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default ExcelMappingSetup;