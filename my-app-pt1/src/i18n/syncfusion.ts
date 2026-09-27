// 🌐 Syncfusion UI language (spreadsheet ribbon, context menus, dialogs, filter menu…).
//
// Usage: const locale = useSyncfusionLocale();  <SpreadsheetComponent locale={locale} … />
//
// The ja / zh-TW packs come from @syncfusion/ej2-locale, trimmed and (for zh-TW)
// converted to Taiwan Traditional by scripts/gen-syncfusion-locales.mjs. Each pack
// is a separate lazily-loaded chunk, fetched the first time that language is used.
// The package's translations are machine-made, so the labels people see most are
// corrected by the override tables below (Taiwan Excel wording for zh-TW:
// 列 = row, 欄 = column, 儲存格, 常用, 框線…; Excel's Japanese UI wording for ja).
//
// Runtime switching: when `locale` changes, Spreadsheet.onPropertyChanged calls
// refresh(), which re-renders the component from its model — the loaded workbook
// (the `sheets` model) is kept, only the UI chrome is rebuilt in the new language.
// Number/date formatting stays en-US style: no CLDR data is loaded, and ej2-base
// falls back to its default (en) culture data for Internationalization.
import { useEffect, useState } from 'react';
import { L10n } from '@syncfusion/ej2-base';
import type { Lang } from './lang';
import { useLanguage } from './useI18n';

export type SyncfusionCulture = 'en-US' | 'ja' | 'zh-TW';
type LoadableCulture = Exclude<SyncfusionCulture, 'en-US'>;

const CULTURE_BY_LANG: Record<Lang, SyncfusionCulture> = { en: 'en-US', ja: 'ja', 'zh-TW': 'zh-TW' };

const PACK_LOADERS: Record<LoadableCulture, () => Promise<{ default: string }>> = {
  ja: () => import('./syncfusion/ja.json?raw'),
  'zh-TW': () => import('./syncfusion/zh-TW.json?raw'),
};

// Theme names in the chart-theme picker are product names; keep them in English.
const THEME_NAMES: Record<string, string> = {
  Material: 'Material', MaterialDark: 'Material Dark', Fabric: 'Fabric', FabricDark: 'Fabric Dark',
  Bootstrap: 'Bootstrap', BootstrapDark: 'Bootstrap Dark', Bootstrap4: 'Bootstrap 4',
  Bootstrap5: 'Bootstrap 5', Bootstrap5Dark: 'Bootstrap 5 Dark', Tailwind: 'Tailwind',
  TailwindDark: 'Tailwind Dark', Tailwind3: 'Tailwind 3', Tailwind3Dark: 'Tailwind 3 Dark',
  Fluent: 'Fluent', FluentDark: 'Fluent Dark', Fluent2: 'Fluent 2', Fluent2Dark: 'Fluent 2 Dark',
  Fluent2HighContrast: 'Fluent 2 High Contrast', HighContrast: 'High Contrast', HighContrastLight: 'High Contrast Light',
  ExcelXlsx: 'Microsoft Excel', ExcelXls: 'Microsoft Excel 97-2003',
};

