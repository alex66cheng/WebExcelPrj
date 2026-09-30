// src/components/MacroInputDialog.tsx
import { useCallback, useRef, useState } from 'react';
import { useT } from '../i18n/useI18n';
import dict from '../i18n/locales/macroInput';
import type { MacroInputDecl } from '../utils/macroFunctions';

// 📝 巨集執行前的輸入視窗：腳本以 // @input 宣告要問的值，按「確定」後把填好的值
//    交給後端沙盒的 input 物件；按「取消」則不執行巨集。步驟 5 與 LikeExcel 共用。
//    用法：const { askInputs, dialog } = useMacroInputDialog(); const values = await askInputs(decls, fnLabel);

type Pending = { decls: MacroInputDecl[]; fnLabel: string; resolve: (v: Record<string, string> | null) => void };

export function useMacroInputDialog() {
  const t = useT(dict);
  const [pending, setPending] = useState<Pending | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  // 沒有宣告任何 @input 時直接回傳空物件，不跳視窗
  const askInputs = useCallback((decls: MacroInputDecl[], fnLabel: string) => {
    if (!decls.length) return Promise.resolve<Record<string, string> | null>({});
    return new Promise<Record<string, string> | null>(resolve => {
      setValues(Object.fromEntries(decls.map(d => [d.name, d.defaultValue])));
      setPending({ decls, fnLabel, resolve });
    });
  }, []);

  const close = (result: Record<string, string> | null) => {
    pending?.resolve(result);
    setPending(null);
  };

  const dialog = pending && (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" onMouseDown={() => close(null)}>
      <form
        className="bg-white rounded-xl shadow-2xl border border-gray-300 w-full max-w-md overflow-hidden"
        onMouseDown={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); close(values); }}
        onKeyDown={e => { if (e.key === 'Escape') close(null); }}
      >
        <div className="bg-slate-800 text-white px-4 py-3 font-bold text-sm">📝 {t('title', { fn: pending.fnLabel })}</div>
        <div className="p-4 space-y-3">
          {pending.decls.map((d, i) => (
            <label key={d.name} className="block text-sm text-slate-700">
              <span className="block mb-1 font-semibold">{d.label}</span>
              <input
                ref={i === 0 ? (el => { if (el && firstInputRef.current !== el) { firstInputRef.current = el; el.focus(); el.select(); } }) : undefined}
                type="text"
                value={values[d.name] ?? ''}
                onChange={e => setValues(v => ({ ...v, [d.name]: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 bg-slate-50 border-t border-slate-200">
          <button type="button" onClick={() => close(null)} className="px-4 py-1.5 border border-slate-300 rounded text-slate-700 hover:bg-slate-100">{t('cancel')}</button>
          <button type="submit" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded">{t('ok')}</button>
        </div>
      </form>
    </div>
  );

  return { askInputs, dialog };
}
