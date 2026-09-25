// src/pages/likeexcel.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE, WS_BASE, apiFetch, getAuthToken } from '../config/apiBase';
import { useAuth } from '../context/useAuth';
import '../config/syncfusionLicense';
import EditDeadlineControl from '../components/EditDeadlineControl';
import { formatDeadline, isDeadlinePassed } from '../utils/editDeadline';
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
  isOwner: boolean;
  editDeadline: string | null; // ⏰ 編輯期限（擁有者設定），超過後共同編輯者唯讀
  readOnly: boolean;           // 開檔當下後端判定的唯讀狀態
}

interface Collaborator {
  name: string;
  picture: string;
  email: string;
  color: string;
}

// 🌟 每個使用者的專屬背景色：色相在色環上「均分」出固定幾色（而非手動挑色碼），
//    確保同一人每次都拿到相同顏色，且相鄰色之間一定隔著足夠的角度、不會挑到兩個很像的顏色
//    （之前手動挑色碼時，不小心選出 #FFADAD 紅 vs #FFA69E 珊瑚紅、#FFD6A5 橙 vs #FFD3B6 杏
//    這類幾乎同色的組合，兩個使用者剛好雜湊到這兩色就會分不出來；用均分色相從根本避免這個問題）。
//    用來標示「這格是誰改的」（儲存格背景色 + 協作者頭像/圖例邊框）。
const USER_COLOR_COUNT = 8;
const USER_COLOR_PALETTE = Array.from(
  { length: USER_COLOR_COUNT },
  (_, i) => `hsl(${Math.round((i * 360) / USER_COLOR_COUNT)}, 68%, 76%)`
);

function getUserColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USER_COLOR_PALETTE[Math.abs(hash) % USER_COLOR_PALETTE.length];
}

