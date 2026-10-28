// 📏 Excel 式「文字溢出到相鄰空白儲存格」效果
//
// Syncfusion Spreadsheet 一律把文字裁在儲存格邊界（.e-cell 是 overflow: hidden），沒有內建選項。
// 這裡在每次畫面重繪後，掃描目前渲染出來的儲存格：未換行、非數字、非合併的文字若比欄寬還長，
// 且旁邊的儲存格是空的，就讓它延伸過去（靠左往右、靠右往左、置中往兩邊），遇到有內容的儲存格就截斷——
// 與 Excel 相同。只動 DOM 樣式，不碰活頁簿模型，所以存檔/匯出不受影響（Excel 本身就會這樣顯示）。

type Saved = Partial<Record<'overflow' | 'zIndex' | 'clipPath' | 'textIndent' | 'borderRightColor', string>>;

interface Tracked {
  original: Saved; // 套用前的 inline 值
  applied: Saved;  // 我們寫入的值（還原時只還原仍是我們寫的那些，避免蓋掉 Syncfusion 之後重設的格式）
}

interface CellLike { value?: unknown; formula?: string; wrap?: boolean; colSpan?: number; rowSpan?: number }
interface SheetLike { rows?: ({ cells?: (CellLike | null | undefined)[] } | null | undefined)[] }
interface SpreadsheetLike { element?: HTMLElement; getActiveSheet?: () => SheetLike }

const tracked = new Map<HTMLElement, Tracked>();

function setStyle(td: HTMLElement, prop: keyof Saved, value: string) {
  let t = tracked.get(td);
  if (!t) {
    t = { original: {}, applied: {} };
    tracked.set(td, t);
  }
  if (!(prop in t.original)) t.original[prop] = td.style[prop];
  td.style[prop] = value;
  t.applied[prop] = td.style[prop];
}

function restoreAll() {
  tracked.forEach((t, td) => {
    (Object.keys(t.applied) as (keyof Saved)[]).forEach((prop) => {
      if (td.style[prop] === t.applied[prop]) td.style[prop] = t.original[prop] ?? '';
    });
  });
  tracked.clear();
}

function colIdx(td: Element) {
  return parseInt(td.getAttribute('aria-colindex') || '0', 10) - 1;
}

function modelCell(sheet: SheetLike | undefined, r: number, c: number) {
  return sheet?.rows?.[r]?.cells?.[c];
}

function isMerged(cell: CellLike | null | undefined) {
  return !!cell && ((cell.colSpan != null && cell.colSpan !== 1) || (cell.rowSpan != null && cell.rowSpan !== 1));
}

function isEmptyNeighbor(td: HTMLElement, sheet: SheetLike | undefined, r: number) {
  const cell = modelCell(sheet, r, colIdx(td));
  if (isMerged(cell)) return false;
  if (cell && ((cell.value != null && cell.value !== '') || cell.formula)) return false;
  return td.textContent === '' && td.childElementCount === 0;
}

function processCell(td: HTMLElement, sheet: SheetLike | undefined, r: number) {
  if (td.childElementCount > 0 || td.classList.contains('e-wraptext')) return;
  const text = td.textContent;
  if (!text) return;
  const cell = modelCell(sheet, r, colIdx(td));
  if (!cell || cell.wrap || isMerged(cell)) return;
  // 數字/日期在 Excel 是顯示 ####，不會溢出
  const v = cell.value;
  if (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)))) return;

  const range = document.createRange();
  range.selectNodeContents(td);
  const textRect = range.getBoundingClientRect();
  const tdRect = td.getBoundingClientRect();
  if (textRect.width <= tdRect.width) return;

  const cs = getComputedStyle(td);
  const align = cs.textAlign;
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;

  // 期望的文字左緣（溢出時瀏覽器一律靠左排，置中/靠右要自己位移）
  let desiredLeft = textRect.left;
  if (align === 'center') desiredLeft = tdRect.left + (tdRect.width - textRect.width) / 2;
  else if (align === 'right' || align === 'end') desiredLeft = tdRect.right - padR - textRect.width;
  const needLeft = Math.max(0, tdRect.left + padL - desiredLeft);
  const needRight = Math.max(0, desiredLeft + textRect.width - (tdRect.right - padR));

  // 往右找空白儲存格
  let right = 0;
  const rightCells: HTMLElement[] = [];
  for (let n = td.nextElementSibling as HTMLElement | null; n && right < needRight; n = n.nextElementSibling as HTMLElement | null) {
    if (!n.classList.contains('e-cell') || !isEmptyNeighbor(n, sheet, r)) break;
    right += n.getBoundingClientRect().width;
    rightCells.push(n);
  }
  right = Math.min(right, needRight);

  // 往左找空白儲存格
  let left = 0;
  const leftCells: HTMLElement[] = [];
  for (let n = td.previousElementSibling as HTMLElement | null; n && left < needLeft; n = n.previousElementSibling as HTMLElement | null) {
    if (!n.classList.contains('e-cell') || !isEmptyNeighbor(n, sheet, r)) break;
    left += n.getBoundingClientRect().width;
    leftCells.push(n);
  }
  left = Math.min(left, needLeft);

  if (left === 0 && right === 0) return;

  setStyle(td, 'overflow', 'visible');
  setStyle(td, 'zIndex', '1'); // .e-cell 是 position: relative，要高於右邊儲存格的白底才看得到文字
  setStyle(td, 'clipPath', `inset(0px ${-right}px 0px ${-left}px)`);
  const shift = desiredLeft - textRect.left;
  if (Math.abs(shift) > 0.5) {
    setStyle(td, 'textIndent', `${(parseFloat(cs.textIndent) || 0) + shift}px`);
  }

  // 文字經過的格線隱藏掉（同 Excel）；自訂框線則保留
  const hideGrid = (el: HTMLElement) => {
    if (!el.style.borderRight && !el.style.borderRightColor) setStyle(el, 'borderRightColor', 'transparent');
  };
  if (right > 0) {
    hideGrid(td);
    let acc = 0;
    for (const n of rightCells) {
      acc += n.getBoundingClientRect().width;
      if (acc < right) hideGrid(n);
    }
  }
  if (left > 0) leftCells.forEach(hideGrid);
}

function refresh(spreadsheet: SpreadsheetLike) {
  restoreAll();
  const root = spreadsheet.element;
  if (!root) return;
  const sheet = spreadsheet.getActiveSheet?.();
  root.querySelectorAll<HTMLTableRowElement>('.e-sheet .e-table tr.e-row').forEach((tr) => {
    if (tr.classList.contains('e-row-hidetext')) return;
    const r = parseInt(tr.getAttribute('aria-rowindex') || '0', 10) - 1;
    if (r < 0) return;
    tr.querySelectorAll<HTMLElement>(':scope > td.e-cell').forEach((td) => processCell(td, sheet, r));
  });
}

/** 掛上溢出效果；回傳解除函式。畫面有任何重繪（捲動、編輯、調欄寬、換工作表、協作同步）都會重算。 */
export function attachTextOverflow(spreadsheet: SpreadsheetLike | null | undefined): () => void {
  const root = spreadsheet?.element;
  if (!spreadsheet || !root) return () => {};
  let frame = 0;
  const options: MutationObserverInit = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class'] };
  const observer = new MutationObserver(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      observer.disconnect(); // 自己改的樣式不要再觸發一次
      try {
        refresh(spreadsheet);
      } finally {
        observer.takeRecords();
        observer.observe(root, options);
      }
    });
  });
  observer.observe(root, options);
  refresh(spreadsheet);
  return () => {
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
    restoreAll();
  };
}
