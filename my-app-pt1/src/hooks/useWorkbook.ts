import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { SpreadsheetComponent } from '@syncfusion/ej2-react-spreadsheet';

const API_BASE = 'http://localhost:3000/api/spreadsheet';

export interface WorkbookSheetInfo {
  index: number;
  name: string;
  sheetId: number;
  hidden: boolean;
  rowCount: number;
  columnCount: number;
}

interface UseWorkbookOptions {
  spreadsheetRef: RefObject<SpreadsheetComponent | null>;
  chunkSize?: number;
  onFileNameChange?: (fileName: string) => void;
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || `Workbook request failed (${response.status})`);
  }
  return payload;
}

export function useWorkbook({ spreadsheetRef, chunkSize = 200, onFileNameChange }: UseWorkbookOptions) {
  const [fileId, setFileId] = useState('');
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<WorkbookSheetInfo[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [isWorkbookLoading, setIsWorkbookLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalRows, setTotalRows] = useState(0);
  const [error, setError] = useState('');

  const fileIdRef = useRef('');
  const selectedSheetRef = useRef('');
  const nextStartRowRef = useRef<number | null>(null);
  const loadingRef = useRef(false);
  const scrollElementRef = useRef<HTMLElement | null>(null);
  const scrollHandlerRef = useRef<EventListener | null>(null);

  const setLoading = (value: boolean) => {
    loadingRef.current = value;
    setIsWorkbookLoading(value);
  };

  const isProgrammaticLoad = useCallback(() => loadingRef.current, []);

  const fetchChunk = useCallback(async (targetFileId: string, sheetName: string, startRow: number) => {
    const response = await fetch(`${API_BASE}/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileId: targetFileId,
        sheetName,
        startRow,
        rowCount: chunkSize,
        formulaMode: 'cached',
      }),
    });
    return readJson(response);
  }, [chunkSize]);

  const appendChunk = useCallback(async () => {
    const nextStartRow = nextStartRowRef.current;
    const spreadsheet = spreadsheetRef.current as any;
    if (!spreadsheet || loadingRef.current || !fileIdRef.current || !selectedSheetRef.current || nextStartRow == null) return;

    setLoading(true);
    setError('');
    try {
      const data = await fetchChunk(fileIdRef.current, selectedSheetRef.current, nextStartRow);
      const workbookJson = JSON.parse(data.jsonObject);
      const rows = workbookJson?.Workbook?.sheets?.[0]?.rows || [];
      if (rows.length > 0) {
        const insertIndex = nextStartRow - 1;
        const activeSheet = spreadsheet.getActiveSheet?.();
        if (activeSheet?.usedRange && activeSheet.usedRange.rowIndex < insertIndex - 1) {
          activeSheet.usedRange.rowIndex = insertIndex - 1;
        }
        rows[0] = { ...rows[0], index: insertIndex };
        spreadsheet.insertRow(rows, undefined, 0);
      }
      nextStartRowRef.current = data.nextStartRow;
      setHasMore(Boolean(data.hasMore));
      setTotalRows(Number(data.totalRows) || 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [fetchChunk, spreadsheetRef]);

  const bindScroll = useCallback(() => {
    if (scrollElementRef.current && scrollHandlerRef.current) {
      scrollElementRef.current.removeEventListener('scroll', scrollHandlerRef.current, true);
    }
    const spreadsheet = spreadsheetRef.current as any;
    const root = spreadsheet?.element as HTMLElement | null;
    if (!root) return;
    const handler: EventListener = (event) => {
      const scroller = event.target as HTMLElement | null;
      if (!scroller?.classList?.contains('e-main-panel') || scroller.scrollHeight <= scroller.clientHeight + 1) return;
      const distanceToBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      if (distanceToBottom <= 300 && nextStartRowRef.current != null) void appendChunk();
    };
    root.addEventListener('scroll', handler, { passive: true, capture: true });
    scrollElementRef.current = root;
    scrollHandlerRef.current = handler;
  }, [appendChunk, spreadsheetRef]);

  const openSheet = useCallback(async (sheetName: string, targetFileId = fileIdRef.current) => {
    const spreadsheet = spreadsheetRef.current as any;
    if (!spreadsheet || !targetFileId || !sheetName) return;

    setLoading(true);
    setError('');
    selectedSheetRef.current = sheetName;
    setSelectedSheet(sheetName);
    nextStartRowRef.current = null;
    try {
      const data = await fetchChunk(targetFileId, sheetName, 1);
      await Promise.resolve(spreadsheet.open({ jsonObject: data.jsonObject }));
      nextStartRowRef.current = data.nextStartRow;
      setHasMore(Boolean(data.hasMore));
      setTotalRows(Number(data.totalRows) || 0);
      await new Promise(resolve => window.setTimeout(resolve, 150));
      spreadsheet.hideSpinner?.();
      bindScroll();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      spreadsheet.hideSpinner?.();
    } finally {
      setLoading(false);
    }
  }, [bindScroll, fetchChunk, spreadsheetRef]);

  const loadWorkbookInfo = useCallback(async (targetFileId: string, preferredSheet?: string) => {
    const response = await fetch(`${API_BASE}/workbook-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: targetFileId }),
    });
    const data = await readJson(response);
    const workbookSheets = (data.sheets || []) as WorkbookSheetInfo[];
    setSheets(workbookSheets);
    const selected = workbookSheets.find(sheet => sheet.name === preferredSheet)
      || workbookSheets.find(sheet => !sheet.hidden)
      || workbookSheets[0];
    if (!selected) throw new Error('Workbook contains no worksheets');
    await openSheet(selected.name, targetFileId);
  }, [openSheet]);

  const openByFileId = useCallback(async (targetFileId: string, preferredSheet?: string, displayName?: string) => {
    fileIdRef.current = targetFileId;
    setFileId(targetFileId);
    if (displayName) {
      setFileName(displayName);
      onFileNameChange?.(displayName);
    }
    setLoading(true);
    setError('');
    try {
      await loadWorkbookInfo(targetFileId, preferredSheet);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [loadWorkbookInfo, onFileNameChange]);

  const openFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    setLoading(true);
    setError('');
    try {
      const upload = await readJson(await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData }));
      fileIdRef.current = upload.fileId;
      setFileId(upload.fileId);
      setFileName(upload.originalName || file.name);
      onFileNameChange?.(upload.originalName || file.name);
      await loadWorkbookInfo(upload.fileId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [loadWorkbookInfo, onFileNameChange]);

  const beforeOpen = useCallback((args: any) => {
    args.cancel = true;
    if (args.file) void openFile(args.file);
  }, [openFile]);

  useEffect(() => () => {
    if (scrollElementRef.current && scrollHandlerRef.current) {
      scrollElementRef.current.removeEventListener('scroll', scrollHandlerRef.current, true);
    }
  }, []);

  return {
    fileId,
    fileName,
    sheets,
    selectedSheet,
    isWorkbookLoading,
    isProgrammaticLoad,
    hasMore,
    totalRows,
    error,
    beforeOpen,
    openFile,
    openByFileId,
    selectSheet: openSheet,
    loadMore: appendChunk,
  };
}
