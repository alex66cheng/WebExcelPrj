// src/pages/likeexcelG.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE, WS_BASE } from '../config/apiBase';
import { useAuth } from '../context/useAuth';
import type { AuthUser } from '../context/AuthContext';
import '@syncfusion/ej2-react-buttons';
import { SpreadsheetComponent } from '@syncfusion/ej2-react-spreadsheet';

// Yjs 協作核心套件
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

// Syncfusion 完整樣式依賴
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

interface MongoTemplateOption {
  templateCode: string;
  templateName: string;
  targetTable?: string;
}

export default function LikeExcelContainer() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [templateOptions, setTemplateOptions] = useState<MongoTemplateOption[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<MongoTemplateOption | null>(null);
  const [templateName, setTemplateName] = useState("未命名矩陣範本.xlsx");

  useEffect(() => {
    console.log("likeexcel.tsx: 🔍 Fetching real templates from MongoDB...");
    fetch(`${API_BASE}/api/spreadsheet/get-templates`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.templates && data.templates.length > 0) {
          setTemplateOptions(data.templates);
          setSelectedTemplate(data.templates[0]);
          setTemplateName(data.templates[0].templateName + ".xlsx");
        } else {
          const fallbackList: MongoTemplateOption[] = [
            { templateCode: 'DEFAULT_A', templateName: '請至 Setup 設定頁面建立首組範本 (DEFAULT_A)', targetTable: 'factory_demand_forecast2' }
          ];
          setTemplateOptions(fallbackList);
          setSelectedTemplate(fallbackList[0]);
          setTemplateName(fallbackList[0].templateName + ".xlsx");
        }
      })
      .catch(() => {
        const defaultList: MongoTemplateOption[] = [
          { templateCode: 'DEFAULT_A', templateName: '請至 Setup 設定頁面建立首組範本 (DEFAULT_A)', targetTable: 'factory_demand_forecast2' }
        ];
        setTemplateOptions(defaultList);
        setSelectedTemplate(defaultList[0]);
        setTemplateName(defaultList[0].templateName + ".xlsx");
      });
  }, []);

  const handleTemplateChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const code = event.target.value;
    const target = templateOptions.find(item => item.templateCode === code);
    if (target) {
      setSelectedTemplate(target);
      setTemplateName(target.templateName + ".xlsx");
    }
  };

  if (!selectedTemplate) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-900 text-white font-mono">
        🔍 正在載入系統範本與狀態...
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-white">
      {/* TOP NAV BAR */}
      <div className="h-12 border-b border-slate-200 flex items-center justify-between px-4 shrink-0 bg-slate-900 text-white">
        <div className="flex items-center gap-4 flex-1">
          <button onClick={() => navigate('/tools')} className="text-slate-400 hover:text-white text-sm font-bold shrink-0">
            ← Back to Tools
          </button>
          <div className="h-4 w-[1px] bg-slate-700 shrink-0"></div>

          <div className="flex items-center gap-2 max-w-sm w-full">
            <span className="text-xs text-slate-400 font-medium shrink-0">選擇對應範本:</span>
            <select
              value={selectedTemplate.templateCode}
              onChange={handleTemplateChange}
              className="bg-slate-800 text-blue-400 border border-slate-700 text-xs font-mono rounded px-2 py-1 w-full"
            >
              {templateOptions.map((option) => (
                <option key={option.templateCode} value={option.templateCode}>{option.templateName}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-4 items-center shrink-0">
          {user && (
            <div className="flex items-center gap-2">
              {user.picture && <img src={user.picture} alt="profile" className="w-6 h-6 rounded-full object-cover" />}
              <span className="text-xs font-medium text-slate-300 hidden sm:inline">{user.name}</span>
            </div>
          )}
          <span className="text-[10px] bg-green-900 text-green-400 px-2 py-0.5 rounded border border-green-800 font-mono">CRDT_MODE</span>
        </div>
      </div>

      <LikeExcelCoreKeyed
        user={user}
        key={selectedTemplate.templateCode}
        selectedTemplate={selectedTemplate}
        templateName={templateName}
      />
    </div>
  );
}

interface CoreProps {
  user: AuthUser | null;
  selectedTemplate: MongoTemplateOption;
  templateName: string;
}

function LikeExcelCoreKeyed({ user, selectedTemplate, templateName }: CoreProps) {
  const spreadsheetRef = useRef<SpreadsheetComponent>(null);
  const isSaving = useRef(false);
  const [isSavingToDb, setIsSavingToDb] = useState(false);
  const [collaborators, setCollaborators] = useState<any[]>([]);

  // 💡 當 WebSocket 順利連線上 room 時，就代表初始化完成，可以解開轉圈圈
  const [isInitialized, setIsInitialized] = useState(false);

  const yDocRef = useRef<Y.Doc | null>(null);
  const wsProviderRef = useRef<WebsocketProvider | null>(null);

  // 已登入的使用者身分（來自 AuthContext），保存在 ref 供事件 callback 使用
  const userRef = useRef<AuthUser | null>(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // 📝 Cell modification logging - store old values before edit
  const cellOldValueRef = useRef<{ address: string; value: any } | null>(null);

  // 📝 Reason dialog state
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [pendingCellChange, setPendingCellChange] = useState<{
    address: string;
    oldValue: any;
    newValue: any;
  } | null>(null);
  const [changeReason, setChangeReason] = useState('');

  // 📝 Function to send cell modification log to server
  const logCellChange = useCallback((cellAddress: string, oldValue: any, newValue: any, reason: string) => {
    const userEmail = userRef.current?.email || 'anonymous';

    fetch(`${API_BASE}/api/spreadsheet/log-cell-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateCode: selectedTemplate.templateCode,
        cellAddress,
        oldValue: oldValue !== undefined ? String(oldValue) : null,
        newValue: newValue !== undefined ? String(newValue) : null,
        user: userEmail,
        timestamp: new Date().toISOString(),
        reason
      })
    }).catch(err => console.error('Failed to log cell change:', err));
  }, [selectedTemplate.templateCode]);

  // 📝 Handle reason dialog submit
  const handleReasonSubmit = () => {
    if (pendingCellChange) {
      logCellChange(
        pendingCellChange.address,
        pendingCellChange.oldValue,
        pendingCellChange.newValue,
        changeReason
      );
    }
    setShowReasonDialog(false);
    setPendingCellChange(null);
    setChangeReason('');
  };

  // 📝 Handle reason dialog cancel
  const handleReasonCancel = () => {
    if (pendingCellChange) {
      // Still log but without reason
      logCellChange(
        pendingCellChange.address,
        pendingCellChange.oldValue,
        pendingCellChange.newValue,
        ''
      );
    }
    setShowReasonDialog(false);
    setPendingCellChange(null);
    setChangeReason('');
  };

  // 1. 建立 WebSocket 連線與房間狀態同步
  useEffect(() => {
    const doc = new Y.Doc();
    yDocRef.current = doc;

    const wsUrl = WS_BASE;
    const roomName = `excel-room-${selectedTemplate.templateCode}`;

    console.log(`🔌 [WebSocket 建立連線] 房號: ${roomName}`);
    const provider = new WebsocketProvider(wsUrl, roomName, doc);
    wsProviderRef.current = provider;

    // 1. 定義顏色產生器
    const getUserColor = (email: string) => {
      // 1. 擴大顏色池 (使用 HSL 色彩空間，可以產生 360 種不同的顏色)
      // 我們使用隨機雜湊來決定色相 (Hue)
      let hash = 0;
      for (let i = 0; i < email.length; i++) {
          hash = email.charCodeAt(i) + ((hash << 5) - hash);
      }

      // 2. 取 0-360 的色相值，固定飽和度 70%，亮度 85%
      const h = Math.abs(hash) % 360;
      return `hsl(${h}, 70%, 85%)`;
    };

    const currentUser = userRef.current;
    provider.awareness.setLocalStateField('user', {
      name: currentUser?.name || '訪客成員',
      picture: currentUser?.picture || 'https://www.gravatar.com/avatar/?d=mp',
      email: currentUser?.email || 'guest@local',
      color: currentUser ? getUserColor(currentUser.email) : '#718096'
    });

    provider.awareness.on('change', () => {
      const states = Array.from(provider.awareness.getStates().values());
      const activeUsers = states.map((s: any) => s.user).filter(Boolean);
      setCollaborators(activeUsers);
    });

    // 監聽 WebSocket 同步成功狀態
    provider.on('status', (event: any) => {
      if (event.status === 'connected') {
        console.log("📥 [Yjs 同步成功] 核心分散式數據房已連接");
        setIsInitialized(true);
      }
    });

   const yCellsMap = doc.getMap('cells_data');
   yCellsMap.observe((event) => {
    const spreadsheet = spreadsheetRef.current as any;
    if (!spreadsheet) return;

    spreadsheet.isRemoteSync = true;

    event.changes.keys.forEach((change, key) => {
        if (change.action === 'add' || change.action === 'update') {
            const cellInfo = yCellsMap.get(key) as any;
            if (cellInfo) {
                // 1. 取得該 User 對應的顏色
                const userColor = getUserColor(cellInfo.user);

                // 2. 更新內容並套用顏色
                spreadsheet.updateCell({ value: cellInfo.value }, cellInfo.address);
                spreadsheet.cellFormat({ backgroundColor: userColor }, cellInfo.address);

                console.log(`✅ ${cellInfo.user} 使用顏色 ${userColor} 更新了 ${cellInfo.address}`);
            }
        }
    });

    spreadsheet.isRemoteSync = false;
});

    return () => {
      console.log(`🔌 [安全斷開 WebSocket] 房號: ${roomName}`);
      provider.destroy();
      doc.destroy();
    };
  }, [selectedTemplate.templateCode]);

  const handleCellSave = (args: any) => {
    if (!yDocRef.current || !args.element) return;
    const yCellsMap = yDocRef.current.getMap('cells_data');
    yCellsMap.set(args.address, {
      row: args.rowIndex, col: args.colIndex,
      value: args.value, formula: args.formula, address: args.address
    });
  };

  const onSaveWithStyle = () => {
    const spreadsheet = spreadsheetRef.current as any;
    if (!spreadsheet || isSaving.current) return;
    isSaving.current = true;
    spreadsheet.saveAsJson().then((response: any) => {
      const payload = { JSONData: JSON.stringify(response.jsonObject ? JSON.parse(response.jsonObject).Workbook : response) };
      fetch(`${API_BASE}/api/spreadsheet/saveX2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = templateName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        isSaving.current = false;
      }).catch(() => { isSaving.current = false; });
    });
  };

  const onSaveToDatabase = () => {
    const spreadsheet = spreadsheetRef.current as any;
    if (!spreadsheet || isSavingToDb) return;
    if (!window.confirm(`確定要將目前的資料內容寫入 MSSQL 資料表 [${selectedTemplate.targetTable}] 嗎？`)) return;

    setIsSavingToDb(true);
    spreadsheet.saveAsJson().then((response: any) => {
      fetch(`${API_BASE}/api/spreadsheet/save-excel-to-mssql-by-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetData: response, templateCode: selectedTemplate.templateCode })
      })
      .then(res => res.json())
      .then((data) => {
        alert(`🎉 MSSQL 儲存成功！批次編號: ${data.batchNo}`);
        setIsSavingToDb(false);
      })
      .catch(() => { setIsSavingToDb(false); });
    });
  };

  const onBeforeOpen = (args: any) => {
    args.cancel = true;
    const file = args.file;
    const formData = new FormData();
    formData.append('file', file);

    if (file && file.name) {
    //  setTemplateName(file.name);
    }

    fetch(`${API_BASE}/api/spreadsheet/open`, {
      method: 'POST',
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.jsonObject && spreadsheetRef.current) {
          const spreadsheet = spreadsheetRef.current as any;
          console.log("JSON to load:", JSON.parse(data.jsonObject));
          spreadsheet.open({ jsonObject: data.jsonObject });

          setTimeout(() => {
            spreadsheet.hideSpinner();
          }, 100);

          console.log("✅ Data manually loaded into grid using .open()");
        }
      })
      .catch((err) => console.error("Open Error:", err));
  };



 const onActionComplete = (args: any) => {
    // 根據你的 Console 輸出，資料藏在 args.eventArgs 中
    const data = args.eventArgs;
    console.log("🔍 在事件觸發時，userRef.current 是:", userRef.current);

    // 檢查是否為儲存格編輯完成
    if (args.action === 'cellSave' && data) {
     // 1. 解析地址 (Sheet1!B2 -> B, 2)
        const cellPart = data.address.split('!')[1];
        const colLetter = cellPart.match(/[A-Z]+/)?.[0];
        const rowMatch = cellPart.match(/\d+/)?.[0];

        const userEmail = userRef.current?.email || "anonymous";

        if (colLetter && rowMatch) {
            const rowIndex = parseInt(rowMatch) - 1;
            const colIndex = colLetter.toUpperCase().charCodeAt(0) - 65;
            const value = data.value !== undefined ? data.value : args.eventArgs.value;

            // 📝 Show reason dialog instead of logging directly
            const oldValue = cellOldValueRef.current?.address === data.address
              ? cellOldValueRef.current.value
              : null;
            setPendingCellChange({
              address: data.address,
              oldValue,
              newValue: value
            });
            setShowReasonDialog(true);
            cellOldValueRef.current = null; // Clear after capturing

            console.log(`🎯 [同步發送] 解析座標: (${rowIndex}, ${colIndex}), User: ${userEmail}`);
            // 2. 寫入 Yjs
            const yCellsMap = yDocRef.current?.getMap('cells_data');
            yCellsMap?.set(data.address, {
                value: value,
                address: data.address, // 確保這裡有存入 address
                rowIndex: rowIndex,
                colIndex: colIndex,
                user: userEmail
            });
        }
    }
};


  return (
    <div className="flex-1 flex flex-col min-h-0 w-full relative bg-white">
      {/* ACTION TOOLBAR */}
      <div className="flex items-center gap-2 p-2 bg-slate-800 border-b border-slate-700 shrink-0 shadow-inner">
        <div className="px-2 py-1 text-xs font-mono rounded border border-blue-500 bg-blue-950 text-blue-400 hidden sm:block">
          Active Table: {selectedTemplate.targetTable}
        </div>

        <div className="hidden lg:flex items-center gap-1.5 ml-4">
          <span className="text-xs text-slate-500">正在協作:</span>
          <div className="flex -space-x-2 overflow-hidden">
            {collaborators.map((collab, index) => (
              <img
                key={index}
                title={`${collab.name} (${collab.email})`}
                className="inline-block h-6 w-6 rounded-full ring-2 ring-slate-900 object-cover cursor-help"
                src={collab.picture}
                alt={collab.name}
                style={{ border: `1.5px solid ${collab.color}` }}
              />
            ))}
          </div>
        </div>

        <div className="flex-1" />

        <button
          onClick={() => alert(`已啟動自訂動態公式重算與巨集清洗。`)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded text-amber-100 bg-gradient-to-r from-amber-700 to-yellow-600 hover:from-amber-600 hover:to-yellow-500 transition-all"
        >
          ⚙️ VBA like
        </button>

        <button
          onClick={onSaveToDatabase}
          disabled={isSavingToDb}
          className={`${isSavingToDb ? 'bg-indigo-700 opacity-60' : 'bg-indigo-600 hover:bg-indigo-500'} text-white text-xs font-bold px-4 py-1.5 rounded transition-all`}
        >
          {isSavingToDb ? 'Storing to DB...' : '📥 Save to DB'}
        </button>

        <button
          onClick={onSaveWithStyle}
          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold px-4 py-1.5 rounded transition-all"
        >
          📂 Export Excel
        </button>
      </div>

      {/* SPREADSHEET AREA */}
      <div className="flex-1 relative w-full min-h-0 bg-white">
        <div className="absolute inset-0 w-full h-full">
          <SpreadsheetComponent
                      ref={spreadsheetRef}
                      created={() => { (window as any).mySpreadsheet = spreadsheetRef.current; }}
                      height="100%"
                      width="100%"
                      openUrl={`${API_BASE}/api/spreadsheet/open`}
                      saveUrl={`${API_BASE}/api/spreadsheet/saveX2`} // 統一交給優化過的 saveX2 高擬真導出
                      allowOpen={true}
                      beforeOpen={onBeforeOpen}
                      allowSave={true}
                      showSheetTabs={true}
                      showRibbon={true}
                      showFormulaBar={true}
                      actionBegin={(args: any) => console.log("🔍 ActionBegin:", args)}
                      cellEdit={(args: any) => {
                        // 📝 Capture old value before editing starts
                        console.log("✏️ CellEdit:", args);
                        if (args.address) {
                          cellOldValueRef.current = {
                            address: args.address,
                            value: args.value
                          };
                        }
                      }}
                      saveComplete={(args: any) => console.log("💾 SaveComplete:", args)}
                      actionComplete={onActionComplete}
                    />

          {/* 下載載入遮罩層 */}
          {!isInitialized && (
            <div className="absolute inset-0 bg-white/90 backdrop-blur-xs flex flex-col items-center justify-center z-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-3"></div>
              <p className="text-xs font-mono text-slate-500">⚡ 正在安全連結 Yjs 分散式同步房號...</p>
            </div>
          )}

          {/* 📝 Cell Change Reason Dialog */}
          {showReasonDialog && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 w-96 max-w-[90vw]">
                <h3 className="text-lg font-bold text-slate-800 mb-2">Cell Modification</h3>
                <div className="text-sm text-slate-600 mb-4">
                  <p><span className="font-medium">Cell:</span> {pendingCellChange?.address}</p>
                  <p><span className="font-medium">Old Value:</span> {pendingCellChange?.oldValue ?? '(empty)'}</p>
                  <p><span className="font-medium">New Value:</span> {pendingCellChange?.newValue ?? '(empty)'}</p>
                </div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Reason for change:
                </label>
                <textarea
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="Enter the reason for this change..."
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows={3}
                  autoFocus
                />
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    onClick={handleReasonCancel}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
                  >
                    Skip
                  </button>
                  <button
                    onClick={handleReasonSubmit}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                  >
                    Submit
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
