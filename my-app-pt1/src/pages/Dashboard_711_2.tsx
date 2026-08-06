import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { BarChart3, TrendingUp, CheckCircle, AlertTriangle, Package } from 'lucide-react';

// 資料結構定義
interface SalesRow {
  id: string;
  client: string;
  category: string;
  modelName: string;
  forecast: number;
  actual: number;
}

const rawData: SalesRow[] = [
  { id: '1', client: 'Foxconn', category: 'GPU', modelName: 'L40S', forecast: 10, actual: 12 },
  { id: '2', client: 'Foxconn', category: 'CPU+GPU', modelName: 'GB200', forecast: 8, actual: 7 },
  { id: '3', client: 'Wistron', category: 'BaseBoard', modelName: 'H100', forecast: 15, actual: 15 },
  { id: '4', client: 'Wistron', category: 'BaseBoard', modelName: 'B100', forecast: 12, actual: 9 },
];

export default function SalesDashboard() {
  const processedData = useMemo(() => {
    return rawData.map(item => ({
      ...item,
      diff: item.actual - item.forecast
    }));
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6 font-sans">
      <header className="mb-8 border-b border-gray-800 pb-4">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <BarChart3 className="text-orange-500" /> 銷售預估監控看板
        </h1>
      </header>

      {/* 圖表區塊 */}
      <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-8 h-80">
        <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">銷售趨勢分析</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={processedData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="modelName" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none' }} />
            <Legend />
            <Bar dataKey="forecast" name="預估" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="actual" name="實際" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 表格區塊 */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-700/50 text-gray-300 text-xs uppercase">
            <tr>
              <th className="px-6 py-4">Model</th>
              <th className="px-6 py-4 text-center">預估</th>
              <th className="px-6 py-4 text-center">實際</th>
              <th className="px-6 py-4 text-center">差異</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {processedData.map((row) => (
              <tr key={row.id} className="hover:bg-gray-700/30">
                <td className="px-6 py-4 font-semibold text-orange-200">{row.modelName}</td>
                <td className="px-6 py-4 text-center">{row.forecast}</td>
                <td className="px-6 py-4 text-center">{row.actual}</td>
                <td className={`px-6 py-4 text-center font-bold ${row.diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {row.diff > 0 ? `+${row.diff}` : row.diff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}