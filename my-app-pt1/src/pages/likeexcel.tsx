// src/pages/likeexcel.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE, WS_BASE, apiFetch } from '../config/apiBase';
import { useAuth } from '../context/useAuth';
import '@syncfusion/ej2-react-buttons';
import { SpreadsheetComponent } from '@syncfusion/ej2-react-spreadsheet';

// Yjs 協作核心套件
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

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

// 從 Excel 檔案池開啟時，帶回來的檔案資訊
interface PoolFileInfo {
  fileName: string;
  displayName: string;
  sheetCount: number;
  sheetNames: string[];
  canOverwrite: boolean;
}

interface Collaborator {
  name: string;
  picture: string;
  email: string;
  color: string;
}

export default function LikeExcel() {
  const spreadsheetRef = useRef<SpreadsheetComponent>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isSaving = useRef(false);
  const [isSavingToDb, setIsSavingToDb] = useState(false);

  // 🌟 檔案池模式：網址帶 ?poolFile=xxx.xlsx 時，直接載入該檔案供檢視與編輯
  //    ?owner= 帶的是檔案「擁有者」email：受邀共同編輯的人開啟連結時會帶這個參數，
  //    藉此存取擁有者檔案池中的檔案，而非自己的檔案池。
  const poolFile = searchParams.get('poolFile');
  const ownerParam = searchParams.get('owner');
  const [poolInfo, setPoolInfo] = useState<PoolFileInfo | null>(null);
  const [isSavingToPool, setIsSavingToPool] = useState(false);
  const isFileOwner = !ownerParam || (!!user && ownerParam === user.email);

  // 🌟 邀請共同編輯彈窗狀態
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmailInput, setInviteEmailInput] = useState('');
  const [inviteList, setInviteList] = useState<string[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [fileOwnerEmail, setFileOwnerEmail] = useState<string | null>(null);

  // 存放從 MongoDB 撈出來的下拉選單資料源
  const [templateOptions, setTemplateOptions] = useState<MongoTemplateOption[]>([]);
  // 當前選中的 MongoDB 範本物件實體
  const [selectedTemplate, setSelectedTemplate] = useState<MongoTemplateOption | null>(null);
  // 備用本機下載預設檔名
  const [templateName, setTemplateName] = useState("未命名矩陣範本.xlsx");

  // 🌟 即時協作狀態：目前在線協作者與 Yjs 連線初始化狀態
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const yDocRef = useRef<Y.Doc | null>(null);
  const wsProviderRef = useRef<WebsocketProvider | null>(null);

  // 已登入的使用者身分（來自 AuthContext），保存在 ref 供事件 callback 使用
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // 📝 儲存格修改紀錄：先記下編輯前的舊值，供理由對話框顯示
  const cellOldValueRef = useRef<{ address: string; value: any } | null>(null);
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [pendingCellChange, setPendingCellChange] = useState<{
    address: string;
    oldValue: any;
    newValue: any;
  } | null>(null);
  const [changeReason, setChangeReason] = useState('');

  // 🌟 核心優化：元件掛載時自動至 MongoDB 專屬路由提取所有已設計的真實範本清單
  useEffect(() => {
    console.log("🔍 Fetching real templates from MongoDB...");

    apiFetch('/api/spreadsheet/get-templates')
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

  // 🌟 檔案池模式：載入檔案內容至試算表
  //    Spreadsheet 元件可能尚未 created 完成，先暫存於 ref，待 created 事件再套用
  const pendingPoolJson = useRef<string | null>(null);

  const applyPoolJson = (jsonObject: string) => {
    const spreadsheet = spreadsheetRef.current as any;
    if (!spreadsheet) {
      pendingPoolJson.current = jsonObject;
      return;
    }
    spreadsheet.open({ jsonObject });
    setTimeout(() => spreadsheet.hideSpinner && spreadsheet.hideSpinner(), 100);
  };

  useEffect(() => {
    if (!poolFile) return;

    console.log(`📖 從 Excel 檔案池載入: ${poolFile}${ownerParam ? ` (擁有者: ${ownerParam})` : ''}`);
    const ownerQuery = ownerParam ? `?owner=${encodeURIComponent(ownerParam)}` : '';
    apiFetch(`/api/excel-pool/open/${encodeURIComponent(poolFile)}${ownerQuery}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || '開啟檔案失敗');
        return data;
      })
      .then((data) => {
        setPoolInfo({
          fileName: data.fileName,
          displayName: data.displayName,
          sheetCount: data.sheetCount,
          sheetNames: data.sheetNames || [],
          canOverwrite: !!data.canOverwrite
        });
        setTemplateName(data.fileName);
        applyPoolJson(data.jsonObject);
        console.log(`✅ 已載入檔案池檔案 (共 ${data.sheetCount} 個工作表，編輯器僅載入第一個)`);
      })
      .catch((err) => {
        console.error('❌ 開啟檔案池檔案失敗:', err);
        alert(`❌ 無法開啟檔案 [${poolFile}]:\n${err.message}`);
      });
  }, [poolFile, ownerParam]);

  // 🌟 檔案池模式：將編輯後的內容回存檔案池
  const onSaveToPool = (mode: 'overwrite' | 'new') => {
    const spreadsheet = spreadsheetRef.current as any;
    if (!spreadsheet || !poolInfo || isSavingToPool) return;

    const confirmMsg = mode === 'overwrite'
      ? `確定要以目前畫面的內容「覆蓋」檔案池中的原檔 [${poolInfo.fileName}] 嗎？此動作無法復原。`
      : `將把目前畫面的內容另存為一個新檔案放入檔案池 (原檔 [${poolInfo.fileName}] 保持不變)，確定要繼續嗎？`;
    if (!window.confirm(confirmMsg)) return;

    setIsSavingToPool(true);
    spreadsheet.saveAsJson().then((response: any) => {
      const workbookJson = response.jsonObject
        ? JSON.parse(response.jsonObject).Workbook
        : (response.Workbook || response);

      apiFetch('/api/excel-pool/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: poolInfo.fileName, mode, owner: ownerParam || undefined, spreadsheetData: workbookJson })
      })
        .then(async (res) => {
          const result = await res.json();
          if (!res.ok || !result.success) throw new Error(result.message || '回存失敗');
          return result;
        })
        .then((result) => {
          alert(`✅ ${result.message}`);
          setIsSavingToPool(false);
        })
        .catch((err) => {
          console.error('❌ 回存檔案池失敗:', err);
          alert(`❌ 回存檔案池發生錯誤:\n${err.message}`);
          setIsSavingToPool(false);
        });
    });
  };

  // 🌟 共同編輯者名單：擁有者本人與已被邀請的人都能看到「誰可以共同編輯這份檔案」，
  //    不只是擁有者在邀請彈窗裡才看得到——一開啟檔案就會讀取一次。
  const loadInvites = useCallback(() => {
    if (!poolInfo) return;
    const ownerQuery = ownerParam ? `?owner=${encodeURIComponent(ownerParam)}` : '';
    apiFetch(`/api/excel-pool/${encodeURIComponent(poolInfo.fileName)}/shares${ownerQuery}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setInviteList(data.invitedEmails || []);
          setFileOwnerEmail(data.ownerEmail || null);
        }
      })
      .catch(err => console.error('讀取共同編輯名單失敗:', err));
  }, [poolInfo, ownerParam]);

  useEffect(() => {
    loadInvites();
  }, [loadInvites]);

  const openInviteModal = () => {
    setInviteEmailInput('');
    setShowInviteModal(true);
    loadInvites();
  };

  const submitInvite = () => {
    const email = inviteEmailInput.trim();
    if (!email || !poolInfo) return;

    setInviteLoading(true);
    apiFetch(`/api/excel-pool/${encodeURIComponent(poolInfo.fileName)}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || '邀請失敗');
        return data;
      })
      .then(() => {
        setInviteEmailInput('');
        loadInvites();
      })
      .catch(err => alert(`❌ 邀請共同編輯失敗:\n${err.message}`))
      .finally(() => setInviteLoading(false));
  };

  const revokeInvite = (email: string) => {
    if (!poolInfo) return;
    apiFetch(`/api/excel-pool/${encodeURIComponent(poolInfo.fileName)}/invite/${encodeURIComponent(email)}`, {
      method: 'DELETE'
    })
      .then(() => loadInvites())
      .catch(err => console.error('取消共同編輯權限失敗:', err));
  };

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

  // 📝 將儲存格修改紀錄送至伺服器
  const logCellChange = useCallback((cellAddress: string, oldValue: any, newValue: any, reason: string) => {
    if (!selectedTemplate) return;
    const userEmail = userRef.current?.email || 'anonymous';

    apiFetch('/api/spreadsheet/log-cell-change', {
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
  }, [selectedTemplate]);

  const handleReasonSubmit = () => {
    if (pendingCellChange) {
      logCellChange(pendingCellChange.address, pendingCellChange.oldValue, pendingCellChange.newValue, changeReason);
    }
    setShowReasonDialog(false);
    setPendingCellChange(null);
    setChangeReason('');
  };

  const handleReasonCancel = () => {
    if (pendingCellChange) {
      // 未填寫原因仍會記錄，只是 reason 為空
      logCellChange(pendingCellChange.address, pendingCellChange.oldValue, pendingCellChange.newValue, '');
    }
    setShowReasonDialog(false);
    setPendingCellChange(null);
    setChangeReason('');
  };

  // 🌟 即時協作：房間名稱的計算
  //    - 檔案池模式：以「擁有者 email + 實體檔名」為鍵，讓擁有者與受邀共同編輯者
  //      不論各自選了哪個範本下拉選單，都會進到同一個協作房間、看到彼此的即時編輯。
  //    - 一般範本模式（無 poolFile）：維持原本以 templateCode 為鍵。
  const sanitizeForRoom = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '_');

  // 🌟 即時協作：依檔案（或範本代碼）建立/重建 Yjs + WebSocket 連線房間
  useEffect(() => {
    const templateCode = selectedTemplate?.templateCode;
    if (!poolFile && !templateCode) return;

    const doc = new Y.Doc();
    yDocRef.current = doc;

    const roomName = poolFile
      ? `excel-room-pool-${sanitizeForRoom(ownerParam || userRef.current?.email || 'guest')}-${sanitizeForRoom(poolFile)}`
      : `excel-room-${templateCode}`;
    console.log(`🔌 [WebSocket 建立連線] 房號: ${roomName}`);
    const provider = new WebsocketProvider(WS_BASE, roomName, doc);
    wsProviderRef.current = provider;

    const getUserColor = (email: string) => {
      let hash = 0;
      for (let i = 0; i < email.length; i++) {
        hash = email.charCodeAt(i) + ((hash << 5) - hash);
      }
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
            const userColor = getUserColor(cellInfo.user);
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
      setIsInitialized(false);
      setCollaborators([]);
    };
  }, [poolFile, ownerParam, selectedTemplate?.templateCode]);

  // 🌟 修正對齊版：手動觸發轉檔匯出 Excel (精準適應後端 saveX2 的 JSONData 結構)
  const onSaveWithStyle = () => {
    const spreadsheet = spreadsheetRef.current as any;
    if (!spreadsheet || isSaving.current) return;

    isSaving.current = true;
    console.log("🎨 Exporting with ExcelJS styles via SaveX2...");

    spreadsheet.saveAsJson().then((response: any) => {
      // 核心包裝：解開 Workbook 並將其字串化放入 JSONData
      const payload = {
        JSONData: JSON.stringify(response.jsonObject ? JSON.parse(response.jsonObject).Workbook : response)
      };

      apiFetch('/api/spreadsheet/saveX2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(res => {
        if (!res.ok) throw new Error("Server error during styled export");
        return res.blob();
      })
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = templateName.endsWith('.xlsx') ? templateName : `${templateName}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        isSaving.current = false;
        console.log("✅ Styled file downloaded successfully");
      })
      .catch(err => {
        console.error("❌ Save Error:", err);
        alert(`匯出 Excel 發生錯誤: ${err.message}`);
        isSaving.current = false;
      });
    });
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
      apiFetch('/api/spreadsheet/save-excel-to-mssql-by-template', {
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

  const onBeforeOpen = (args: any) => {
    args.cancel = true;
    const file = args.file;
    const formData = new FormData();
    formData.append('file', file);

    if (file && file.name) {
      setTemplateName(file.name);
    }

    apiFetch('/api/spreadsheet/open', {
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

  // 📝 儲存格編輯完成：寫入 Yjs 供其他協作者同步，並跳出理由對話框
  const onActionComplete = (args: any) => {
    const data = args.eventArgs;
    if (args.action === 'cellSave' && data) {
      const cellPart = data.address.split('!')[1];
      const colLetter = cellPart.match(/[A-Z]+/)?.[0];
      const rowMatch = cellPart.match(/\d+/)?.[0];
      const userEmail = userRef.current?.email || "anonymous";

      if (colLetter && rowMatch) {
        const rowIndex = parseInt(rowMatch) - 1;
        const colIndex = colLetter.toUpperCase().charCodeAt(0) - 65;
        const value = data.value !== undefined ? data.value : args.eventArgs.value;

        const capturedOldValue = cellOldValueRef.current;
        const oldValue = (capturedOldValue && capturedOldValue.address === data.address)
          ? capturedOldValue.value
          : null;
        setPendingCellChange({ address: data.address, oldValue, newValue: value });
        setShowReasonDialog(true);
        cellOldValueRef.current = null;

        const yCellsMap = yDocRef.current?.getMap('cells_data');
        yCellsMap?.set(data.address, {
          value: value,
          address: data.address,
          rowIndex: rowIndex,
          colIndex: colIndex,
          user: userEmail
        });
      }
    }
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-white">

      {/* TOP NAV BAR & TEMPLATE SELECTOR */}
      <div className="h-12 border-b border-slate-200 flex items-center justify-between px-4 shrink-0 bg-slate-900 text-white">
        <div className="flex items-center gap-4 flex-1">
          <button
            onClick={() => navigate(poolInfo ? '/like-excel-list' : '/tools')}
            className="text-slate-400 hover:text-white text-sm font-bold flex items-center gap-1 transition-colors shrink-0"
          >
            ← <span className="hidden sm:inline">{poolInfo ? 'Back to File Pool' : 'Back to Tools'}</span>
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
          {user && (
            <div className="flex items-center gap-2">
              {user.picture && <img src={user.picture} alt="profile" className="w-6 h-6 rounded-full object-cover" />}
              <span className="text-xs font-medium text-slate-300 hidden sm:inline">{user.name}</span>
            </div>
          )}
          <span className="text-[10px] bg-green-900 text-green-400 px-2 py-0.5 rounded border border-green-800 font-mono">MONGODB_MODE</span>
          <span className="text-[10px] bg-green-900 text-green-400 px-2 py-0.5 rounded border border-green-800 font-mono">CRDT_MODE</span>
        </div>
      </div>

      {/* 🌟 控制按鈕功能列 */}
      <div className="flex items-center gap-2 p-2 bg-slate-800 border-b border-slate-700 shrink-0 shadow-inner">
        {/* 🌟 檔案池模式資訊與回存按鈕 */}
        {poolInfo && (
          <>
            <div className="px-2 py-1 text-xs rounded border border-emerald-600 bg-emerald-950 text-emerald-300 max-w-xs truncate" title={poolInfo.fileName}>
              📄 {poolInfo.displayName}
              <span className="text-emerald-500 font-mono ml-1">({poolInfo.fileName})</span>
            </div>
            {poolInfo.sheetCount > 1 && (
              <div className="px-2 py-1 text-[10px] rounded border border-amber-600 bg-amber-950 text-amber-300" title={poolInfo.sheetNames.join(', ')}>
                ⚠️ 原檔共 {poolInfo.sheetCount} 個工作表，此處僅載入第一個
              </div>
            )}
            <button
              onClick={() => onSaveToPool('new')}
              disabled={isSavingToPool}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm transition-all disabled:opacity-60"
            >
              📄 {isSavingToPool ? '回存中…' : '另存新檔至檔案池'}
            </button>
            {poolInfo.canOverwrite && (
              <button
                onClick={() => onSaveToPool('overwrite')}
                disabled={isSavingToPool}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded text-white bg-rose-700 hover:bg-rose-600 shadow-sm transition-all disabled:opacity-60"
              >
                💾 覆蓋原檔
              </button>
            )}
            {isFileOwner && (
              <button
                onClick={openInviteModal}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded text-white bg-violet-600 hover:bg-violet-500 shadow-sm transition-all"
              >
                🤝 邀請共同編輯
              </button>
            )}
            <div className="h-4 w-[1px] bg-slate-700" />
          </>
        )}

        {selectedTemplate && (
          <div className="px-2 py-1 text-xs font-mono rounded border border-blue-500 bg-blue-950 text-blue-400 hidden sm:block">
            Active Table: {selectedTemplate.targetTable || 'factory_demand_forecast2'}
          </div>
        )}

        {/* 🌟 即時協作中的成員頭像：僅在沒有下方「共同編輯者」清單時顯示，
             避免檔案池模式下同時出現兩份意義重疊的協作者清單 */}
        {!(poolInfo && fileOwnerEmail) && (
          <div className="hidden lg:flex items-center gap-1.5 ml-2">
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
        )}

        {/* 🌟 共同編輯者名單：這份檔案「有權限」的所有人（不論目前是否在線），
             綠點代表目前在線上，灰點代表離線 */}
        {poolInfo && fileOwnerEmail && (
          <div className="hidden lg:flex items-center gap-1.5 ml-3">
            <span className="text-xs text-slate-500">共同編輯者:</span>
            <div className="flex items-center gap-1 flex-wrap">
              {[fileOwnerEmail, ...inviteList].map((email) => {
                const online = collaborators.some((c) => c.email === email);
                const isOwnerEmail = email === fileOwnerEmail;
                return (
                  <span
                    key={email}
                    title={`${email}${isOwnerEmail ? '（擁有者）' : ''} · ${online ? '在線上' : '離線'}`}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border cursor-help ${
                      online
                        ? 'bg-emerald-950 border-emerald-700 text-emerald-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${online ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    {isOwnerEmail && '👑 '}
                    {email.split('@')[0]}
                  </span>
                );
              })}
            </div>
          </div>
        )}

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

        {/* 匯出目前活頁簿為 Excel (含樣式) */}
        <button
          onClick={onSaveWithStyle}
          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold px-4 py-1.5 rounded shadow-sm transition-all flex items-center gap-2"
        >
          <span>📂</span> Export Excel
        </button>
      </div>

      {/* SPREADSHEET AREA */}
      <div className="flex-1 relative w-full bg-white">
        <div className="h-[calc(100vh-80px)] w-full">
          <SpreadsheetComponent
            ref={spreadsheetRef}
            created={() => {
              (window as any).mySpreadsheet = spreadsheetRef.current;
              // 檔案池的內容比元件早一步取回時，於此補上載入
              if (pendingPoolJson.current) {
                const json = pendingPoolJson.current;
                pendingPoolJson.current = null;
                applyPoolJson(json);
              }
            }}
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
            cellEdit={(args: any) => {
              // 📝 編輯開始前先記下舊值，供理由對話框顯示
              if (args.address) {
                cellOldValueRef.current = { address: args.address, value: args.value };
              }
            }}
            actionComplete={onActionComplete}
          />

          {/* Yjs 連線中遮罩層 */}
          {!isInitialized && (
            <div className="absolute inset-0 bg-white/90 backdrop-blur-xs flex flex-col items-center justify-center z-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-3"></div>
              <p className="text-xs font-mono text-slate-500">⚡ 正在安全連結 Yjs 分散式同步房號...</p>
            </div>
          )}

          {/* 🌟 邀請共同編輯對話框 */}
          {showInviteModal && poolInfo && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 w-96 max-w-[90vw]">
                <h3 className="text-lg font-bold text-slate-800 mb-1">邀請共同編輯</h3>
                <p className="text-xs text-slate-500 mb-4 truncate" title={poolInfo.fileName}>
                  檔案：{poolInfo.displayName}
                </p>

                <label className="block text-sm font-medium text-slate-700 mb-1">
                  對方的 Email：
                </label>
                <div className="flex gap-2 mb-4">
                  <input
                    type="email"
                    value={inviteEmailInput}
                    onChange={(e) => setInviteEmailInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitInvite(); }}
                    placeholder="name@example.com"
                    className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                    autoFocus
                  />
                  <button
                    onClick={submitInvite}
                    disabled={inviteLoading || !inviteEmailInput.trim()}
                    className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded transition-colors disabled:opacity-50"
                  >
                    邀請
                  </button>
                </div>

                <div className="text-xs font-semibold text-slate-500 mb-1">已邀請的共同編輯者：</div>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded divide-y divide-slate-100">
                  {inviteList.length === 0 ? (
                    <div className="text-xs text-slate-400 italic p-3">尚未邀請任何人</div>
                  ) : (
                    inviteList.map((email) => (
                      <div key={email} className="flex items-center justify-between px-3 py-2 text-sm text-slate-700">
                        <span className="truncate">{email}</span>
                        <button
                          onClick={() => revokeInvite(email)}
                          className="text-xs text-red-600 hover:text-red-800 font-semibold ml-2 shrink-0"
                        >
                          移除
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex justify-end mt-4">
                  <button
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
                  >
                    關閉
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 📝 儲存格修改原因對話框 */}
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