const SPREADSHEET_OVERRIDES: Record<LoadableCulture, Record<string, string>> = {
  ja: {
    ...THEME_NAMES,
    // Ribbon tabs / file menu
    File: 'ファイル', Home: 'ホーム', Insert: '挿入', Formulas: '数式', Data: 'データ', View: '表示', Review: '校閲',
    New: '新規', Open: '開く', Save: '保存', SaveAs: '名前を付けて保存', Print: '印刷', CSV: 'CSV (コンマ区切り)',
    // Clipboard / editing
    Cut: '切り取り', Copy: 'コピー', Paste: '貼り付け', Undo: '元に戻す', Redo: 'やり直し',
    Clear: 'クリア', ClearAll: 'すべてクリア', ClearContents: '数式と値のクリア', ClearFormats: '書式のクリア', ClearHyperlinks: 'ハイパーリンクのクリア',
    // Font / alignment
    Bold: '太字', Italic: '斜体', Formats: '書式', AlignCenter: '中央揃え', Center: '中央',
    WrapText: '折り返して全体を表示する',
    // Merge / borders
    MergeCells: 'セルを結合', MergeAll: 'すべて結合', MergeHorizontally: '横方向に結合', MergeVertically: '縦方向に結合',
    Unmerge: '結合解除', SelectMergeType: '結合の種類を選択',
    Borders: '罫線', TopBorders: '上罫線', LeftBorders: '左罫線', RightBorders: '右罫線', BottomBorders: '下罫線',
    AllBorders: '格子', HorizontalBorders: '横罫線', VerticalBorders: '縦罫線', OutsideBorders: '外枠', InsideBorders: '内側罫線',
    NoBorders: '枠なし', BorderColor: '罫線の色', BorderStyle: '罫線のスタイル',
    // Sheets / view
    Sheet: 'シート', MoveRight: '右へ移動', Hide: '非表示', NameBox: '名前ボックス', InsertFunction: '関数の挿入',
    ShowHeaders: '見出しを表示', HideHeaders: '見出しを非表示', ShowGridLines: '枠線を表示', HideGridLines: '枠線を非表示',
    FreezePanes: 'ウィンドウ枠の固定', FreezeRows: '行の固定', FreezeColumns: '列の固定',
    UnfreezePanes: 'ウィンドウ枠固定の解除', UnfreezeRows: '行の固定を解除', UnfreezeColumns: '列の固定を解除',
    ProtectSheet: 'シートの保護', FormatRows: '行の書式設定', Above: '上', Below: '下',
    // Find & replace
    GotoHeader: 'ジャンプ', SearchBy: '検索方向', FindWhat: '検索する文字列', ReplaceWith: '置換後の文字列',
    FindNextBtn: '次を検索', ReplaceBtn: '置換', MatchCase: '大文字と小文字を区別する', Search: '検索',
    // Sort & filter
    Sort: '並べ替え', SortAscending: '昇順', SortDescending: '降順', CustomSort: 'ユーザー設定の並べ替え',
    SortBy: '最優先されるキー', ThenBy: '次に優先されるキー', ReapplyFilter: '再適用', Blanks: '(空白セル)',
    FilterTrue: 'TRUE', FilterFalse: 'FALSE', Between: '次の値の間', OR: 'OR', AND: 'AND',
    IsEmpty: '空白', IsNotEmpty: '空白以外',
    // Number formats
    General: '標準', Number: '数値', ShortDate: '短い日付形式', LongDate: '長い日付形式', Scientific: '指数', Text: '文字列',
    Custom: 'ユーザー定義', CustomFormat: 'ユーザー定義の表示形式', Statistical: '統計', Logical: '論理',
    // Data validation / conditional formatting
    DataValidation: 'データの入力規則', ClearValidation: '入力規則のクリア', Minimum: '最小値', Maximum: '最大値',
    Date: '日付', Value: '値', Formula: '数式', ClearRules: 'ルールのクリア', RedFill: '赤の塗りつぶし', Unique: '一意',
    InsertLinks: 'リンクの挿入', Link: 'リンク', Update: '更新',
    // Charts
    Column: '縦棒', Bar: '横棒', Area: '面', Pie: '円', PieAndDoughnut: '円/ドーナツ', Line: '折れ線', Scatter: '散布図',
    ClusteredColumn: '集合縦棒', ClusteredBar: '集合横棒', Legends: '凡例',
    PrimaryHorizontal: '第 1 横軸', PrimaryVertical: '第 1 縦軸',
    // Dialog buttons
    Ok: 'OK', OKButton: 'OK', Close: '閉じる', Apply: '適用', MoreOptions: 'その他のオプション',
    Notes: 'メモ',
  },
  'zh-TW': {
    ...THEME_NAMES,
    // Ribbon tabs / file menu
    File: '檔案', Home: '常用', Insert: '插入', Formulas: '公式', Data: '資料', View: '檢視', Review: '校閱',
    New: '新增', Open: '開啟', Save: '儲存', SaveAs: '另存新檔', Print: '列印', CSV: 'CSV (逗號分隔)',
    Spreadsheet: '試算表', FormulaBar: '資料編輯列',
    CollapseToolbar: '摺疊工具列', ExpandToolbar: '展開工具列', CollapseFormulaBar: '摺疊資料編輯列', ExpandFormulaBar: '展開資料編輯列',
    // Clipboard / editing
    PasteSpecial: '選擇性貼上', Undo: '復原', Redo: '取消復原',
    // Font / alignment
    Bold: '粗體', Underline: '底線', TextColor: '字型色彩', FillColor: '填滿色彩', Formats: '格式',
    AlignLeft: '靠左對齊', AlignCenter: '置中', AlignRight: '靠右對齊', Center: '置中',
    AlignTop: '靠上對齊', AlignMiddle: '置中對齊', AlignBottom: '靠下對齊', WrapText: '自動換行',
    // Merge / borders
    Unmerge: '取消合併', SelectMergeType: '選擇合併類型',
    Borders: '框線', TopBorders: '上框線', LeftBorders: '左框線', RightBorders: '右框線', BottomBorders: '下框線',
    AllBorders: '所有框線', HorizontalBorders: '水平框線', VerticalBorders: '垂直框線', OutsideBorders: '外框線',
    InsideBorders: '內框線', NoBorders: '無框線', BorderColor: '框線色彩', BorderStyle: '框線樣式',
    // Sheets / view
    Sheet: '工作表', MoveRight: '向右移動', Rename: '重新命名', NameBox: '名稱方塊',
    ShowGridLines: '顯示格線', HideGridLines: '隱藏格線',
    FreezeRows: '凍結列', FreezeColumns: '凍結欄', UnfreezePanes: '取消凍結窗格', UnfreezeRows: '取消凍結列', UnfreezeColumns: '取消凍結欄',
    ProtectSheet: '保護工作表', FormatCells: '儲存格格式', FormatRows: '設定列格式', FormatColumns: '設定欄格式',
    // Rows / columns (Taiwan: 列 = row, 欄 = column)
    HideRow: '隱藏列', HideRows: '隱藏列', UnhideRows: '取消隱藏列',
    HideColumn: '隱藏欄', HideColumns: '隱藏欄', UnhideColumns: '取消隱藏欄',
    InsertRow: '插入列', InsertRows: '插入列', InsertColumn: '插入欄', InsertColumns: '插入欄',
    DeleteRow: '刪除列', DeleteRows: '刪除列', DeleteColumn: '刪除欄', DeleteColumns: '刪除欄',
    Above: '上方', Below: '下方', Before: '左方', After: '右方', AddColumn: '新增欄', SelectAColumn: '選擇欄',
    ByRow: '循列', ByColumn: '循欄',
    // Find & replace
    FindAndReplace: '尋找及取代', FindReplaceTooltip: '尋找及取代', FindValue: '尋找值', ReplaceValue: '取代值',
    FindWhat: '尋找目標', ReplaceWith: '取代為', FindNextBtn: '找下一個', FindPreviousBtn: '找上一個',
    ReplaceBtn: '取代', ReplaceAllBtn: '全部取代', GotoHeader: '到', SearchWithin: '搜尋範圍', SearchBy: '搜尋順序',
    Reference: '參照', MatchCase: '大小寫須相符', MatchExactCellElements: '儲存格內容須完全相符', EnterCellAddress: '輸入儲存格位址',
    // Sort & filter
    Sort: '排序', SortAscending: '遞增', SortDescending: '遞減', CustomSort: '自訂排序', ContainsHeader: '資料包含標題',
    SortBy: '排序方式', ThenBy: '次要排序', SortAndFilter: '排序與篩選',
    CustomFilter: '自訂篩選', DateTimeFilter: '日期時間篩選', DateFilter: '日期篩選', TextFilter: '文字篩選', NumberFilter: '數字篩選',
    ClearFilter: '清除篩選', ClearAllFilter: '清除', ReapplyFilter: '重新套用', NoResult: '找不到符合的項目',
    FilterTrue: 'TRUE', FilterFalse: 'FALSE', Blanks: '(空格)', OR: '或', AND: '且',
    GreaterThan: '大於', LessThan: '小於', Equal: '等於', StartsWith: '開頭是', NotStartsWith: '開頭不是',
    EndsWith: '結尾是', NotEndsWith: '結尾不是', IsEmpty: '空白', IsNotEmpty: '非空白', LookupReference: '查閱與參照', Logical: '邏輯',
    // Number formats
    General: '通用格式', Number: '數值', ShortDate: '簡短日期', LongDate: '詳細日期', Scientific: '科學記號', Text: '文字',
    Custom: '自訂', CustomFormat: '自訂數值格式', CustomFormatTypeList: '類型', PickACategory: '選擇類別',
    StandardColors: '標準色彩', MoreColors: '更多色彩',
    // Data validation / conditional formatting / hyperlinks
    Minimum: '最小值', Maximum: '最大值', IgnoreBlank: '略過空白', WholeNumber: '整數', Decimal: '小數',
    TextLength: '文字長度', List: '清單', Value: '值', ClearValidation: '清除驗證', EmptyError: '您必須輸入值',
    ClearHighlight: '清除醒目提示', HighlightInvalidData: '圈選錯誤資料',
    HighlightCellsRules: '醒目提示儲存格規則', TextThatContains: '包含下列的文字', ADateOccuring: '發生的日期',
    TopBottomRules: '前段/後段項目規則', AboveAverage: '高於平均', BelowAverage: '低於平均', DataBars: '資料橫條',
    ClearRules: '清除規則', RedFill: '紅色填滿', Unique: '唯一',
    Link: '連結', InsertLink: '插入連結', InsertLinks: '插入連結', CellReference: '儲存格參照',
    FillSeries: '以數列方式填滿', CopyCells: '複製儲存格', FillFormattingOnly: '僅以格式填滿', FillWithoutFormatting: '填滿但不填入格式',
    // Charts
    Column: '直條圖', Bar: '橫條圖', Area: '區域圖', Pie: '圓形圖', Doughnut: '環圈圖', PieAndDoughnut: '圓形圖/環圈圖',
    Line: '折線圖', Radar: '雷達圖', Scatter: '散佈圖', ChartType: '圖表類型',
    ClusteredColumn: '群組直條圖', StackedColumn: '堆疊直條圖', StackedColumn100: '100% 堆疊直條圖',
    ClusteredBar: '群組橫條圖', StackedBar: '堆疊橫條圖', StackedBar100: '100% 堆疊橫條圖',
    StackedArea: '堆疊區域圖', StackedLine: '堆疊折線圖', Legends: '圖例', Gridlines: '格線',
    PrimaryHorizontal: '主水平軸', PrimaryVertical: '主垂直軸', None: '無', InsideBase: '內側底端',
    PrimaryMajorHorizontal: '主水平主要格線', PrimaryMajorVertical: '主垂直主要格線',
    PrimaryMinorHorizontal: '主水平次要格線', PrimaryMinorVertical: '主垂直次要格線',
    Right: '右', Left: '左', Top: '上', Bottom: '下',
    // Comments / notes
    Comment: '註解', Comments: '註解', NewComment: '新增註解', AddComment: '新增註解', ShowComments: '顯示註解',
    PreviousComment: '上一個註解', NextComment: '下一個註解', DeleteComment: '刪除註解', EditComment: '編輯註解',
    DeleteThread: '刪除對話串', Post: '張貼註解', ResolveThread: '解決對話串', Reopen: '重新開啟',
    ThreadAction: '更多對話串動作', CommentAction: '更多註解動作', Active: '作用中',
    Notes: '附註', ShowHideNote: '顯示/隱藏附註', ShowAllNotes: '顯示所有附註', PreviousNote: '上一個附註', NextNote: '下一個附註',
    // Dialog buttons
    Ok: '確定', OKButton: '確定', MoreOptions: '更多選項', Apply: '套用',
  },
};

