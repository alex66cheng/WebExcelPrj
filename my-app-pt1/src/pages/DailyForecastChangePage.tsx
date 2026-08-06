// src/pages/DailyForecastChangePage.tsx
import { useState } from 'react';

interface ForecastChangeRecord {
  id: string;
  customer: string;
  sku: string;
  changeQty: number;
  changePercent: number;
  reason: string;
  action: string;
}

const mockForecastChanges: ForecastChangeRecord[] = [
  {
    id: 'fc_01',
    customer: 'NVIDIA',
    sku: 'GPU-RTX-5090-FE',
    changeQty: 1200,
    changePercent: 18,
    reason: 'Customer pulled in Q3 demand ahead of product launch',
    action: 'Confirm supply commitment with production planning'
  },
  {
    id: 'fc_02',
    customer: 'AMD',
    sku: 'CPU-RYZEN9-9950X',
    changeQty: -450,
    changePercent: -12,
    reason: 'End customer inventory correction reported by distributor',
    action: 'Notify sales owner and hold excess allocation'
  },
  {
    id: 'fc_03',
    customer: 'Intel',
    sku: 'MB-Z890-CHIPSET',
    changeQty: 300,
    changePercent: 6,
    reason: 'New design-win ramp confirmed for next fiscal quarter',
    action: 'No action required, monitor next cycle'
  },
  {
    id: 'fc_04',
    customer: 'Dell',
    sku: 'SSD-NVME-2TB-ENT',
    changeQty: -800,
    changePercent: -25,
    reason: 'Program delay pushed out by OEM engineering team',
    action: 'Escalate to account manager for revised timeline'
  }
];

export default function DailyForecastChangePage() {
  const [changes] = useState<ForecastChangeRecord[]>(mockForecastChanges);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredChanges = changes.filter(item =>
    item.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const increases = changes.filter(c => c.changeQty > 0).length;
  const decreases = changes.filter(c => c.changeQty < 0).length;

  return (
    <div className="flex flex-col h-full text-slate-800">

      <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-5 mb-6 border-b border-gray-100 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Daily Forecast Change Report</h1>
          <p className="text-sm text-gray-500 mt-1">Track day-over-day forecast movements by customer and SKU, with root cause and recommended action.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl">
          <span className="text-xs font-bold text-slate-400 uppercase">Total Changes</span>
          <div className="text-2xl font-bold text-slate-800 mt-1">{changes.length}</div>
        </div>
        <div className="bg-green-50/50 border border-green-100 p-4 rounded-xl">
          <span className="text-xs font-bold text-green-600 uppercase">Increases</span>
          <div className="text-2xl font-bold text-green-700 mt-1">{increases}</div>
        </div>
        <div className="bg-red-50/50 border border-red-100 p-4 rounded-xl">
          <span className="text-xs font-bold text-red-600 uppercase">Decreases</span>
          <div className="text-2xl font-bold text-red-700 mt-1">{decreases}</div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4 bg-gray-50 p-3 rounded-xl border border-gray-200">
        <div className="flex-1 relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Search by customer or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-2 pl-9 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-200 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <th className="p-4 w-40">Customer</th>
                <th className="p-4 w-48">SKU</th>
                <th className="p-4 w-40 text-right">Change</th>
                <th className="p-4">Reason</th>
                <th className="p-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {filteredChanges.length > 0 ? (
                filteredChanges.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 font-medium text-slate-900">{item.customer}</td>
                    <td className="p-4 font-mono text-xs text-slate-600">{item.sku}</td>
                    <td className="p-4 text-right font-mono font-semibold">
                      <span className={item.changeQty >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {item.changeQty >= 0 ? '+' : ''}{item.changeQty.toLocaleString()}
                        <span className="ml-1 text-xs font-normal text-slate-400">
                          ({item.changePercent >= 0 ? '+' : ''}{item.changePercent}%)
                        </span>
                      </span>
                    </td>
                    <td className="p-4 text-slate-600">{item.reason}</td>
                    <td className="p-4 text-slate-600">{item.action}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="text-center p-10 text-gray-400 italic bg-gray-50/30">
                    No forecast changes found for the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
