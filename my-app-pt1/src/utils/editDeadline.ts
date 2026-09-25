// ⏰ 檔案池編輯期限的共用時間工具（EditDeadlineControl、ExcelList、likeexcel 共用）

// ISO 時間 → <input type="datetime-local"> 需要的本地時間字串 (YYYY-MM-DDTHH:mm)
export function toLocalInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDeadline(iso: string): string {
  return toLocalInputValue(iso).replace('T', ' ');
}

export function isDeadlinePassed(iso: string | null | undefined): boolean {
  return !!iso && Date.now() >= new Date(iso).getTime();
}
