// src/pages/LikeExcelList.tsx
import { useState } from 'react';

interface ExcelUploadRecord {
  id: string;
  batchNo: string;       // 批次編號
  fileName: string;      // 檔案名稱
  templateName: string;  // 使用的對應範本
  uploadUser: string;    // 上傳人員
  uploadAt: string;      // 上傳時間
  rowCount: number;      // 總資料列數
  status: 'success' | 'warning' | 'processing'; // 狀態
  errorMessage?: string; // 錯誤訊息提示
}

// 模擬從 MongoDB 撈出來的歷史匯入紀錄
const mockUploadHistory: ExcelUploadRecord[] = [
  {
    id: 'rec_01',
    batchNo: 'BAT-20260622-001',
    fileName: 'NVIDIA_Q2_Matrix_Forecast_v3.xlsx',
    templateName: 'NVIDIA 矩陣需求預估範本',
    uploadUser: 'Alex Lin (業務部)',
    uploadAt: '2026-06-22 10:30',
    rowCount: 248,
    status: 'success'
  },
  {
    id: 'rec_02',
    batchNo: 'BAT-20260621-004',
    fileName: 'AMD_Shipping_Schedule_June_Final.xlsx',
    templateName: 'AMD 出貨排程範本',
    uploadUser: 'Sarah Wang (資材部)',
    uploadAt: '2026-06-21 16:45',
    rowCount: 120,
    status: 'warning',
    errorMessage: '列 45: [part_number] 格式不符合 Regex 規範，已自動跳過該列。'
  },
  {
    id: 'rec_03',
    batchNo: 'BAT-20260620-002',
    fileName: 'NVIDIA_Q2_Matrix_Backup.xlsx',
    templateName: 'NVIDIA 矩陣需求預估範本',
    uploadUser: 'Alex Lin (業務部)',
    uploadAt: '2026-06-20 11:15',
    rowCount: 248,
    status: 'success'
  },
  {
    id: 'rec_04',
    batchNo: 'BAT-20260619-009',
    fileName: 'Intel_Mainboard_Demand_Raw.xlsx',
    templateName: '未綁定範本 (未分類)',
    uploadUser: 'Kevin Chang (PM)',
    uploadAt: '2026-06-19 09:00',
    rowCount: 15,
    status: 'processing'
  }
];

export default function LikeExcelList() {
  const [history, setHistory] = useState<ExcelUploadRecord[]>(mockUploadHistory);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // 搜尋與狀態篩選邏輯
  const filteredHistory = history.filter(item => {
    const matchesSearch = item.fileName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.batchNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.templateName.includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex flex-col h-full text-slate-800">
      
      {/* 頂部標頭與操作 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-5 mb-6 border-b border-gray-100 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Excel 數據匯入歷史清單</h1>
          <p className="text-sm text-gray-500 mt-1">檢視系統內所有透過範本解析上傳的 Excel 批次紀錄與即時檢核狀態</p>
        </div>
        
        {/* 右上角快速動作按鈕 */}
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm shadow-sm transition-all flex items-center gap-2 shrink-0">
          📤 匯入新 Excel 檔案
        </button>
      </div>

      {/* 關鍵數據儀表板小卡 (KPI) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl">
          <span className="text-xs font-bold text-slate-400 uppercase">總上傳批次</span>
          <div className="text-2xl font-bold text-slate-800 mt-1">{history.length} 筆</div>
        </div>
        <div className="bg-green-50/50 border border-green-100 p-4 rounded-xl">
          <span className="text-xs font-bold text-green-600 uppercase">完全成功</span>
          <div className="text-2xl font-bold text-green-700 mt-1">
            {history.filter(h => h.status === 'success').length} 筆
          </div>
        </div>
        <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-xl">
          <span className="text-xs font-bold text-amber-600 uppercase">有警告異常</span>
          <div className="text-2xl font-bold text-amber-700 mt-1">
            {history.filter(h => h.status === 'warning').length} 筆
          </div>
        </div>
      </div>

      {/* 工具列：搜尋與條件過濾 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4 bg-gray-50 p-3 rounded-xl border border-gray-200">
        <div className="flex-1 relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 text-sm">🔍</span>
          <input 
            type="text"
            placeholder="搜尋檔案名稱、批次號或範本..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-2 pl-9 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="p-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">📊 所有狀態</option>
          <option value="success">🟢 解析成功</option>
          <option value="warning">🟡 包含異常警告</option>
          <option value="processing">🔵 排隊解析中</option>
        </select>
      </div>

      {/* 數據表格區 */}
      <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-200 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <th className="p-4 w-48">批次編號</th>
                <th className="p-4">Excel 檔案名稱</th>
                <th className="p-4">應用設定範本</th>
                <th className="p-4 w-24 text-right">解析資料列</th>
                <th className="p-4 w-40">上傳經辦 / 時間</th>
                <th className="p-4 w-28 text-center">狀態</th>
                <th className="p-4 w-24 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {filteredHistory.length > 0 ? (
                filteredHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                    {/* 批次號 */}
                    <td className="p-4 font-mono text-xs font-semibold text-slate-600">
                      {item.batchNo}
                    </td>
                    {/* 檔案名稱 */}
                    <td className="p-4 font-medium text-slate-900">
                      <div className="flex flex-col">
                        <span>{item.fileName}</span>
                        {item.errorMessage && (
                          <span className="text-xs text-red-500 mt-1 bg-red-50 px-2 py-0.5 rounded border border-red-100 w-fit">
                            ⚠️ {item.errorMessage}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* 使用範本 */}
                    <td className="p-4 text-slate-500">
                      <span className="bg-slate-100 px-2 py-1 rounded text-xs text-slate-700 font-medium">
                        {item.templateName}
                      </span>
                    </td>
                    {/* 資料筆數 */}
                    <td className="p-4 text-right font-mono font-medium text-slate-600">
                      {item.rowCount.toLocaleString()} 列
                    </td>
                    {/* 上傳人員與時間 */}
                    <td className="p-4 text-xs text-slate-500">
                      <div className="font-medium text-slate-700">{item.uploadUser}</div>
                      <div className="text-gray-400 mt-0.5">{item.uploadAt}</div>
                    </td>
                    {/* 狀態標籤 */}
                    <td className="p-4 text-center">
                      {item.status === 'success' && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                          成功匯入
                        </span>
                      )}
                      {item.status === 'warning' && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                          部分異常
                        </span>
                      )}
                      {item.status === 'processing' && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 animate-pulse">
                          佇列處理中
                        </span>
                      )}
                    </td>
                    {/* 操作按鈕 */}
                    <td className="p-4 text-center">
                      <button className="text-blue-600 hover:text-blue-800 font-semibold text-xs bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors">
                        查看數據
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center p-10 text-gray-400 italic bg-gray-50/30">
                    💡 找不到符合條件的匯入歷史紀錄。
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