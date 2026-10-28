// 列出巨集腳本最外層（行首、無縮排）宣告的函式，供步驟 5 與 LikeExcel 的函式下拉選單選擇執行
export function listTopLevelFunctions(script: string): string[] {
  const patterns = [
    /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/gm,
    /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/gm,
  ];
  const names = new Set<string>();
  for (const re of patterns) {
    for (const m of script.matchAll(re)) names.add(m[1]);
  }
  return [...names];
}

// 巨集腳本以註解宣告執行前要詢問使用者的值：// @input name "提示文字" "預設值" [選項...]
// 寫在函式正上方（連續註解行）只屬於該函式；其他位置的宣告不論執行哪個函式都會詢問
// 選項（仿 VBA UserForm 版面）：
//   same            與上一個欄位排在同一列（例如「客戶要求日 ___ 至 ___」）
//   hint="Y:未交"    欄位右側的說明文字
//   width=s|m|l|xl  輸入框寬度（預設 m）
//   color=blue      標籤／說明文字顏色（CSS 顏色名稱或 #rrggbb）
//   required        必填，空白時不能按 OK
// 視窗標題：// @form "手動客戶交期回覆維護"
export type MacroInputWidth = 's' | 'm' | 'l' | 'xl';
export interface MacroInputDecl {
  name: string; label: string; defaultValue: string; fn: string | null;
  hint: string; width: MacroInputWidth; color: string; sameRow: boolean; required: boolean;
}

// 解析 `key=value`、`key="含空白的值"`、單獨旗標
function parseInputOptions(rest: string) {
  const opts: Record<string, string> = {};
  for (const m of rest.matchAll(/([A-Za-z]+)(?:=(?:"([^"]*)"|(\S+)))?/g)) {
    opts[m[1].toLowerCase()] = m[2] ?? m[3] ?? 'true';
  }
  return opts;
}

const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/;

export function listMacroInputs(script: string, entry = ''): MacroInputDecl[] {
  const lines = script.split('\n');
  const decls: MacroInputDecl[] = [];
  const re = /^\s*\/\/\s*@input\s+([A-Za-z_$][\w$]*)(?:\s+"([^"]*)")?(?:\s+"([^"]*)")?(.*)$/;
  lines.forEach((line, i) => {
    const m = line.match(re);
    if (!m) return;
    // 往下跳過連續註解行，看緊接著的是不是最外層函式宣告
    let j = i + 1;
    while (j < lines.length && /^\s*\/\//.test(lines[j])) j++;
    const fn = j < lines.length ? listTopLevelFunctions(lines[j])[0] ?? null : null;
    const opts = parseInputOptions(m[4] ?? '');
    const width = (['s', 'm', 'l', 'xl'] as const).find(w => w === opts.width) ?? 'm';
    decls.push({
      name: m[1], label: m[2] ?? m[1], defaultValue: m[3] ?? '', fn,
      hint: opts.hint && opts.hint !== 'true' ? opts.hint : '',
      width,
      color: opts.color && SAFE_COLOR.test(opts.color) ? opts.color : '',
      sameRow: 'same' in opts,
      required: 'required' in opts,
    });
  });
  // entry 為空（執行整份腳本）時全部詢問；有指定函式時只問全域的與該函式的
  const picked = decls.filter(d => !entry || d.fn === null || d.fn === entry);
  return picked.filter((d, i) => picked.findIndex(o => o.name === d.name) === i);
}

// // @form "標題"：輸入視窗的標題。寫在函式正上方只屬於該函式，否則為全域；函式專屬的優先
export function macroFormTitle(script: string, entry = ''): string {
  const lines = script.split('\n');
  let globalTitle = '';
  let fnTitle = '';
  lines.forEach((line, i) => {
    const m = line.match(/^\s*\/\/\s*@form\s+"([^"]*)"/);
    if (!m) return;
    let j = i + 1;
    while (j < lines.length && /^\s*\/\//.test(lines[j])) j++;
    const fn = j < lines.length ? listTopLevelFunctions(lines[j])[0] ?? null : null;
    if (fn === null) globalTitle ||= m[1];
    else if (entry && fn === entry) fnTitle ||= m[1];
  });
  return fnTitle || globalTitle;
}
