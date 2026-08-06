// src/pages/likeexcelAD.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import '@syncfusion/ej2-react-buttons';
import { 
  SpreadsheetComponent, SheetsDirective, SheetDirective, 
  RowsDirective, RowDirective, CellsDirective, CellDirective,
  Inject
} from '@syncfusion/ej2-react-spreadsheet';

import '@syncfusion/ej2-base/styles/material.css';
import '@syncfusion/ej2-inputs/styles/material.css';
import '@syncfusion/ej2-buttons/styles/material.css';
import '@syncfusion/ej2-splitbuttons/styles/material.css';
import '@syncfusion/ej2-lists/styles/material.css';
import '@syncfusion/ej2-navigations/styles/material.css';
import '@syncfusion/ej2-popups/styles/material.css';
import '@syncfusion/ej2-dropdowns/styles/material.css';
import '@syncfusion/ej2-grids/styles/material.css';
import '@syncfusion/ej2-react-spreadsheet/styles/material.css';
import "@syncfusion/ej2-spreadsheet/styles/material.css";

export default function LikeExcelAD() {
  const spreadsheetRef = useRef<SpreadsheetComponent>(null);
  const navigate = useNavigate();
  
  const [adId, setAdId] = useState<string>('Loading...');
  const [adDomain, setAdDomain] = useState<string>('');
  const isSaving = useRef(false);

  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // 📝 Cell modification logging - store old values before edit
  const cellOldValueRef = useRef<{ address: string; value: any } | null>(null);

  // 📝 Reason dialog state
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [pendingCellChange, setPendingCellChange] = useState<{
    address: string;
    oldValue: any;
    newValue: any;
  } | null>(null);
  const [changeReason, setChangeReason] = useState('');

  // 📝 Function to send cell modification log to server
  const logCellChange = useCallback((cellAddress: string, oldValue: any, newValue: any, reason: string) => {
    fetch('http://localhost:3000/api/spreadsheet/log-cell-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateCode: selectedTemplateId || 'AD_TEMPLATE',
        cellAddress,
        oldValue: oldValue !== undefined ? String(oldValue) : null,
        newValue: newValue !== undefined ? String(newValue) : null,
        user: adId,
        timestamp: new Date().toISOString(),
        reason
      })
    }).catch(err => console.error('Failed to log cell change:', err));
  }, [selectedTemplateId, adId]);

  // 📝 Handle reason dialog submit
  const handleReasonSubmit = () => {
    if (pendingCellChange) {
      logCellChange(
        pendingCellChange.address,
        pendingCellChange.oldValue,
        pendingCellChange.newValue,
        changeReason
      );
    }
    setShowReasonDialog(false);
    setPendingCellChange(null);
    setChangeReason('');
  };

  // 📝 Handle reason dialog cancel
  const handleReasonCancel = () => {
    if (pendingCellChange) {
      logCellChange(
        pendingCellChange.address,
        pendingCellChange.oldValue,
        pendingCellChange.newValue,
        ''
      );
    }
    setShowReasonDialog(false);
    setPendingCellChange(null);
    setChangeReason('');
  };

  // 📝 Handle cell edit start - capture old value
  const onCellEdit = (args: any) => {
    if (args.address) {
      cellOldValueRef.current = {
        address: args.address,
        value: args.value
      };
    }
  };

  // 📝 Handle action complete - show reason dialog
  const onActionComplete = (args: any) => {
    if (args.action === 'cellSave' && args.eventArgs) {
      const data = args.eventArgs;
      const newValue = data.value !== undefined ? data.value : null;
      const oldValue = cellOldValueRef.current?.address === data.address
        ? cellOldValueRef.current.value
        : null;

      setPendingCellChange({
        address: data.address,
        oldValue,
        newValue
      });
      setShowReasonDialog(true);
      cellOldValueRef.current = null;
    }
  };

  useEffect(() => {
    // Call C# API to get AD user info
    fetch('http://localhost:5000/api/findAD', {
      credentials: 'include' // Required for Windows Authentication
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          setAdId(data.username || 'Unknown');
          setAdDomain(data.domain || '');
        } else {
          setAdId('Not Authenticated');
        }
      })
      .catch(() => {
        // Fallback to Node.js API if C# API is not available
        fetch('http://localhost:3000/api/user/profile')
          .then((res) => res.json())
          .then((data) => setAdId(data.id || 'Unknown'))
          .catch(() => setAdId('Auth Error'));
      });

    fetch('http://localhost:3000/api/xlsx2dbsetL1')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setTemplates(data);
        }
      })
      .catch((err) => console.error("Fetch Templates Error:", err));
  }, []);

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const templateId = e.target.value;
    setSelectedTemplateId(templateId);

    if (!templateId) return;

    const selectedObj = templates.find(tmpl => String(tmpl.ID || tmpl.id) === templateId);
    const fileName = selectedObj?.filename || 'AAA.xlsx';
    const filePath = `C:\\Alex\\${fileName}`;

    fetch('http://localhost:3000/api/spreadsheet/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.jsonObject && spreadsheetRef.current) {
          const spreadsheet = spreadsheetRef.current as any;
          spreadsheet.open({ jsonObject: data.jsonObject });
          setTimeout(() => { 
            if (typeof spreadsheet.computeFormula === 'function') {
              spreadsheet.computeFormula(); 
            }
            spreadsheet.hideSpinner(); 
          }, 100);
        }
      })
      .catch((err) => console.error("Open Template File Error:", err));
  };

  const onSaveToDb = () => {
    const spreadsheet = spreadsheetRef.current as any;
    if (!spreadsheet || isSaving.current) return;
    isSaving.current = true;

    spreadsheet.saveAsJson().then((response: any) => {
      // 將這裡的路徑改為與後端一致的 /api/spreadsheet/save-excel-to-db
      fetch('http://localhost:3000/api/spreadsheet/save-excel-to-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetData: response }) 
      })
      .then(res => {
        isSaving.current = false;
        if (res.ok) {
          alert("Successfully saved to DB!");
        } else {
          alert("Failed to save to DB. Please check server response.");
        }
      })
      .catch(err => { 
        console.error("Save to DB Error:", err); 
        isSaving.current = false; 
      });
    });
  };

  const onSaveToDbXX = () => {
    const spreadsheet = spreadsheetRef.current as any;
    if (!spreadsheet || isSaving.current) return;
    isSaving.current = true;

    spreadsheet.saveAsJson().then((response: any) => {
      fetch('http://localhost:3000/api/spreadsheet/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetData: response }) 
      })
      .then(res => {
        isSaving.current = false;
        if (res.ok) {
          alert("Successfully saved to DB!");
        } else {
          alert("Failed to save to DB (404/Error). Please check backend /api/spreadsheet/save route.");
        }
      })
      .catch(err => { 
        console.error("Save to DB Error:", err); 
        isSaving.current = false; 
      });
    });
  };

  const onSaveWithStyle = () => {
    const spreadsheet = spreadsheetRef.current as any;
    if (!spreadsheet || isSaving.current) return;
    isSaving.current = true;
    spreadsheet.saveAsJson().then((response: any) => {
      fetch('http://localhost:3000/api/spreadsheet/saveX', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetData: response })
      })
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Styled_Workbook.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        isSaving.current = false;
      })
      .catch(err => { console.error(err); isSaving.current = false; });
    });
  };

  const onBeforeOpen = (args: any) => {
    args.cancel = true;
    const file = args.file;
    const formData = new FormData();
    formData.append('file', file);
    fetch('http://localhost:3000/api/spreadsheet/open', { method: 'POST', body: formData })
      .then((res) => res.json())
      .then((data) => {
        if (data.jsonObject && spreadsheetRef.current) {
          const spreadsheet = spreadsheetRef.current as any;
          spreadsheet.open({ jsonObject: data.jsonObject });
          setTimeout(() => { 
            if (typeof spreadsheet.computeFormula === 'function') {
              spreadsheet.computeFormula(); 
            }
            spreadsheet.hideSpinner(); 
          }, 100);
        }
      })
      .catch((err) => console.error("Open Error:", err));
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-white">
      <div className="h-12 border-b border-slate-200 flex items-center justify-between px-4 shrink-0 bg-slate-900 text-white">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/tools')} className="text-slate-400 hover:text-white text-sm font-bold flex items-center gap-1">← Back</button>
          <div className="h-4 w-[1px] bg-slate-700"></div>
          <h1 className="text-sm font-medium tracking-wide">AD Integrated Workbook</h1>
          
          <div className="flex items-center gap-2 ml-4">
            <span className="text-xs text-slate-400">Template:</span>
            <select 
              value={selectedTemplateId}
              onChange={handleTemplateChange}
              className="bg-slate-800 text-white text-xs px-2 py-1 rounded border border-slate-700 outline-none focus:border-blue-500 font-sans"
            >
              <option value="">-- Select Template --</option>
              {templates.map((tmpl) => (
                <option key={tmpl.ID || tmpl.id} value={tmpl.ID || tmpl.id}>
                  {tmpl.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="flex gap-3 items-center">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded border border-slate-700">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <div className="flex flex-col">
                  <span className="text-xs font-mono font-bold text-blue-400 leading-tight">
                    {adDomain ? `${adDomain}\\${adId}` : adId}
                  </span>
                  {adDomain && (
                    <span className="text-[9px] text-slate-500 leading-tight">Active Directory</span>
                  )}
                </div>
            </div>
            <button onClick={onSaveWithStyle} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-1.5 rounded">Export</button>
            <button onClick={onSaveToDb} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded">Save to DB</button>
        </div>
      </div>

      <div className="flex-1 relative bg-white">
        <div className="h-[calc(100vh-48px)] inset-0">
          <SpreadsheetComponent
            ref={spreadsheetRef}
            created={() => { (window as any).mySpreadsheet = spreadsheetRef.current; }}
            height="100%"
            width="100%"
            openUrl="http://localhost:3000/api/spreadsheet/open"
            saveUrl="http://localhost:3000/api/spreadsheet/save"
            allowOpen={true}
            beforeOpen={onBeforeOpen}
            allowSave={true}
            showSheetTabs={true}
            showRibbon={true}
            showFormulaBar={true}
            cellEdit={onCellEdit}
            actionComplete={onActionComplete}
          />

          {/* 📝 Cell Change Reason Dialog */}
          {showReasonDialog && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 w-96 max-w-[90vw]">
                <h3 className="text-lg font-bold text-slate-800 mb-2">Cell Modification</h3>
                <div className="text-sm text-slate-600 mb-4">
                  <p><span className="font-medium">Cell:</span> {pendingCellChange?.address}</p>
                  <p><span className="font-medium">Old Value:</span> {pendingCellChange?.oldValue ?? '(empty)'}</p>
                  <p><span className="font-medium">New Value:</span> {pendingCellChange?.newValue ?? '(empty)'}</p>
                </div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Reason for change:
                </label>
                <textarea
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="Enter the reason for this change..."
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows={3}
                  autoFocus
                />
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    onClick={handleReasonCancel}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
                  >
                    Skip
                  </button>
                  <button
                    onClick={handleReasonSubmit}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                  >
                    Submit
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}