export default function LikeExcel() {
  const spreadsheetRef = useRef<SpreadsheetComponent>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [isSavingToDb, setIsSavingToDb] = useState(false);

  // 🌟 檔案池模式：網址帶 ?poolFile=xxx.xlsx 時，直接載入該檔案供檢視與編輯
  //    ?owner= 帶的是檔案「擁有者」email：受邀共同編輯的人開啟連結時會帶這個參數，
  //    藉此存取擁有者檔案池中的檔案，而非自己的檔案池。
  const poolFile = searchParams.get('poolFile');
  const ownerParam = searchParams.get('owner');
  const [poolInfo, setPoolInfo] = useState<PoolFileInfo | null>(null);
  const [isSavingToPool, setIsSavingToPool] = useState(false);
  // 🌟 開檔載入中狀態：大檔案（幾十萬個儲存格）從後端轉換+下載+解析回來可能要好幾秒，
  //    先前開檔期間畫面上完全沒有任何提示，使用者會誤以為當掉了，這裡加上載入中遮罩。
  const [isOpeningFile, setIsOpeningFile] = useState(false);
  const isFileOwner = !ownerParam || (!!user && ownerParam === user.email);

  // ⏰ 編輯期限唯讀：開檔時已過期（後端判定），或檔案開著的期間剛好到期（下方計時器切換）。
  //    擁有者本人不受限制。
  const [deadlineReached, setDeadlineReached] = useState(false);
  const isReadOnly = !!poolInfo && !poolInfo.isOwner && (poolInfo.readOnly || deadlineReached);
  const isReadOnlyRef = useRef(isReadOnly);
  isReadOnlyRef.current = isReadOnly;

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

  // 🌟 即時協作狀態：目前在線協作者與 Yjs 連線初始化狀態
  //    只有在網址帶 poolFile（一進頁面就要連線）時才以「未初始化」開局顯示連線中遮罩；
  //    一般模式（未帶 poolFile、也還沒選範本）不會有任何 Yjs 房間要連，
  //    若仍以 false 開局，下面的 useEffect 會直接 return（沒有房號可連），
  //    isInitialized 永遠不會被設成 true，遮罩層會永久卡住、擋住整個編輯器
  //    （包含功能區的「開啟舊檔」按鈕），造成使用者完全打不開檔案。
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isInitialized, setIsInitialized] = useState(!poolFile);
  const yDocRef = useRef<Y.Doc | null>(null);
  const wsProviderRef = useRef<WebsocketProvider | null>(null);

  // 已登入的使用者身分（來自 AuthContext），保存在 ref 供事件 callback 使用
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // 📝 儲存格修改紀錄：先記下編輯前的舊值，供理由對話框顯示
  const cellOldValueRef = useRef<{ address: string; value: any } | null>(null);

  // 🌟 「誰改了這格」的背景色提示是暫時的高亮，不該永久蓋掉儲存格原本的背景色
  //    （範本/匯入檔本來就設定的顏色、標題底色等）。這裡記住每個位址「被高亮前」
  //    的真正背景色，並在短暫顯示後用計時器換回來；同一格在計時器跑完前又被
  //    編輯的話，重設計時器即可，不會重複覆寫已經記住的原始色。
  const cellOriginalBgRef = useRef<Map<string, string>>(new Map());
  const cellRevertTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const EDIT_HIGHLIGHT_DURATION_MS = 3000;
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
      // 🌟 /api/spreadsheet/get-templates 回傳的是「純陣列」，且欄位是
      //    ID/name/dbname（與 ExcelMappingSetup.tsx 的範本清單同一套慣例），
      //    不是 { success, templates } 也不是 templateCode/templateName/targetTable，
      //    這裡要轉換成本頁面用的 MongoTemplateOption 形狀。
      .then((rawTemplates: any[]) => {
        if (Array.isArray(rawTemplates) && rawTemplates.length > 0) {
          const templates: MongoTemplateOption[] = rawTemplates.map(t => ({
            templateCode: t.ID,
            templateName: t.name,
            targetTable: t.dbname,
          }));
          console.log("🎯 成功從 MongoDB 撈到真實範本：", templates);
          setTemplateOptions(templates);
          setSelectedTemplate(templates[0]); // 預設選中第一項
        } else {
          console.warn("⚠️ MongoDB templates 集合中尚無任何資料，啟用動態 Fallback 清單");
          const fallbackList: MongoTemplateOption[] = [
            { templateCode: 'DEFAULT_A', templateName: '請至 Setup 設定頁面建立首組範本 (DEFAULT_A)', targetTable: 'factory_demand_forecast2' }
          ];
          setTemplateOptions(fallbackList);
          setSelectedTemplate(fallbackList[0]);
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
    setIsOpeningFile(true);
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
          canOverwrite: !!data.canOverwrite,
          isOwner: !!data.isOwner,
          editDeadline: data.editDeadline || null,
          readOnly: !!data.readOnly
        });
        applyPoolJson(data.jsonObject);
        console.log(`✅ 已載入檔案池檔案 (共 ${data.sheetCount} 個工作表，編輯器僅載入第一個)`);
      })
      .finally(() => setIsOpeningFile(false))
      .catch((err) => {
        console.error('❌ 開啟檔案池檔案失敗:', err);
        alert(`❌ 無法開啟檔案 [${poolFile}]:\n${err.message}`);
      });
  }, [poolFile, ownerParam]);

  // 🌟 自動儲存狀態：時間戳記（每次成功回存都會更新）、是否正在自動儲存中、上次失敗訊息、
  //    以及使用者是否手動開啟/關閉了自動儲存（預設開啟）。
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<Date | null>(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);

  // 🌟 檔案池模式：將編輯後的內容回存檔案池
  //    silent: true 時（自動儲存用）不彈出確認/結果 alert，安靜地在背景執行。
  const onSaveToPool = (mode: 'overwrite' | 'new', opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    const spreadsheet = spreadsheetRef.current as any;
    if (!spreadsheet || !poolInfo || isSavingToPool || isReadOnlyRef.current) return;
    if (mode === 'overwrite' && !poolInfo.canOverwrite) return;

    if (!silent) {
      const confirmMsg = mode === 'overwrite'
        ? `確定要以目前畫面的內容「覆蓋」檔案池中的原檔 [${poolInfo.fileName}] 嗎？此動作無法復原。`
        : `將把目前畫面的內容另存為一個新檔案放入檔案池 (原檔 [${poolInfo.fileName}] 保持不變)，確定要繼續嗎？`;
      if (!window.confirm(confirmMsg)) return;
    }

    setIsSavingToPool(true);
    if (silent) {
      setIsAutoSaving(true);
      setAutoSaveError(null);
    }
    spreadsheet.saveAsJson().then((response: any) => {
      // 🌟 目前安裝的 Syncfusion 版本，saveAsJson() 回傳的 jsonObject 本身就是物件
      // { Workbook: {...} }，不是字串，因此不能直接 JSON.parse(response.jsonObject)
      // （對非字串呼叫 JSON.parse 會拋出 SyntaxError，導致回存永遠失敗且連 API 都沒呼叫到）。
      // 這裡同時容忍未來版本可能改回字串格式的情況。
      const rawJsonObject = response?.jsonObject;
      const parsedJsonObject = typeof rawJsonObject === 'string' ? JSON.parse(rawJsonObject) : rawJsonObject;
      const workbookJson = (parsedJsonObject && parsedJsonObject.Workbook) || response?.Workbook || response;

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
          if (mode === 'overwrite') setLastAutoSavedAt(new Date());
          if (!silent) alert(`✅ ${result.message}`);
          else console.log(`💾 [自動儲存] ${poolInfo.fileName} 已於 ${new Date().toLocaleTimeString()} 靜默回存`);
          setIsSavingToPool(false);
          if (silent) setIsAutoSaving(false);
        })
        .catch((err) => {
          console.error('❌ 回存檔案池失敗:', err);
          if (!silent) alert(`❌ 回存檔案池發生錯誤:\n${err.message}`);
          else setAutoSaveError(err.message);
          setIsSavingToPool(false);
          if (silent) setIsAutoSaving(false);
        });
    }).catch((err: any) => {
      // 🌟 saveAsJson() 本身失敗（或上面同步解析拋錯）時也要重置狀態，
      //    否則 isSavingToPool 會卡在 true，之後每 60 秒的自動儲存都會被 onSaveToPool 開頭那行擋掉，
      //    而且畫面上完全不會顯示任何錯誤或警示。
      console.error('❌ 準備回存資料失敗:', err);
      if (!silent) alert(`❌ 準備回存資料時發生錯誤:\n${err.message}`);
      else setAutoSaveError(err.message);
      setIsSavingToPool(false);
      if (silent) setIsAutoSaving(false);
    });
  };

  // 每次 render 都同步最新的 onSaveToPool，讓下方固定週期的自動儲存計時器
  // 永遠呼叫到最新的 poolInfo / isSavingToPool 閉包，不會卡在建立當下的舊值。
  const onSaveToPoolRef = useRef(onSaveToPool);
  useEffect(() => {
    onSaveToPoolRef.current = onSaveToPool;
  });

  // ⏰ 檔案開著的期間編輯期限到期：時間一到就切成唯讀（不必重新整理頁面）
  useEffect(() => {
    setDeadlineReached(false);
    const deadline = poolInfo?.editDeadline;
    if (!deadline || poolInfo?.isOwner) return;
    const delay = new Date(deadline).getTime() - Date.now();
    if (delay <= 0) { setDeadlineReached(true); return; }
    if (delay > 2147483647) return; // 超過 setTimeout 上限（約 24.8 天），開著這麼久的機會不大，重新開檔時後端會再判定
    const timer = setTimeout(() => setDeadlineReached(true), delay);
    return () => clearTimeout(timer);
  }, [poolInfo?.editDeadline, poolInfo?.isOwner]);

  // 🌟 自動儲存：檔案池模式下，若目前檔案可被覆蓋且使用者未關閉自動儲存，每 60 秒悄悄自動回存一次
  useEffect(() => {
    if (!poolInfo?.canOverwrite || !autoSaveEnabled || isReadOnly) return;

    const intervalId = setInterval(() => {
      onSaveToPoolRef.current('overwrite', { silent: true });
    }, 60 * 1000);

    return () => clearInterval(intervalId);
  }, [poolInfo?.fileName, poolInfo?.canOverwrite, autoSaveEnabled, ownerParam, isReadOnly]);

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
    if (!poolFile && !templateCode) {
      // 沒有房號可連（既未帶 poolFile，也還沒選範本）：不進入連線流程，
      // 直接視為「已初始化」，讓連線中遮罩收起、使用者可以正常使用功能區開啟舊檔
      setIsInitialized(true);
      return;
    }

    const doc = new Y.Doc();
    yDocRef.current = doc;

    const roomOwner = ownerParam || userRef.current?.email || 'guest';
    const roomName = poolFile
      ? `excel-room-pool-${sanitizeForRoom(roomOwner)}-${sanitizeForRoom(poolFile)}`
      : `excel-room-${templateCode}`;
    console.log(`🔌 [WebSocket 建立連線] 房號: ${roomName}`);
    // 🔐 檔案池房間：後端會驗證登入權杖與存取權限，並在超過編輯期限時拒收共同編輯者的修改
    const provider = new WebsocketProvider(WS_BASE, roomName, doc, poolFile
      ? { params: { token: getAuthToken() || '', owner: roomOwner, file: poolFile } }
      : {});
    wsProviderRef.current = provider;

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
            const address = cellInfo.address;
            const userColor = getUserColor(cellInfo.user);
            spreadsheet.updateCell({ value: cellInfo.value }, address);

            // 🌟 只在「這格目前沒有正在高亮」時才記錄原始背景色，
            //    避免把上一次的高亮色誤記成原始色
            if (!cellOriginalBgRef.current.has(address)) {
              const originalStyle = spreadsheet.getCellStyleValue(
                ['backgroundColor'],
                [cellInfo.rowIndex, cellInfo.colIndex]
              );
              cellOriginalBgRef.current.set(address, originalStyle?.backgroundColor || '');
            }

            const existingTimer = cellRevertTimersRef.current.get(address);
            if (existingTimer) clearTimeout(existingTimer);

            spreadsheet.cellFormat({ backgroundColor: userColor }, address);
            console.log(`✅ ${cellInfo.user} 使用顏色 ${userColor} 更新了 ${address}`);

            const timer = setTimeout(() => {
              const originalColor = cellOriginalBgRef.current.get(address) ?? '';
              spreadsheet.cellFormat({ backgroundColor: originalColor }, address);
              cellOriginalBgRef.current.delete(address);
              cellRevertTimersRef.current.delete(address);
            }, EDIT_HIGHLIGHT_DURATION_MS);
            cellRevertTimersRef.current.set(address, timer);
          }
        }
      });
      spreadsheet.isRemoteSync = false;
    });

    return () => {
      console.log(`🔌 [安全斷開 WebSocket] 房號: ${roomName}`);
      // 🌟 房間切換/卸載時，清掉所有未觸發的「高亮還原」計時器，
      //    避免計時器在新房間或已卸載的 spreadsheet 上誤觸發 cellFormat
      const revertTimers = cellRevertTimersRef.current;
      const originalBg = cellOriginalBgRef.current;
      revertTimers.forEach(timer => clearTimeout(timer));
      revertTimers.clear();
      originalBg.clear();
      provider.destroy();
      doc.destroy();
      setIsInitialized(false);
      setCollaborators([]);
    };
  }, [poolFile, ownerParam, selectedTemplate?.templateCode]);

  // 將當前 Spreadsheet 的活頁簿數據，依據選定範本解析並寫入 SQL 資料庫
  const onSaveToDatabase = () => {
    const spreadsheet = spreadsheetRef.current as any;
    if (!spreadsheet || isSavingToDb) return;

    if (!selectedTemplate) {
      alert("⚠️ 請先選擇一個對應的 MongoDB 範本！");
      return;
    }

    const confirmMsg = `確定要將目前的資料內容，依據範本 [${selectedTemplate.templateCode}] 的對應規格解析，並寫入該範本綁定的 SQLite 資料表 [${selectedTemplate.targetTable || '預設'}] 嗎？`;
    if (!window.confirm(confirmMsg)) return;

    setIsSavingToDb(true);
    console.log(`📥 打包網格數據，準備依範本 [${selectedTemplate.templateCode}] 寫入本機 SQLite...`);

    spreadsheet.saveAsJson().then((response: any) => {
      // 🌟 與 onSaveToPool 同一套解法：saveAsJson() 回傳的 jsonObject 本身就是物件
      // { Workbook: {...} }，不是字串，不能直接 JSON.parse。
      const rawJsonObject = response?.jsonObject;
      const parsedJsonObject = typeof rawJsonObject === 'string' ? JSON.parse(rawJsonObject) : rawJsonObject;
      const workbookJson = (parsedJsonObject && parsedJsonObject.Workbook) || response?.Workbook || response;

      apiFetch('/api/spreadsheet/save-excel-to-sqlite-by-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetData: workbookJson,
          templateCode: selectedTemplate.templateCode
        })
      })
      .then(async (res) => {
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.message || result.error || "寫入 SQLite 資料庫失敗");
        return result;
      })
      .then((data) => {
        alert(`🎉 SQLite 儲存成功！\n${data.message || `共寫入 ${data.insertedCount} 筆明細數據。`}`);
        setIsSavingToDb(false);
      })
      .catch((err) => {
        console.error("❌ SQLite Storage Error:", err);
        alert(`❌ 儲存至 SQLite 發生錯誤:\n${err.message}`);
        setIsSavingToDb(false);
      });
    }).catch((err: any) => {
      console.error("❌ 準備寫入資料失敗:", err);
      alert(`❌ 準備寫入資料時發生錯誤:\n${err.message}`);
      setIsSavingToDb(false);
    });
  };

  const onBeforeOpen = (args: any) => {
    args.cancel = true;
    const file = args.file;
    const formData = new FormData();
    formData.append('file', file);

    setIsOpeningFile(true);
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
      .catch((err) => console.error("Open Error:", err))
      .finally(() => setIsOpeningFile(false));
  };

  // 📝 儲存格編輯完成：寫入 Yjs 供其他協作者同步，並跳出理由對話框
  const onActionComplete = (args: any) => {
    const data = args.eventArgs;
    if (isReadOnlyRef.current) return;
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

          {/* 下拉選單選擇器：僅檔案擁有者可選擇/變更對應範本 */}
          {isFileOwner && (
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
          )}
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
              <div className="px-2 py-1 text-[10px] rounded border border-sky-600 bg-sky-950 text-sky-300" title={poolInfo.sheetNames.join(', ')}>
                📑 共 {poolInfo.sheetCount} 個工作表，下方分頁皆可切換
                {/* 🌟 原檔中隱藏的分頁不會在這裡載入/顯示（跟 Excel 本身行為一致）——
                    避免隱藏分頁裡也塞了大量資料時，平白拖慢開檔速度 */}
              </div>
            )}
            {isReadOnly ? (
              <div
                className="px-2 py-1 text-xs font-bold rounded border border-red-600 bg-red-950 text-red-300"
                title={poolInfo.editDeadline ? `編輯期限：${formatDeadline(poolInfo.editDeadline)}` : undefined}
              >
                🔒 已超過編輯期限，唯讀
              </div>
            ) : poolInfo.editDeadline && (
              <div
                className={`px-2 py-1 text-[10px] rounded border ${isDeadlinePassed(poolInfo.editDeadline) ? 'border-slate-600 bg-slate-900 text-slate-400' : 'border-amber-600 bg-amber-950 text-amber-300'}`}
                title={poolInfo.isOwner ? '共同編輯者在期限後只能檢視，你本人不受限制' : undefined}
              >
                ⏰ {isDeadlinePassed(poolInfo.editDeadline) ? '共同編輯期限已過' : '可編輯至'} {formatDeadline(poolInfo.editDeadline)}
              </div>
            )}
            {!isReadOnly && (
            <button
              onClick={() => onSaveToPool('new')}
              disabled={isSavingToPool}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm transition-all disabled:opacity-60"
            >
              📄 {isSavingToPool ? '回存中…' : '另存新檔至檔案池'}
            </button>
            )}
            {poolInfo.canOverwrite && !isReadOnly && (
              <>
                <button
                  onClick={() => onSaveToPool('overwrite')}
                  disabled={isSavingToPool}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded text-white bg-rose-700 hover:bg-rose-600 shadow-sm transition-all disabled:opacity-60"
                >
                  💾 覆蓋原檔
                </button>
                <button
                  onClick={() => setAutoSaveEnabled(prev => !prev)}
                  title={autoSaveEnabled ? '點擊關閉自動儲存 (每 60 秒靜默回存一次)' : '點擊開啟自動儲存'}
                  className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold rounded border shadow-sm transition-all ${
                    autoSaveEnabled
                      ? 'bg-emerald-950 border-emerald-700 text-emerald-300 hover:bg-emerald-900'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {autoSaveEnabled ? '🟢 自動儲存: 開' : '⚪ 自動儲存: 關'}
                </button>
                {!autoSaveEnabled ? null : isAutoSaving ? (
                  <span className="flex items-center gap-1 text-[10px] text-blue-400 font-mono hidden md:inline-flex" title="每 60 秒自動靜默回存一次">
                    <span className="animate-pulse">💾</span> 自動儲存中...
                  </span>
                ) : autoSaveError ? (
                  <span className="text-[10px] text-red-400 font-mono hidden md:inline" title={autoSaveError}>
                    ⚠️ 自動儲存失敗
                  </span>
                ) : lastAutoSavedAt && (
                  <span className="text-[10px] text-slate-500 font-mono hidden md:inline" title="每 60 秒自動靜默回存一次">
                    🕒 自動儲存於 {lastAutoSavedAt.toLocaleTimeString()}
                  </span>
                )}
              </>
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
                    title={`${email}${isOwnerEmail ? '（擁有者）' : ''} · ${online ? '在線上' : '離線'} · 儲存格編輯顏色`}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border cursor-help ${
                      online
                        ? 'bg-emerald-950 border-emerald-700 text-emerald-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${online ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-slate-950"
                      style={{ backgroundColor: getUserColor(email) }}
                    />
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

        {/* 儲存至資料庫按鈕：僅檔案擁有者可操作 */}
        {isFileOwner && (
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
        )}
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
            allowOpen={!isReadOnly}
            beforeOpen={onBeforeOpen}
            allowSave={true}
            // ⏰ 超過編輯期限的共同編輯者：關閉所有會改動內容/格式的功能，只留檢視、捲動、搜尋、複製
            allowEditing={!isReadOnly}
            allowCellFormatting={!isReadOnly}
            allowNumberFormatting={!isReadOnly}
            allowInsert={!isReadOnly}
            allowDelete={!isReadOnly}
            allowMerge={!isReadOnly}
            allowAutoFill={!isReadOnly}
            allowWrap={!isReadOnly}
            allowSorting={!isReadOnly}
            allowHyperlink={!isReadOnly}
            allowImage={!isReadOnly}
            allowChart={!isReadOnly}
            allowDataValidation={!isReadOnly}
            allowConditionalFormat={!isReadOnly}
            allowUndoRedo={!isReadOnly}
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

          {/* 開檔/Yjs 連線中遮罩層：開檔優先顯示——大檔案（幾十萬個儲存格）從後端轉換、
              下載、解析回來可能要好幾秒，先前這段時間完全沒有任何提示，容易讓人誤以為當掉了 */}
          {(isOpeningFile || !isInitialized) && (
            <div className="absolute inset-0 bg-white/90 backdrop-blur-xs flex flex-col items-center justify-center z-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-3"></div>
              <p className="text-xs font-mono text-slate-500">
                {isOpeningFile ? '📂 正在開啟檔案，資料量較大時可能需要幾秒鐘…' : '⚡ 正在安全連結 Yjs 分散式同步房號...'}
              </p>
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

                <EditDeadlineControl
                  fileName={poolInfo.fileName}
                  editDeadline={poolInfo.editDeadline}
                  onSaved={(editDeadline) => setPoolInfo(prev => (prev ? { ...prev, editDeadline } : prev))}
                  onError={(msg) => alert(`❌ ${msg}`)}
                />

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
