// src/pages/faquo.tsx
import { useNavigate, useParams, Link } from 'react-router-dom';
import { SpreadsheetComponent, SheetsDirective, SheetDirective } from '@syncfusion/ej2-react-spreadsheet';
import { registerLicense } from '@syncfusion/ej2-base';

// Replace with your actual key
registerLicense('YOUR_SYNCFUSION_LICENSE_KEY');

// Syncfusion Styles
import "@syncfusion/ej2-base/styles/material.css";
import "@syncfusion/ej2-buttons/styles/material.css";
import "@syncfusion/ej2-dropdowns/styles/material.css";
import "@syncfusion/ej2-inputs/styles/material.css";
import "@syncfusion/ej2-navigations/styles/material.css";
import "@syncfusion/ej2-popups/styles/material.css";
import "@syncfusion/ej2-splitbuttons/styles/material.css";
import "@syncfusion/ej2-grids/styles/material.css";
import "@syncfusion/ej2-react-spreadsheet/styles/material.css";

export default function FaQuo() {
  const navigate = useNavigate();
  const { id } = useParams();

  return (
    <div className="h-full flex flex-col bg-white">
      {/* HEADER BAR */}
      <div className="flex justify-between items-center p-4 border-b border-slate-200 bg-slate-50 shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/fa-quotation" className="text-blue-600 hover:bg-blue-100 px-2 py-1 rounded text-sm font-bold transition-colors">
            ← Back
          </Link>
          <h1 className="text-lg font-bold text-slate-800">
            {id ? `Edit Quotation: ${id}` : 'New FA Quotation'}
          </h1>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => navigate('/fa-quotation')}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-blue-700 transition-colors">
            Save Quote
          </button>
        </div>
      </div>

      {/* COMPACT INFO BOX */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 bg-white border-b border-slate-100 shrink-0">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase text-slate-400">Customer Name</label>
          <input type="text" className="p-2 border border-slate-200 rounded text-sm outline-blue-500" placeholder="Acme Corp" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase text-slate-400">Date</label>
          <input type="date" className="p-2 border border-slate-200 rounded text-sm outline-blue-500" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase text-slate-400">Reference No.</label>
          <input type="text" className="p-2 border border-slate-200 rounded text-sm outline-blue-500" placeholder="REF-001" />
        </div>
      </div>

      {/* SPREADSHEET AREA - Fills all remaining space */}
      <div className="flex-1 relative overflow-hidden bg-slate-200">
        <div className="h-[calc(100vh-48px)] inset-0">
          <SpreadsheetComponent 
            height="100%" 
            width="100%"
            allowOpen={true} 
            allowSave={true}
            showSheetTabs={false}
            showRibbon={false} // Hidden for forms to look cleaner
            showFormulaBar={true}
          >
            <SheetsDirective>
              <SheetDirective name="Quotation" />
            </SheetsDirective>
          </SpreadsheetComponent>
        </div>
      </div>
    </div>
  );
}