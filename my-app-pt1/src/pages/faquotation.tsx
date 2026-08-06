// src/pages/faquotation.tsx
import { Link } from 'react-router-dom';

export default function FAQuotation() {
  // Sample data array
  const quotations = [
    { id: 'Q-2025-001', customer: 'Global Tech Industries', amount: '$12,500', status: 'Draft' },
    { id: 'Q-2025-002', customer: 'Nexus Solutions', amount: '$8,200', status: 'Pending' },
  ];

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="flex justify-between items-center border-b pb-5">
        <h1 className="text-2xl font-bold text-slate-800">FA Quotation Form</h1>
        <Link 
  to="/fa-quotation/new" 
  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
>
  <span className="text-lg">+</span> New Quotation
</Link>
      </div>

      {/* LIST SECTION (TABLE) */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="p-4 font-semibold text-slate-700">Quote ID</th>
              <th className="p-4 font-semibold text-slate-700">Customer</th>
              <th className="p-4 font-semibold text-slate-700">Amount</th>
              <th className="p-4 font-semibold text-slate-700">Status</th>
              <th className="p-4 font-semibold text-slate-700 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quotations.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4 font-medium text-blue-600">{item.id}</td>
                <td className="p-4 text-slate-600">{item.customer}</td>
                <td className="p-4 text-slate-600">{item.amount}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    item.status === 'Draft' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {item.status}
                  </span>
                </td>
                <td className="p-4 text-right">
                  {/* EDITOR LINK */}
                  <Link 
                    to={`/fa-quotation/edit/${item.id}`} 
                    className="text-blue-600 hover:text-blue-800 font-medium underline underline-offset-4"
                  >
                    Editor
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}