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

// 巨集腳本以註解宣告執行前要詢問使用者的值：// @input name "提示文字" "預設值"
// 寫在函式正上方（連續註解行）只屬於該函式；其他位置的宣告不論執行哪個函式都會詢問
export interface MacroInputDecl { name: string; label: string; defaultValue: string; fn: string | null }

export function listMacroInputs(script: string, entry = ''): MacroInputDecl[] {
  const lines = script.split('\n');
  const decls: MacroInputDecl[] = [];
  const re = /^\s*\/\/\s*@input\s+([A-Za-z_$][\w$]*)(?:\s+"([^"]*)")?(?:\s+"([^"]*)")?/;
  lines.forEach((line, i) => {
    const m = line.match(re);
    if (!m) return;
    // 往下跳過連續註解行，看緊接著的是不是最外層函式宣告
    let j = i + 1;
    while (j < lines.length && /^\s*\/\//.test(lines[j])) j++;
    const fn = j < lines.length ? listTopLevelFunctions(lines[j])[0] ?? null : null;
    decls.push({ name: m[1], label: m[2] ?? m[1], defaultValue: m[3] ?? '', fn });
  });
  // entry 為空（執行整份腳本）時全部詢問；有指定函式時只問全域的與該函式的
  const picked = decls.filter(d => !entry || d.fn === null || d.fn === entry);
  return picked.filter((d, i) => picked.findIndex(o => o.name === d.name) === i);
}
