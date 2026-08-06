import React, { useState, useEffect } from 'react';

// ==========================================
// 1. TypeScript Interfaces & Definitions
// ==========================================
export interface DbField {
  name: string;
  type: string;
  length?: string;     // 欄位長度，例如 50, 255, 'MAX'
  allowNull: boolean;  // 允許 Null (類似 SQL Server 的核取方塊)
}

export interface RowHeaderMapping {
  id: string;
  excelColumn: string;
  dbFieldName: string;
  isGrouped: boolean;
  filterType: 'none' | 'not_empty' | 'numeric' | 'regex'; 
  filterExpression: string; 
}

export interface ExcelTemplateMasterConfig {
  templateCode: string;
  templateName: string;
  description: string;
  targetTable: string;
  worksheetSelectionMode: 'name' | 'index';
  worksheetValue: string | number;
  dataStartRow: number;
  rowHeaders: Omit<RowHeaderMapping, 'id'>[];
  timelineConfig: {
    startColumn: string;
    endColumn: string;
    yearRow: number;
    dbYearField: string;
    itemRow: number;
    dbItemField: string;
    dbValueField: string;
    skipHeaders: string[];
  };
  // 新增擴充屬性
  dbConfig?: {
    host: string;
    user: string;
  };
  uploadedFilePath?: string;
}

// 支援選擇的 SQL 資料型態
const AVAILABLE_DATA_TYPES = [
  { value: 'varchar', label: 'varchar' },
  { value: 'nvarchar', label: 'nvarchar' },
  { value: 'int', label: 'int' },
  { value: 'decimal', label: 'decimal(18,4)' },
  { value: 'datetime', label: 'datetime' },
  { value: 'float', label: 'float' },
];

// 模擬已儲存的範本
const mockSavedTemplates: Partial<ExcelTemplateMasterConfig>[] = [
  {
    templateCode: 'NV_MTRX_TEMPLATE_01',
    templateName: 'NVIDIA 矩陣需求預估範本',
    description: '用於每月初匯入由 CM 提供的多層級動態月份預估報表',
    targetTable: 'dbo.factory_demand_forecast',
    worksheetSelectionMode: 'index',
    worksheetValue: 1,
    dataStartRow: 4,
    rowHeaders: [
      { excelColumn: 'B', dbFieldName: 'cm', isGrouped: true, filterType: 'not_empty', filterExpression: '' },
      { excelColumn: 'C', dbFieldName: 'application', isGrouped: true, filterType: 'none', filterExpression: '' },
      { excelColumn: 'D', dbFieldName: 'part_number', isGrouped: false, filterType: 'regex', filterExpression: '^[0-9]{2}-[0-9]{5}$' }
    ] as any,
    timelineConfig: {
      startColumn: 'Z',
      endColumn: 'AH',
      yearRow: 2,
      dbYearField: 'year',
      itemRow: 3,
      dbItemField: 'item',
      dbValueField: 'value',
      skipHeaders: ['vsLT', 'CQ2']
    }
  }
];

