// src/pages/EMailClassifySetup.tsx
import { useState } from 'react';

interface EmailCategory {
  id: string;
  code: string;
  name: string;
  description: string;
  senderName: string;
  senderEmail: string;
  assigneeEmails: string; // 🌟 新增：該類別相關處理人員的 Email (多組用逗號分隔)
  status: 'active' | 'inactive';
}

// 根據你的需求預設 5 個分類與對應的處理人員
const initialCategories: EmailCategory[] = [
  { 
    id: '1', 
    code: 'CAT-REQ', 
    name: '1. 詢價問題', 
    description: '客戶提出產品詢價、規格諮詢或大宗採購需求時觸發', 
    senderName: 'Greenwave 詢價系統', 
    senderEmail: 'sales-bot@greenwave.com',
    assigneeEmails: 'sales_dept@greenwave.com, am_team@greenwave.com', // 預設業務部與AM隊伍
    status: 'active' 
  },
  { 
    id: '2', 
    code: 'CAT-FIN', 
    name: '2. 金流問題', 
    description: '客戶反映發票開立、匯款對帳、退款進度或線上刷卡失敗等金流異常', 
    senderName: 'Greenwave 帳務通知', 
    senderEmail: 'finance-bot@greenwave.com',
    assigneeEmails: 'finance@greenwave.com, billing@greenwave.com', // 預設財務與開票組
    status: 'active' 
  },
  { 
    id: '3', 
    code: 'CAT-LOG', 
    name: '3. 物流問題', 
    description: '出貨進度查詢、變更收件地址、包裹遺失或配送延遲等異常處理', 
    senderName: 'Greenwave 物流中心', 
    senderEmail: 'logistic-bot@greenwave.com',
    assigneeEmails: 'wh_admin@greenwave.com, carrier_ops@greenwave.com', // 預設倉庫管理與物流窗口
    status: 'active' 
  },
  { 
    id: '4', 
    code: 'CAT-RMA', 
    name: '4. 商品不良', 
    description: '收到瑕疵品、商品損壞、規格不符，需要啟動退換貨（RMA）流程', 
    senderName: 'Greenwave 品保售後', 
    senderEmail: 'qa-bot@greenwave.com',
    assigneeEmails: 'qa_dept@greenwave.com, cs_support@greenwave.com', // 預設品保部與客服
    status: 'active' 
  },
  { 
    id: '5', 
    code: 'CAT-OTH', 
    name: '5. 其他', 
    description: '不屬於上述四類的綜合性諮詢、系統操作問題或合作提案', 
    senderName: 'Greenwave 服務網關', 
    senderEmail: 'info@greenwave.com',
    assigneeEmails: 'general_cs@greenwave.com', // 預設總客服
    status: 'active' 
  },
];

