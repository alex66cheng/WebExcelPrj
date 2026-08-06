// src/pages/faquo.tsx
import { useNavigate, useParams, Link } from 'react-router-dom';

export default function FaQuo() {
  const navigate = useNavigate();
  const { id } = useParams(); // This gets the ID if we are "Editing"

  const isEdit = Boolean(id);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4">
        <Link 
          to="/fa-quotation" 
          className="text-sm text-slate-500 hover:text-blue-600 flex items-center gap-1 transition-colors"
        >
          <span>←</span> Back to Quotation List
        </Link>
      </div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">
          {isEdit ? `Edit Quotation: ${id}` : 'Create New FA Quotation'}
        </h1>
        <p className="text-slate-500">Please fill in the details below.</p>
      </div>

      {/* Form Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
        <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Customer Name */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700">Customer Name</label>
              <input 
                type="text" 
                placeholder="Enter customer name"
                className="p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Quote Amount */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700">Amount ($)</label>
              <input 
                type="number" 
                placeholder="0.00"
                className="p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-700">Notes/Description</label>
            <textarea 
              rows={4}
              className="p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Internal notes..."
            ></textarea>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button 
              type="button"
              onClick={() => navigate('/fa-quotation')}
              className="px-6 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 font-medium"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              {isEdit ? 'Update Quotation' : 'Save Quotation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}