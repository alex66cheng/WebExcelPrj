// src/components/EditDeadlineControl.tsx
import { useEffect, useState } from 'react';
import { apiFetch } from '../config/apiBase';
import { isDeadlinePassed, formatDeadline, toLocalInputValue } from '../utils/editDeadline';

// ⏰ 檔案池檔案的「編輯期限」設定（僅擁有者使用）：超過期限後受邀的共同編輯者只能檢視，
//    擁有者本人不受限制。放在兩個「邀請共同編輯」對話框裡共用（檔案池清單、線上編輯器）。

interface Props {
  fileName: string;
  editDeadline: string | null;
  onSaved: (editDeadline: string | null) => void;
  onError?: (message: string) => void;
}

export default function EditDeadlineControl({ fileName, editDeadline, onSaved, onError }: Props) {
  const [value, setValue] = useState(toLocalInputValue(editDeadline));
  const [saving, setSaving] = useState(false);

  useEffect(() => { setValue(toLocalInputValue(editDeadline)); }, [editDeadline]);

  const save = (next: string | null) => {
    setSaving(true);
    apiFetch(`/api/excel-pool/${encodeURIComponent(fileName)}/deadline`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      // datetime-local 是瀏覽器本地時間，轉成 ISO（UTC）再送出，後端與其他時區的人才會看到同一個時間點
      body: JSON.stringify({ editDeadline: next ? new Date(next).toISOString() : null })
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || '設定編輯期限失敗');
        onSaved(data.editDeadline || null);
      })
      .catch(err => onError?.((err as Error).message))
      .finally(() => setSaving(false));
  };

  const expired = isDeadlinePassed(editDeadline);

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-slate-700 mb-1">⏰ 編輯期限：</label>
      <div className="flex gap-2">
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 min-w-0 border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
        />
        <button
          onClick={() => save(value)}
          disabled={saving || !value || value === toLocalInputValue(editDeadline)}
          className="px-3 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded transition-colors disabled:opacity-50"
        >
          設定
        </button>
        {editDeadline && (
          <button
            onClick={() => save(null)}
            disabled={saving}
            className="px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors disabled:opacity-50"
          >
            清除
          </button>
        )}
      </div>
      <p className={`text-xs mt-1 ${expired ? 'text-red-600' : 'text-slate-500'}`}>
        {!editDeadline
          ? '未設定期限：共同編輯者可隨時編輯。'
          : expired
            ? `已於 ${formatDeadline(editDeadline)} 到期，共同編輯者目前為唯讀（你本人仍可編輯）。`
            : `共同編輯者可編輯至 ${formatDeadline(editDeadline)}，之後變為唯讀（你本人不受限制）。`}
      </p>
    </div>
  );
}