export function EMailClassifySetup() {
  const [categories, setCategories] = useState<EmailCategory[]>(initialCategories);
  const [selectedId, setSelectedId] = useState<string>('1');
  const [isEditing, setIsEditing] = useState<boolean>(false);

  const currentCategory = categories.find(c => c.id === selectedId) || categories[0];

  const handleInputChange = (field: keyof EmailCategory, value: string) => {
    setCategories(prev => prev.map(item => 
      item.id === selectedId ? { ...item, [field]: value } : item
    ));
  };

  return (
    <div className="flex flex-col h-full">
      {/* 頁面標頭 */}
      <div className="flex justify-between items-center pb-5 mb-6 border-b border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Email 類別設定</h1>
          <p className="text-sm text-slate-500 mt-1">針對不同事件類別，配置專屬的系統發件人與對應處理窗口的 Email</p>
        </div>
      </div>

      {/* 主要內容區 */}
      <div className="flex-1 flex gap-6 min-h-0">
        
        {/* 左側：5 大類別清單 */}
        <div className="w-1/3 border border-gray-200 rounded-xl overflow-hidden flex flex-col bg-slate-50">
          <div className="p-3 bg-white border-b border-gray-200 text-xs font-bold text-slate-400 uppercase tracking-wider">
            系統預設分類
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {categories.map((cat) => (
              <div
                key={cat.id}
                onClick={() => { setSelectedId(cat.id); setIsEditing(false); }}
                className={`p-3 rounded-lg cursor-pointer transition-all ${
                  selectedId === cat.id
                    ? 'bg-blue-50 border-l-4 border-blue-600 shadow-sm'
                    : 'hover:bg-white border-l-4 border-transparent text-slate-700'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-xs font-mono bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                    {cat.code}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    cat.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {cat.status === 'active' ? '啟用中' : '已停用'}
                  </span>
                </div>
                <h3 className="font-semibold text-sm mt-1.5 text-slate-800">{cat.name}</h3>
                <p className="text-xs text-slate-400 mt-1 truncate">{cat.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 右側：詳細設定與處理人員配置 */}
        <div className="flex-1 border border-gray-200 rounded-xl p-6 bg-white flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-slate-800">類別參數與窗口配置</h2>
              <button 
                onClick={() => setIsEditing(!isEditing)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  isEditing 
                    ? 'bg-green-600 hover:bg-green-700 text-white' 
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {isEditing ? '💾 儲存窗口設定' : '✏️ 編輯人員設定'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-5">
              {/* 類別名稱 */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">類別名稱</label>
                <input 
                  type="text" 
                  disabled
                  value={currentCategory.name}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-slate-700 font-semibold"
                />
              </div>

              {/* 狀態開關 */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">啟用狀態</label>
                <select
                  disabled={!isEditing}
                  value={currentCategory.status}
                  onChange={(e) => handleInputChange('status', e.target.value as 'active' | 'inactive')}
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-white disabled:bg-gray-50"
                >
                  <option value="active">Active (啟用)</option>
                  <option value="inactive">Inactive (停用)</option>
                </select>
              </div>

              {/* 🌟 核心功能：相關處理人員 Email 設定 */}
              <div className="col-span-2 bg-amber-50/40 border border-amber-200/70 rounded-xl p-4">
                <label className="block text-xs font-bold text-amber-800 uppercase tracking-wider mb-2">
                  📬 相關處理人員 Email (通知對象)
                </label>
                <input 
                  type="text" 
                  disabled={!isEditing}
                  placeholder="例如: engineer@company.com, manager@company.com (多組請用半形逗號分開)"
                  value={currentCategory.assigneeEmails}
                  onChange={(e) => handleInputChange('assigneeEmails', e.target.value)}
                  className="w-full p-2.5 border border-amber-200 rounded-lg text-sm bg-white font-mono text-slate-700 disabled:bg-gray-50/50 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 focus:outline-none"
                />
                <p className="text-xs text-amber-700/80 mt-2">
                  * 當系統觸發此分類事件時，將會自動將此信件派發或副本給上方設定的所有處理窗口。
                </p>
              </div>

              {/* 描述說明 */}
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">用途描述說明</label>
                <textarea 
                  rows={2}
                  disabled={!isEditing}
                  value={currentCategory.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50 resize-none"
                />
              </div>

              {/* 發件人名稱 */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">預設系統發件人名稱</label>
                <input 
                  type="text" 
                  disabled={!isEditing}
                  value={currentCategory.senderName}
                  onChange={(e) => handleInputChange('senderName', e.target.value)}
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
                />
              </div>

              {/* 發件人信箱 */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">預設系統發件人信箱</label>
                <input 
                  type="email" 
                  disabled={!isEditing}
                  value={currentCategory.senderEmail}
                  onChange={(e) => handleInputChange('senderEmail', e.target.value)}
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
                />
              </div>
            </div>
          </div>

          {/* 提示訊息 */}
          <div className="mt-6 p-3.5 bg-blue-50/50 rounded-xl border border-blue-100 flex items-start gap-2.5">
            <span className="text-base">💡</span>
            <p className="text-xs text-slate-600 leading-relaxed">
              <strong>開發者提示：</strong> 後端收件時，可以將此處設定的 <code>assigneeEmails</code> 字串以逗號拆分（<code>.split(',')</code>），並帶入到郵件套件（如 Nodemailer）的 <code>to</code> 或 <code>cc</code> 欄位，即可完成自動分流。
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}