export const ExcelMappingSetup: React.FC = () => {
  const [selectedTemplateCode, setSelectedTemplateCode] = useState<string>('NEW');

  // ==========================================
  // 🌟 新增狀態：Excel 檔案上傳與資料庫連線
  // ==========================================
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [serverFilePath, setServerFilePath] = useState(''); // 記錄 Server 回傳的儲存路徑

  const [dbHost, setDbHost] = useState('127.0.0.1');
  const [dbUser, setDbUser] = useState('');
  const [dbPassword, setDbPassword] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);

  // ==========================================
  // 核心狀態管理 (步驟 1 & 步驟 2)
  // ==========================================
  const [templateCode, setTemplateCode] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [description, setDescription] = useState('');
  const [targetTable, setTargetTable] = useState('');
  const [sheetMode, setSheetMode] = useState<'name' | 'index'>('index');
  const [sheetValue, setSheetValue] = useState<string | number>(1);
  const [dataStartRow, setDataStartRow] = useState<number>(1);
  
  // 檢查資料表狀態看板
  const [tableStatus, setTableStatus] = useState<{ type: 'success' | 'missing' | 'error'; text: string } | null>(null);
  const [checkingTable, setCheckingTable] = useState(false);

  // 🌟 SQL Server 介面式彈窗控制狀態
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [previewFields, setPreviewFields] = useState<DbField[]>([]);

  // 🌟 新增動態狀態：儲存從後端取回的真實資料表欄位清單
  const [dbFields, setDbFields] = useState<{ name: string; type: string }[]>([]);

  // ==========================================
  // 核心狀態管理 (步驟 3 固定維度欄位對應)
  // ==========================================
  const [rowHeaders, setRowHeaders] = useState<RowHeaderMapping[]>([
    { id: '1', excelColumn: '', dbFieldName: '', isGrouped: false, filterType: 'none', filterExpression: '' }
  ]);
  const [testInputs, setTestInputs] = useState<Record<string, string>>({}); // 測試 Regex 用沙盒

  // ==========================================
  // 核心狀態管理 (步驟 4 動態時間與項目軸)
  // ==========================================
  const [timeline, setTimeline] = useState({
    startColumn: '',
    endColumn: '',
    yearRow: 1,
    dbYearField: '',
    itemRow: 1,
    dbItemField: '',
    dbValueField: '',
  });
  const [skipHeaders, setSkipHeaders] = useState<string[]>([]);
  const [newSkipInput, setNewSkipInput] = useState('');

  // 🌟 根據當前的資料表名稱向後端請求實體欄位資訊
  const fetchTableColumns = async (tableNameToFetch: string) => {
    if (!tableNameToFetch.trim()) return;
    try {
      const response = await fetch(`http://localhost:3000/api/spreadsheet/get-table-columns?targetTable=${encodeURIComponent(tableNameToFetch)}`);
      const result = await response.json();
      if (response.ok && result.success) {
        setDbFields(result.fields);
      } else {
        setDbFields([]);
      }
    } catch (err) {
      console.error("動態獲取資料表欄位失敗:", err);
      setDbFields([]);
    }
  };

  // ==========================================
  // 副作用：切換範本載入數據
  // ==========================================
  useEffect(() => {
    setTableStatus(null); 
    if (selectedTemplateCode === 'NEW') {
      setTemplateCode('');
      setTemplateName('');
      setDescription('');
      setTargetTable('');
      setSheetMode('index');
      setSheetValue(1);
      setDataStartRow(1);
      setRowHeaders([{ id: '1', excelColumn: '', dbFieldName: '', isGrouped: false, filterType: 'none', filterExpression: '' }]);
      setTimeline({ startColumn: '', endColumn: '', yearRow: 1, dbYearField: '', itemRow: 1, dbItemField: '', dbValueField: '' });
      setSkipHeaders([]);
      setTestInputs({});
      setDbFields([]);
      setServerFilePath('');
      setSelectedFile(null);
    } else {
      const targetObj = mockSavedTemplates.find(t => t.templateCode === selectedTemplateCode);
      if (targetObj) {
        setTemplateCode(targetObj.templateCode || '');
        setTemplateName(targetObj.templateName || '');
        setDescription(targetObj.description || '');
        setTargetTable(targetObj.targetTable || '');
        setSheetMode(targetObj.worksheetSelectionMode || 'index');
        setSheetValue(targetObj.worksheetValue ?? 1);
        setDataStartRow(targetObj.dataStartRow || 1);
        
        if (targetObj.rowHeaders) {
          setRowHeaders(targetObj.rowHeaders.map((r: any, i) => ({ 
            ...r, 
            id: String(i),
            filterType: r.filterType || 'none',
            filterExpression: r.filterExpression || ''
          })));
        }
        
        if (targetObj.timelineConfig) {
          setTimeline({
            startColumn: targetObj.timelineConfig.startColumn,
            endColumn: targetObj.timelineConfig.endColumn,
            yearRow: targetObj.timelineConfig.yearRow,
            dbYearField: targetObj.timelineConfig.dbYearField,
            itemRow: targetObj.timelineConfig.itemRow,
            dbItemField: targetObj.timelineConfig.dbItemField,
            dbValueField: targetObj.timelineConfig.dbValueField,
          });
          setSkipHeaders(targetObj.timelineConfig.skipHeaders || []);
        }

        if (targetObj.targetTable) {
          fetchTableColumns(targetObj.targetTable);
        }
      }
    }
  }, [selectedTemplateCode]);

  // ==========================================
  // 🌟 新增事件：檔案上傳與連線測試
  // ==========================================
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUploadFile = async () => {
    if (!selectedFile) {
      alert('請先選擇要上傳的 Excel 檔案！');
      return;
    }
    setUploadingFile(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch('http://localhost:3000/api/spreadsheet/upload', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      if (response.ok && result.success) {
        setServerFilePath(result.filePath); // 假設後端回傳儲存於 server 的相對或絕對路徑
        alert('🟢 範本 Excel 檔案上傳成功並已儲存於伺服器！');
      } else {
        alert(`❌ 上傳失敗: ${result.message}`);
      }
    } catch (error: any) {
      alert(`❌ 無法連線至伺服器進行上傳: ${error.message}`);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleTestConnection = async () => {
    if (!dbHost.trim() || !dbUser.trim()) {
      alert('請輸入完整的 Host 與 UserID！');
      return;
    }
    setTestingConnection(true);
    try {
      const response = await fetch('http://localhost:3000/api/spreadsheet/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: dbHost, user: dbUser, password: dbPassword })
      });
      const result = await response.json();
      if (response.ok && result.success) {
        alert('🟢 資料庫連線測試成功！');
      } else {
        alert(`❌ 連線失敗: ${result.message}`);
      }
    } catch (error: any) {
      alert(`❌ 連線超時或伺服器錯誤: ${error.message}`);
    } finally {
      setTestingConnection(false);
    }
  };

  // ==========================================
  // 各步驟事件處理方法 (步驟 3 & 步驟 4)
  // ==========================================
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

  // ==========================================
  // 🌟 資料庫實體建表核心邏輯
  // ==========================================
  const handleCheckTable = async () => {
    if (!targetTable.trim()) {
      setTableStatus({ type: 'error', text: '❌ 請先輸入目標資料庫 Table Name' });
      return;
    }
    setCheckingTable(true);
    setTableStatus(null);

    try {
      const response = await fetch(`http://localhost:3000/api/spreadsheet/check-table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTable: targetTable, host: dbHost, user: dbUser, password: dbPassword }) // 帶入上方連線資訊
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
    
    setCheckingTable(true);
    setIsCreateModalOpen(false);

    try {
      const response = await fetch(`http://localhost:3000/api/spreadsheet/check-table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetTable: targetTable,
          fields: previewFields,
          host: dbHost,
          user: dbUser,
          password: dbPassword
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

  // 最終送出配置打包儲存至 MongoDB
  const handleSaveConfig = async () => {
    if (!templateCode.trim() || !templateName.trim()) {
      alert("❌ 請填寫範本識別碼與顯示名稱！");
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
      uploadedFilePath: serverFilePath, // 儲存檔案於 Server 的路徑
      dbConfig: { host: dbHost, user: dbUser }, // 儲存連線設定環境紀錄
      rowHeaders: rowHeaders.map(({ excelColumn, dbFieldName, isGrouped, filterType, filterExpression }) => ({
        excelColumn, dbFieldName, isGrouped, filterType, filterExpression
      })),
      timeline: timeline,
      skipHeaders: skipHeaders
    };

    try {
      const response = await fetch('http://localhost:3000/api/spreadsheet/save-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configPayload)
      });
      const result = await response.json();
      if (response.ok && result.success) {
        alert(`💾 範本 [${templateCode}] 配置已成功同步儲存至 MongoDB！`);
      } else {
        alert(`❌ 儲存失敗: ${result.message}`);
      }
    } catch (error: any) {
      alert("❌ 無法連線至後端伺服器進行儲存");
    }
  };

  return (
    <div className="w-full text-slate-800 p-2 max-w-7xl mx-auto font-sans">
      
      {/* Master Top Header */}
      <div className="mb-6 border-b border-gray-200 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Excel 匯入範本設定 (XLSX Template Setup)</h2>
          <p className="text-sm text-gray-500 mt-1">本機 MSSQL 專用整合介面</p>
        </div>
        
        <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg border border-slate-200">
          <label className="text-sm font-bold text-slate-700 shrink-0">📂 選擇要載入的範本：</label>
          <select 
            value={selectedTemplateCode} 
            onChange={(e) => setSelectedTemplateCode(e.target.value)}
            className="p-1.5 bg-white border border-slate-300 rounded md:w-64 font-medium text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="NEW">➕ 建立全新設定範本</option>
            {mockSavedTemplates.map(t => (
              <option key={t.templateCode} value={t.templateCode!}>📝 {t.templateName} ({t.templateCode})</option>
            ))}
          </select>
        </div>
      </div>

      {/* ==========================================
          🌟 擴充新增：第一列 Excel 檔案上傳區塊
         ========================================== */}
      <div className="bg-teal-50/40 p-5 rounded-xl border border-teal-200 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1">
          <label className="block text-sm font-bold text-teal-900 mb-1">📤 步驟 0：上傳範本 Excel 原始檔案 (存至伺服器)</label>
          <input 
            type="file" 
            accept=".xlsx, .xls" 
            onChange={handleFileChange} 
            className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-teal-50 file:text-teal-700 file:cursor-pointer hover:file:bg-teal-100"
          />
          {serverFilePath && <p className="text-[11px] text-teal-600 font-mono mt-1">伺服器端位置: {serverFilePath}</p>}
        </div>
        <button
          type="button"
          onClick={handleUploadFile}
          disabled={uploadingFile || !selectedFile}
          className="px-5 py-2.5 bg-teal-600 text-white font-bold text-sm rounded-lg hover:bg-teal-700 transition-all disabled:opacity-50 shadow-sm shrink-0"
        >
          {uploadingFile ? '⏳ 上傳中...' : '☁️ 執行上傳'}
        </button>
      </div>

      {/* ==========================================
          🌟 擴充新增：第二列 資料庫環境變數連線測試
         ========================================== */}
      <div className="bg-amber-50/40 p-5 rounded-xl border border-amber-200 mb-6">
        <label className="block text-sm font-bold text-amber-900 mb-3">⚡ 目標資料庫環境連線設定 (MSSQL Target Environment)</label>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Database Host</label>
            <input type="text" value={dbHost} onChange={e => setDbHost(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md bg-white font-mono text-sm" placeholder="127.0.0.1" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">User ID</label>
            <input type="text" value={dbUser} onChange={e => setDbUser(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md bg-white font-mono text-sm" placeholder="sa" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Password</label>
            <input type="password" value={dbPassword} onChange={e => setDbPassword(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md bg-white font-mono text-sm" placeholder="••••••••" />
          </div>
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="w-full py-2 px-4 bg-amber-600 text-white font-bold text-sm rounded-lg hover:bg-amber-700 transition-all shadow-sm disabled:opacity-50"
          >
            {testingConnection ? '⏳ 測試中...' : '🔌 測試資料庫連線'}
          </button>
        </div>
      </div>

      {/* ==========================================
          📋 步驟 1：定義範本基本資訊
          ========================================== */}
      <div className="bg-blue-50/50 p-6 rounded-xl border border-blue-200 mb-6">
        <h3 className="text-lg font-bold text-blue-900 border-l-4 border-blue-600 pl-3 mb-4">📋 步驟 1：定義範本基本資訊</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">範本識別碼</label>
            <input type="text" value={templateCode} disabled={selectedTemplateCode !== 'NEW'} onChange={e => setTemplateCode(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md bg-white font-mono uppercase disabled:bg-gray-100 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">範本顯示名稱</label>
            <input type="text" value={templateName} onChange={e => setTemplateName(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm font-semibold text-gray-700 mb-1">範本功能描述</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md bg-white" />
          </div>
        </div>
      </div>

      {/* ==========================================
          ⚙️ 步驟 2：工作表 (Worksheet) 與目標資料庫 & 智慧建表看板
          ========================================== */}
      <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 mb-6">
        <h3 className="text-lg font-bold text-slate-900 border-l-4 border-slate-500 pl-3 mb-4">⚙️ 步驟 2：工作表 (Worksheet) 與目標資料庫</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">本機 MSSQL Table Name</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={targetTable} 
                onChange={e => setTargetTable(e.target.value)} 
                className="flex-1 p-2 border border-gray-300 rounded-md bg-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" 
                placeholder="e.g. dbo.factory_demand_forecast"
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

            {/* 💡 動態看板區塊 */}
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
            <label className="block text-sm font-semibold text-gray-700 mb-1">明細資料起始列 (Data Start Row)</label>
            <input type="number" min={1} value={dataStartRow} onChange={e => setDataStartRow(Number(e.target.value))} className="w-full p-2 border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="md:col-span-2 border-t border-gray-200 pt-3 mt-1">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Excel 指定工作表 (Worksheet)</label>
            <div className="flex gap-6 my-2 text-sm">
              <label className="inline-flex items-center cursor-pointer"><input type="radio" className="mr-2" checked={sheetMode === 'index'} onChange={() => { setSheetMode('index'); setSheetValue(1); }} /> 依分頁順序 (Index)</label>
              <label className="inline-flex items-center cursor-pointer"><input type="radio" className="mr-2" checked={sheetMode === 'name'} onChange={() => { setSheetMode('name'); setSheetValue(''); }} /> 依分頁名稱 (Sheet Name)</label>
            </div>
            <input type={sheetMode === 'index' ? 'number' : 'text'} value={sheetValue} onChange={e => setSheetValue(e.target.value)} className="w-full md:w-1/2 p-2 border border-gray-300 rounded-md bg-white" />
          </div>
        </div>
      </div>

      {/* ==========================================
          📌 步驟 3：固定維度欄位對應與 Regex 檢核
          ========================================== */}
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
                      <select value={row.dbFieldName} onChange={e => handleUpdateRowHeader(row.id, 'dbFieldName', e.target.value)} className="w-full p-1.5 border border-gray-300 rounded bg-white text-sm font-mono">
                        <option value="">-- 請選擇 --</option>
                        {dbFields.map(f => (<option key={f.name} value={f.name}>{f.name} ({f.type})</option>))}
                      </select>
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
                              className="flex-1 min-w-[180px] p-1 border rounded text-xs font-mono" placeholder="請輸入正規表示式，例如 ^[0-9]{2}-[0-9]{4}$"
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

      {/* ==========================================
          ⚡ 步驟 4：動態時間與項目軸設定
          ========================================== */}
      <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 mb-6">
        <h3 className="text-lg font-bold text-slate-900 border-l-4 border-slate-500 pl-3 mb-2">⚡ 步驟 4：動態時間與項目軸設定</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">矩陣起始欄位 (Start Column)</label>
            <input type="text" value={timeline.startColumn} onChange={e => handleUpdateTimeline('startColumn', e.target.value.toUpperCase())} className="w-full p-2 border border-gray-300 rounded-md font-mono uppercase" placeholder="E.g. Z" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">矩陣結束欄位 (End Column)</label>
            <input type="text" value={timeline.endColumn} onChange={e => handleUpdateTimeline('endColumn', e.target.value.toUpperCase())} className="w-full p-2 border border-gray-300 rounded-md font-mono uppercase" placeholder="E.g. AH" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-gray-200 pt-4">
          <div className="text-sm">
            <label className="block font-semibold text-gray-700 mb-2 text-xs">1. 年份設定軸 (Year)</label>
            <div className="flex items-center gap-2">
              <span>第</span>
              <input type="number" min={1} value={timeline.yearRow} onChange={e => handleUpdateTimeline('yearRow', Number(e.target.value))} className="w-14 p-1.5 border rounded text-center bg-white font-mono" />
              <span>列 ➡️</span>
              <select value={timeline.dbYearField} onChange={e => handleUpdateTimeline('dbYearField', e.target.value)} className="p-1.5 border rounded bg-white flex-1 text-xs font-mono">
                <option value="">-- 請選擇 --</option>
                {dbFields.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
              </select>
            </div>
          </div>
          <div className="text-sm">
            <label className="block font-semibold text-gray-700 mb-2 text-xs">2. 項目設定軸 (Item)</label>
            <div className="flex items-center gap-2">
              <span>第</span>
              <input type="number" min={1} value={timeline.itemRow} onChange={e => handleUpdateTimeline('itemRow', Number(e.target.value))} className="w-14 p-1.5 border rounded text-center bg-white font-mono" />
              <span>列 ➡️</span>
              <select value={timeline.dbItemField} onChange={e => handleUpdateTimeline('dbItemField', e.target.value)} className="p-1.5 border rounded bg-white flex-1 text-xs font-mono">
                <option value="">-- 請選擇 --</option>
                {dbFields.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
              </select>
            </div>
          </div>
          <div className="text-sm">
            <label className="block font-semibold text-gray-700 mb-2 text-xs">3. 數據值對應 (Value)</label>
            <div className="flex items-center gap-2 mt-0.5">
              <span>數據 ➡️</span>
              <select value={timeline.dbValueField} onChange={e => handleUpdateTimeline('dbValueField', e.target.value)} className="p-1.5 border rounded bg-white flex-1 text-xs font-mono">
                <option value="">-- 請選擇 --</option>
                {dbFields.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-gray-100 pt-3">
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">🚫 排除解析特定時間軸標頭 (例如 TTL, 合計欄位)：</label>
          <div className="flex gap-2 max-w-md mb-2">
            <input 
              type="text" value={newSkipInput} onChange={e => setNewSkipInput(e.target.value)}
              className="flex-1 p-1.5 border text-xs rounded bg-white" placeholder="輸入標頭名稱 (例如: TTL)"
            />
            <button type="button" onClick={handleAddSkipHeader} className="px-3 py-1.5 text-xs bg-slate-600 text-white font-semibold rounded hover:bg-slate-700">排除</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {skipHeaders.map(sh => (
              <span key={sh} className="inline-flex items-center bg-gray-200 text-slate-800 rounded px-2 py-0.5 text-xs font-medium">
                {sh}
                <button type="button" onClick={() => handleRemoveSkipHeader(sh)} className="ml-1 text-gray-400 hover:text-red-500 font-bold">×</button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end mt-8 border-t border-gray-200 pt-4">
        <button type="button" onClick={handleSaveConfig} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm text-lg transition-all transform active:scale-95">
          💾 {selectedTemplateCode === 'NEW' ? '儲存全新發布' : '更新目前範本設定'}
        </button>
      </div>

      {/* ========================================================
          🌟 SQL Server 表格設計工具彈窗 (Modal)
          ======================================================== */}
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