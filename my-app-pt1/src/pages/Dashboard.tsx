import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { LayoutDashboard, Users, Package, Filter, RefreshCw, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface SalesRecord {
  id: string;
  date: string;
  client: string;
  partNo: string;
  forecast: number;
  actual: number;
}

const rawSalesData: SalesRecord[] = [
  { id: '1', date: '2026-07-01', client: 'Foxconn', partNo: 'L40S', forecast: 100, actual: 120 },
  { id: '2', date: '2026-07-05', client: 'Foxconn', partNo: 'GB200', forecast: 80, actual: 75 },
  { id: '3', date: '2026-07-10', client: 'Wistron', partNo: 'H100', forecast: 150, actual: 150 },
  { id: '4', date: '2026-07-15', client: 'Wistron', partNo: 'B100', forecast: 120, actual: 95 },
  { id: '5', date: '2026-07-20', client: 'Quanta', partNo: 'L40S', forecast: 200, actual: 230 },
];

export default function SalesComparisonDashboard() {
  const [selectedDimension, setSelectedDimension] = useState<'client' | 'partNo'>('client');
  const [selectedModel, setSelectedModel] = useState('ALL');

  // 1. 彙總主表格與柱狀圖資料（依客戶或零件聚合）
  const aggregatedData = useMemo(() => {
    const map = new Map<string, { name: string; forecast: number; actual: number }>();

    rawSalesData.forEach(item => {
      const key = selectedDimension === 'client' ? item.client : item.partNo;
      if (!map.has(key)) {
        map.set(key, { name: key, forecast: 0, actual: 0 });
      }
      const current = map.get(key)!;
      current.forecast += item.forecast;
      current.actual += item.actual;
    });

    return Array.from(map.values()).map(item => ({
      ...item,
      diff: item.actual - item.forecast,
      achievementRate: item.forecast > 0 ? Math.round((item.actual / item.forecast) * 100) : 0
    }));
  }, [selectedDimension]);

  // 2. 計算 KPI 總計
  const kpiStats = useMemo(() => {
    const totalForecast = rawSalesData.reduce((acc, cur) => acc + cur.forecast, 0);
    const totalActual = rawSalesData.reduce((acc, cur) => acc + cur.actual, 0);
    const totalDiff = totalActual - totalForecast;
    const rate = totalForecast > 0 ? Math.round((totalActual / totalForecast) * 100) : 0;
    return { totalForecast, totalActual, totalDiff, rate };
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-4 font-sans text-xs">
      {/* 頂部標題列 */}
      <header className="bg-slate-800 border border-slate-700 px-4 py-2.5 rounded-t-lg flex justify-between items-center mb-3">
        <div className="flex items-center gap-2 font-semibold text-slate-100 text-sm">
          <LayoutDashboard size={18} className="text-orange-500" />
          <span>Dashboard &gt; 銷售預估與實際成效比較看板</span>
        </div>
        <div className="flex items-center gap-3 text-slate-400">
          <button className="hover:text-white flex items-center gap-1"><RefreshCw size={12} /> 重新整理</button>
          <span>|</span>
          <button className="hover:text-white">系統設定</button>
        </div>
      </header>

      {/* 主要內容網格區 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mb-3">
        
        {/* 左側：詳細比較明細表格 (佔 5 格) */}
        <div className="lg:col-span-5 bg-slate-800 border border-slate-700 rounded-lg flex flex-col h-[360px]">
          <div className="bg-slate-700/60 px-3 py-2 font-semibold border-b border-slate-700 flex justify-between items-center">
            <span>銷售差異明細 ({selectedDimension === 'client' ? '客戶維度' : '零件維度'})</span>
            <span className="text-[10px] text-slate-400">筆數: {aggregatedData.length}</span>
          </div>
          <div className="overflow-auto flex-1 p-2">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="p-1.5">{selectedDimension === 'client' ? '客戶名稱' : '零件型號'}</th>
                  <th className="p-1.5 text-right">預估 (Forecast)</th>
                  <th className="p-1.5 text-right">實際 (Actual)</th>
                  <th className="p-1.5 text-right">差異</th>
                  <th className="p-1.5 text-right">達成率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {aggregatedData.map(row => (
                  <tr key={row.name} className="hover:bg-slate-700/40">
                    <td className="p-1.5 font-medium text-orange-300">{row.name}</td>
                    <td className="p-1.5 text-right">{row.forecast}</td>
                    <td className="p-1.5 text-right">{row.actual}</td>
                    <td className={`p-1.5 text-right font-bold ${row.diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {row.diff > 0 ? `+${row.diff}` : row.diff}
                    </td>
                    <td className="p-1.5 text-right text-slate-300">{row.achievementRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 中間：預估 vs 實際長條圖對比 (佔 5 格) */}
        <div className="lg:col-span-5 bg-slate-800 border border-slate-700 rounded-lg p-3 flex flex-col h-[360px]">
          <div className="flex justify-between items-center mb-2">
            <span className="text-slate-300 font-semibold">預估與實際對比分析圖</span>
            <div className="flex bg-slate-900 p-0.5 rounded border border-slate-700">
              <button 
                onClick={() => setSelectedDimension('client')}
                className={`px-2 py-0.5 rounded ${selectedDimension === 'client' ? 'bg-orange-600 text-white' : 'text-slate-400'}`}
              >
                客戶
              </button>
              <button 
                onClick={() => setSelectedDimension('partNo')}
                className={`px-2 py-0.5 rounded ${selectedDimension === 'partNo' ? 'bg-orange-600 text-white' : 'text-slate-400'}`}
              >
                零件
              </button>
            </div>
          </div>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aggregatedData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '4px', color: '#fff' }} />
                <Legend />
                <Bar dataKey="forecast" name="預估" fill="#6366f1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="actual" name="實際" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 右側：過濾器與 KPI 摘要 (佔 2 格) */}
        <div className="lg:col-span-2 flex flex-col gap-3">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <div className="font-semibold text-slate-300 mb-2 flex items-center gap-1">
              <Filter size={12} /> 篩選條件
            </div>
            <div className="mb-2">
              <label className="block text-slate-400 mb-1">年度選擇</label>
              <select 
                value={selectedModel} 
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-slate-200"
              >
                <option value="ALL">2026 全年度</option>
                <option value="H1">2026 上半年</option>
              </select>
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 flex-1 flex flex-col justify-around">
            <div>
              <div className="text-[10px] text-slate-400 uppercase">總預估 / 總實際</div>
              <div className="text-sm font-bold text-white mt-0.5">{kpiStats.totalForecast} / {kpiStats.totalActual}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">整體達成率</div>
              <div className="text-lg font-bold text-orange-400 mt-0.5">{kpiStats.rate}%</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">總差異量</div>
              <div className={`text-sm font-bold mt-0.5 flex items-center gap-0.5 ${kpiStats.totalDiff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {kpiStats.totalDiff >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {kpiStats.totalDiff > 0 ? `+${kpiStats.totalDiff}` : kpiStats.totalDiff}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* 底部：時間序列趨勢堆疊圖 */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
        <div className="text-slate-300 font-semibold mb-2">銷售實際走勢與時間軸分布</div>
        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rawSalesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '4px' }} />
              <Legend />
              <Area type="monotone" dataKey="forecast" name="預估總額" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
              <Area type="monotone" dataKey="actual" name="實際總額" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}