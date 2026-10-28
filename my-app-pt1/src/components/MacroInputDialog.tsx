// src/components/MacroInputDialog.tsx
import { useCallback, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useT } from '../i18n/useI18n';
import dict from '../i18n/locales/macroInput';
import type { MacroInputDecl, MacroInputWidth } from '../utils/macroFunctions';

// 📝 巨集執行前的輸入視窗：腳本以 // @input 宣告要問的值，按「OK」後把填好的值
//    交給後端沙盒的 input 物件；按「End」/ ✕ / Esc 則不執行巨集。步驟 5 與 LikeExcel 共用。
//    外觀仿 Excel VBA UserForm：灰底、標題列可拖曳、標籤＋凹陷輸入框、same 選項讓欄位並排。
//    用法：const { askInputs, dialog } = useMacroInputDialog(); const values = await askInputs(decls, fnLabel, title);

type Pending = { decls: MacroInputDecl[]; fnLabel: string; title: string; resolve: (v: Record<string, string> | null) => void };

const WIDTH_CLASS: Record<MacroInputWidth, string> = { s: 'w-24', m: 'w-32', l: 'w-48', xl: 'w-80' };

// VBA 表單輸入框的凹陷邊框
const sunken: CSSProperties = { borderStyle: 'solid', borderWidth: 2, borderColor: '#808080 #fff #fff #808080', boxShadow: 'inset 1px 1px 0 #404040' };

// 依 same 選項把欄位分組成列
function groupRows(decls: MacroInputDecl[]) {
  const rows: MacroInputDecl[][] = [];
  decls.forEach(d => {
    if (d.sameRow && rows.length) rows[rows.length - 1].push(d);
    else rows.push([d]);
  });
  return rows;
}

// VBA 風格按鈕：平常凸起、按下時凹陷（用 :active 處理，不需要元件狀態）
const VBA_BUTTON = 'min-w-24 px-6 py-2 bg-[#f0f0f0] text-black text-base border-2 border-solid '
  + '[border-color:#fff_#404040_#404040_#fff] shadow-[inset_-1px_-1px_0_#808080] '
  + 'active:[border-color:#808080_#fff_#fff_#808080] active:shadow-[inset_1px_1px_0_#404040] '
  + 'focus:outline-dotted focus:outline-1 focus:-outline-offset-[6px] focus:outline-black';

export function useMacroInputDialog() {
  const t = useT(dict);
  const [pending, setPending] = useState<Pending | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // 沒有宣告任何 @input 時直接回傳空物件，不跳視窗
  const askInputs = useCallback((decls: MacroInputDecl[], fnLabel: string, title = '') => {
    if (!decls.length) return Promise.resolve<Record<string, string> | null>({});
    return new Promise<Record<string, string> | null>(resolve => {
      setValues(Object.fromEntries(decls.map(d => [d.name, d.defaultValue])));
      setMissing([]);
      setOffset({ x: 0, y: 0 });
      firstInputRef.current = null;
      setPending({ decls, fnLabel, title, resolve });
    });
  }, []);

  const close = (result: Record<string, string> | null) => {
    pending?.resolve(result);
    setPending(null);
  };

  const submit = () => {
    if (!pending) return;
    const empty = pending.decls.filter(d => d.required && !(values[d.name] ?? '').trim()).map(d => d.name);
    setMissing(empty);
    if (empty.length) { inputRefs.current[empty[0]]?.focus(); return; }
    close(values);
  };

  // 拖曳標題列移動視窗
  const onTitlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onTitlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (d) setOffset({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y });
  };
  const onTitlePointerUp = () => { dragRef.current = null; };

  const dialog = pending && (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/20 p-4">
      <form
        className="bg-[#f0f0f0] border border-[#888] shadow-[0_8px_30px_rgba(0,0,0,0.35)] w-fit min-w-[28rem] max-w-[95vw] max-h-[95vh] flex flex-col text-black"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)`, fontFamily: '"PMingLiU", "MingLiU", "Times New Roman", serif' }}
        onSubmit={e => { e.preventDefault(); submit(); }}
        onKeyDown={e => { if (e.key === 'Escape') close(null); }}
      >
        {/* 標題列 */}
        <div
          className="flex items-center justify-between bg-white pl-2 h-8 select-none cursor-default border-b border-[#ccc] touch-none"
          onPointerDown={onTitlePointerDown}
          onPointerMove={onTitlePointerMove}
          onPointerUp={onTitlePointerUp}
        >
          <span className="text-sm truncate" style={{ fontFamily: '"Microsoft JhengHei", "Segoe UI", sans-serif' }}>
            {pending.title || t('title', { fn: pending.fnLabel })}
          </span>
          <button
            type="button"
            onClick={() => close(null)}
            className="h-full w-11 text-lg leading-none hover:bg-[#e81123] hover:text-white"
            aria-label={t('cancel')}
          >
            ✕
          </button>
        </div>

        {/* 欄位區 */}
        <div className="px-12 pt-10 pb-6 space-y-5 overflow-auto">
          {groupRows(pending.decls).map((row, ri) => (
            <div key={ri} className="flex flex-wrap items-center gap-x-8 gap-y-3">
              {row.map((d, ci) => {
                const isMissing = missing.includes(d.name);
                const color = d.color || undefined;
                return (
                  <div key={d.name} className="flex items-center gap-4">
                    <label
                      htmlFor={`macro-input-${d.name}`}
                      className={`text-xl whitespace-nowrap ${ci === 0 ? 'min-w-40' : 'min-w-8'}`}
                      style={{ color }}
                    >
                      {d.label}
                    </label>
                    <input
                      id={`macro-input-${d.name}`}
                      ref={el => {
                        inputRefs.current[d.name] = el;
                        if (ri === 0 && ci === 0 && el && firstInputRef.current !== el) { firstInputRef.current = el; el.focus(); el.select(); }
                      }}
                      type="text"
                      value={values[d.name] ?? ''}
                      onChange={e => {
                        setValues(v => ({ ...v, [d.name]: e.target.value }));
                        if (isMissing) setMissing(m => m.filter(n => n !== d.name));
                      }}
                      className={`${WIDTH_CLASS[d.width]} h-8 px-2 bg-white text-sm text-[#333] focus:outline-none ${isMissing ? 'bg-red-50' : ''}`}
                      style={isMissing ? { ...sunken, borderColor: '#d00' } : sunken}
                      title={isMissing ? t('required') : undefined}
                    />
                    {d.hint && <span className="text-xl whitespace-nowrap" style={{ color }}>{d.hint}</span>}
                  </div>
                );
              })}
            </div>
          ))}
          {missing.length > 0 && <div className="text-sm text-red-600">{t('requiredMissing')}</div>}
        </div>

        {/* 按鈕列 */}
        <div className="flex justify-center gap-36 px-12 pt-6 pb-10">
          <button type="button" onClick={() => close(null)} className={VBA_BUTTON}>{t('cancel')}</button>
          <button type="submit" className={`${VBA_BUTTON} ring-1 ring-black`}>{t('ok')}</button>
        </div>
      </form>
    </div>
  );

  return { askInputs, dialog };
}
