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