const loadedCultures = new Set<LoadableCulture>();
const pendingLoads = new Map<LoadableCulture, Promise<void>>();

function isReady(culture: SyncfusionCulture): boolean {
  return culture === 'en-US' || loadedCultures.has(culture);
}

function loadCulture(culture: LoadableCulture): Promise<void> {
  const pending = pendingLoads.get(culture);
  if (pending) return pending;
  const promise = PACK_LOADERS[culture]().then(({ default: raw }) => {
    const pack = JSON.parse(raw) as Record<string, Record<string, string>>;
    pack.spreadsheet = { ...pack.spreadsheet, ...SPREADSHEET_OVERRIDES[culture] };
    L10n.load({ [culture]: pack });
    loadedCultures.add(culture);
  });
  pendingLoads.set(culture, promise);
  promise.catch(() => pendingLoads.delete(culture)); // allow a retry on the next switch
  return promise;
}

// Returns the culture name to pass as a Syncfusion component's `locale` prop.
// While a pack is still downloading, it keeps returning the previous (already
// loaded) culture, so the component never renders against a missing pack.
export function useSyncfusionLocale(): SyncfusionCulture {
  const { lang } = useLanguage();
  const target = CULTURE_BY_LANG[lang];
  const [lastReady, setLastReady] = useState<SyncfusionCulture>(() => (isReady(target) ? target : 'en-US'));
  // Remember every culture that has actually been shown (React's "adjust state
  // while rendering" pattern), so e.g. ja → en → zh-TW falls back to en while
  // zh-TW downloads, not to the stale ja.
  if (isReady(target) && lastReady !== target) setLastReady(target);

  useEffect(() => {
    if (target === 'en-US' || loadedCultures.has(target)) return;
    let cancelled = false;
    loadCulture(target)
      .then(() => { if (!cancelled) setLastReady(target); })
      .catch((err) => console.error(`Failed to load Syncfusion locale ${target}:`, err));
    return () => { cancelled = true; };
  }, [target]);

  return isReady(target) ? target : lastReady;
}
