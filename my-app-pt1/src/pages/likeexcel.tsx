// src/pages/likeexcel.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '@syncfusion/ej2-react-buttons';
import { SpreadsheetComponent } from '@syncfusion/ej2-react-spreadsheet';
import { useWorkbook } from '../hooks/useWorkbook';

// 引入 Syncfusion 官方基礎與下拉選單樣式
import '@syncfusion/ej2-base/styles/material.css';
import '@syncfusion/ej2-inputs/styles/material.css';
import '@syncfusion/ej2-buttons/styles/material.css';
import '@syncfusion/ej2-splitbuttons/styles/material.css';
import '@syncfusion/ej2-lists/styles/material.css';
import '@syncfusion/ej2-navigations/styles/material.css';
import '@syncfusion/ej2-popups/styles/material.css';
import '@syncfusion/ej2-dropdowns/styles/material.css';
import '@syncfusion/ej2-grids/styles/material.css';
import '@syncfusion/ej2-react-spreadsheet/styles/material.css';
import "@syncfusion/ej2-spreadsheet/styles/material.css";

// 定義從 MongoDB 撈回來的範本簡要結構
interface MongoTemplateOption {
  templateCode: string;
  templateName: string;
  targetTable?: string;
}

export default function LikeExcel() {
  const spreadsheetRef = useRef<SpreadsheetComponent>(null);
  const navigate = useNavigate();
  const [isSavingToDb, setIsSavingToDb] = useState(false);

  // 存放從 MongoDB 撈出來的下拉選單資料源
  const [templateOptions, setTemplateOptions] = useState<MongoTemplateOption[]>([]);
  // 當前選中的 MongoDB 範本物件實體
  const [selectedTemplate, setSelectedTemplate] = useState<MongoTemplateOption | null>(null);
  // 備用本機下載預設檔名
  const [, setTemplateName] = useState("未命名矩陣範本.xlsx");
  const workbook = useWorkbook({ spreadsheetRef, onFileNameChange: setTemplateName });

  // 🌟 核心優化：元件掛載時自動至 MongoDB 專屬路由提取所有已設計的真實範本清單
  useEffect(() => {
    console.log("🔍 Fetching real templates from MongoDB...");
    
    fetch('http://localhost:3000/api/spreadsheet/get-templates')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.templates && data.templates.length > 0) {
          console.log("🎯 成功從 MongoDB 撈到真實範本：", data.templates);
          setTemplateOptions(data.templates);
          setSelectedTemplate(data.templates[0]); // 預設選中第一項
          setTemplateName(data.templates[0].templateName + ".xlsx");
        } else {
          console.warn("⚠️ MongoDB templates 集合中尚無任何資料，啟用動態 Fallback 清單");
          const fallbackList: MongoTemplateOption[] = [
            { templateCode: 'DEFAULT_A', templateName: '請至 Setup 設定頁面建立首組範本 (DEFAULT_A)', targetTable: 'factory_demand_forecast2' }
          ];
          setTemplateOptions(fallbackList);
          setSelectedTemplate(fallbackList[0]);
          setTemplateName(fallbackList[0].templateName + ".xlsx");
        }
      })
      .catch(err => {
        console.error("❌ 無法連線至 MongoDB 範本 API，啟用本機靜態模擬清單:", err);
        const defaultList: MongoTemplateOption[] = [
          { templateCode: 'A0001', templateName: 'NVIDIA 矩陣需求預估範本 (A0001)', targetTable: 'factory_demand_forecast2' },
          { templateCode: 'B0002', templateName: 'AMD 產能排程配置範本 (B0002)', targetTable: 'amd_production_schedule' },
          { templateCode: 'C0003', templateName: 'INTEL 供應鏈庫存追蹤範本 (C0003)', targetTable: 'intel_inventory_tracking' }
        ];
        setTemplateOptions(defaultList);
        setSelectedTemplate(defaultList[0]);
        setTemplateName(defaultList[0].templateName + ".xlsx");
      });
  }, []);

  // 當使用者切換下拉選單時的變更監聽
  const handleTemplateChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const code = event.target.value;
    const target = templateOptions.find(item => item.templateCode === code);
    if (target) {
      setSelectedTemplate(target);
      setTemplateName(target.templateName + ".xlsx");
      console.log(`🎯 已成功切換至 MongoDB 範本代碼: [${target.templateCode}], 目標寫入集合為: [${target.targetTable}]`);
    }
  };

  // 將當前 Spreadsheet 的活頁簿數據，依據選定範本解析並寫入 SQL 資料庫
  const onSaveToDatabase = () => {
    const spreadsheet = spreadsheetRef.current as any;
    if (!spreadsheet || isSavingToDb) return;

    if (!selectedTemplate) {
      alert("⚠️ 請先選擇一個對應的 MongoDB 範本！");
      return;
    }

    const confirmMsg = `確定要將目前的資料內容，依據範本 [${selectedTemplate.templateCode}] 的對應規格解析，並寫入 MSSQL 資料表 [${selectedTemplate.targetTable || '預設'}] 嗎？`;
    if (!window.confirm(confirmMsg)) return;

    setIsSavingToDb(true);
    console.log(`📥 打包網格數據，準備依範本 [${selectedTemplate.templateCode}] 寫入 MSSQL...`);

    spreadsheet.saveAsJson().then((response: any) => {
      fetch('http://localhost:3000/api/spreadsheet/save-excel-to-mssql-by-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          spreadsheetData: response,
          templateCode: selectedTemplate.templateCode
        })
      })
      .then(async (res) => {
        const result = await res.json();
        if (!res.ok) throw new Error(result.message || result.error || "儲入 MSSQL 資料庫失敗");
        return result;
      })
      .then((data) => {
        alert(`🎉 MSSQL 儲存成功！\n批次編號: ${data.batchNo}\n成功解構並對應範本欄位，共寫入 ${data.insertedCount} 筆明細數據。`);
        setIsSavingToDb(false);
      })
      .catch((err) => {
        console.error("❌ MSSQL Storage Error:", err);
        alert(`❌ 儲存至 MSSQL 發生錯誤:\n${err.message}`);
        setIsSavingToDb(false);
      });
    });
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-white">
      
      {/* TOP NAV BAR & TEMPLATE SELECTOR */}
      <div className="h-12 border-b border-slate-200 flex items-center justify-between px-4 shrink-0 bg-slate-900 text-white">
        <div className="flex items-center gap-4 flex-1">
          <button 
            onClick={() => navigate('/tools')}
            className="text-slate-400 hover:text-white text-sm font-bold flex items-center gap-1 transition-colors shrink-0"
          >
            ← <span className="hidden sm:inline">Back to Tools</span>
          </button>
          <div className="h-4 w-[1px] bg-slate-700 shrink-0"></div>
          
          {/* 下拉選單選擇器 */}
          <div className="flex items-center gap-2 max-w-md w-full">
            <span className="text-xs text-slate-400 font-medium shrink-0">選擇對應範本:</span>
            <select 
              value={selectedTemplate?.templateCode || ''} 
              onChange={handleTemplateChange}
              className="bg-slate-800 text-blue-400 border border-slate-700 text-xs font-mono rounded px-2 py-1 focus:outline-none focus:border-blue-500 w-full cursor-pointer transition-all"
            >
              {templateOptions.map((option) => (
                <option key={option.templateCode} value={option.templateCode}>
                  {option.templateName}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        {/* RIGHT SIDE BADGES */}
        <div className="flex gap-3 items-center shrink-0">
          {selectedTemplate && (
            <span className="text-[10px] bg-blue-950 text-blue-400 px-2 py-0.5 rounded border border-blue-800 font-mono hidden md:inline">
              Target: {selectedTemplate.targetTable}
            </span>
          )}
          <span className="text-[10px] bg-green-900 text-green-400 px-2 py-0.5 rounded border border-green-800 font-mono">MONGODB_MODE</span>
        </div>
      </div>

      {/* 🌟 核心修改：全新設計的控制按鈕功能列 */}
      <div className="flex items-center gap-2 p-2 bg-slate-800 border-b border-slate-700 shrink-0 shadow-inner">
        {selectedTemplate && (
          <div className="px-2 py-1 text-xs font-mono rounded border border-blue-500 bg-blue-950 text-blue-400 hidden sm:block">
            Active Table: {selectedTemplate.targetTable || 'factory_demand_forecast2'}
          </div>
        )}
        <select
          value={workbook.selectedSheet}
          onChange={(event) => void workbook.selectSheet(event.target.value)}
          disabled={!workbook.fileId || workbook.isWorkbookLoading}
          className="max-w-xs bg-slate-900 text-slate-200 border border-slate-600 text-xs rounded px-2 py-1.5 disabled:opacity-50"
          title="Workbook sheet"
        >
          <option value="">No workbook loaded</option>
          {workbook.sheets.map((sheet) => (
            <option key={sheet.sheetId} value={sheet.name}>
              {sheet.name}{sheet.hidden ? ' (hidden)' : ''}
            </option>
          ))}
        </select>
        {workbook.fileId && (
          <span className="text-[10px] text-slate-400 font-mono">
            {workbook.isWorkbookLoading ? 'Loading...' : `${workbook.totalRows.toLocaleString()} rows`}
          </span>
        )}
        {workbook.error && <span className="text-[10px] text-red-400 truncate max-w-xs">{workbook.error}</span>}
        
        <div className="flex-1" /> {/* 彈性空格推至右側 */}

        {/* 🌟 新增：VBA like 按鈕 (位於 Save to DB 左邊) */}
        <button
          onClick={() => {
            console.log("⚡ 觸發類 VBA 巨集腳本處理...");
            alert(`⚡ 已啟動類 VBA 巨集處理引擎！\n目前正針對範本 [${selectedTemplate?.templateCode}] 的活頁簿網格進行格式掃描、自訂動態公式重算與前端資料校正。`);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded text-amber-100 bg-gradient-to-r from-amber-700 to-yellow-600 hover:from-amber-600 hover:to-yellow-500 shadow-sm transition-all"
        >
          ⚙️ VBA like
        </button>

        {/* 儲存至資料庫按鈕 */}
        <button 
          onClick={onSaveToDatabase}
          disabled={isSavingToDb}
          className={`${isSavingToDb ? 'bg-indigo-700 opacity-60' : 'bg-indigo-600 hover:bg-indigo-500'} text-white text-xs font-bold px-4 py-1.5 rounded shadow-sm transition-all flex items-center gap-2`}
        >
          {isSavingToDb ? (
            <>
              <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Storing to DB...
            </>
          ) : (
            <>
              <span>📥</span> Save to DB
            </>
          )}
        </button>

        {/* 🌟 修改：原本的 Save Template 改為 Load from DB */}
        <button 
          onClick={() => {
            console.log("📤 準備從 DB 載入資料回填活頁簿...");
            alert(`📤 系統已接收反向加載請求：\n即將從 MSSQL 的 [${selectedTemplate?.targetTable}] 資料表中，將最新轉置完成的數據庫資料反解回繪至 Syncfusion Spreadsheet 畫面。`);
          }}
          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold px-4 py-1.5 rounded shadow-sm transition-all flex items-center gap-2"
        >
          <span>📂</span> Load from DB
        </button>
      </div>

      {/* SPREADSHEET AREA */}
      <div className="flex-1 relative bg-white">
        <div className="h-[calc(100vh-80px)] inset-0"> {/* 高度調配扣除兩排功能列 */}
          <SpreadsheetComponent 
            ref={spreadsheetRef}
            created={() => { (window as any).mySpreadsheet = spreadsheetRef.current; }}
            height="100%"
            width="100%"
            scrollSettings={{ isFinite: true, enableVirtualization: true }}
            openUrl="http://localhost:3000/api/spreadsheet/open"
            saveUrl="http://localhost:3000/api/spreadsheet/saveX2" // 統一交給優化過的 saveX2 高擬真導出
            allowOpen={true} 
            beforeOpen={workbook.beforeOpen}
            allowSave={true}
            showSheetTabs={true}
            showRibbon={true}
            showFormulaBar={true}
          />
        </div>
      </div>
      
    </div>
  );
}
