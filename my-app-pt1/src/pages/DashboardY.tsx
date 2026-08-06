import React, { useState, useEffect } from 'react';

// --- 型別定義 ---
interface DashboardData {
  month: string;
  totalTarget: number;
  totalForecast: number;
  totalActual: number;
  targetVsActualPct: number;
  forecastVsActualPct: number;
  forecastAccuracyPct: number;
  forecastBias: number;
  topCustomerVariance: { customerName: string; variance: number; absVariance: number }[];
  productLineVariance: { productLine: string; forecast: number; actual: number; variance: number }[];
  countryPerformance: { country: string; target: number; forecast: number; actual: number; achievementPct: number }[];
  pipelineCoverageRatio: number;
  totalBacklog: number;
  inventoryRiskSummary: {
    excessInventoryValue: number;
    shortageRiskValue: number;
    itemsAtRisk: number;
  };
}

export const SalesForecastDashboard: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-06');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // 模擬從後端 API 取得資料
  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      // 這裡以模擬資料對應後端結構
      const mockData: DashboardData = {
        month: selectedMonth,
        totalTarget: 12500000,
        totalForecast: 11800000,
        totalActual: 11200000,
        targetVsActualPct: 89.6,
        forecastVsActualPct: 94.9,
        forecastAccuracyPct: 91.5,
        forecastBias: 600000, // 正數代表持續高估 (Over-forecasting)
        topCustomerVariance: [
          { customerName: 'TSMC', variance: -50000, absVariance: 50000 },
          { customerName: 'Apple', variance: 120000, absVariance: 120000 },
          { customerName: 'NVIDIA', variance: -80000, absVariance: 80000 },
          { customerName: 'Qualcomm', variance: 40000, absVariance: 40000 },
          { customerName: 'AMD', variance: -30000, absVariance: 30000 },
          { customerName: 'MediaTek', variance: 25000, absVariance: 25000 },
          { customerName: 'Intel', variance: -20000, absVariance: 20000 },
          { customerName: 'Samsung', variance: 15000, absVariance: 15000 },
          { customerName: 'Cisco', variance: -10000, absVariance: 10000 },
          { customerName: 'Dell', variance: 5000, absVariance: 5000 },
        ],
        productLineVariance: [
          { productLine: 'HPC Series', forecast: 5000000, actual: 4800000, variance: -200000 },
          { productLine: 'Mobile AP', forecast: 4000000, actual: 3900000, variance: -100000 },
          { productLine: 'Automotive', forecast: 2800000, actual: 2500000, variance: -300000 },
        ],
        countryPerformance: [
          { country: 'Taiwan', target: 5000000, forecast: 4800000, actual: 4700000, achievementPct: 94.0 },
          { country: 'USA', target: 4500000, forecast: 4200000, actual: 3900000, achievementPct: 86.6 },
          { country: 'Japan', target: 3000000, forecast: 2800000, actual: 2600000, achievementPct: 86.6 },
        ],
        pipelineCoverageRatio: 3.45, // 3.45x 覆蓋率
        totalBacklog: 8400000,
        inventoryRiskSummary: {
          excessInventoryValue: 1250000,
          shortageRiskValue: 450000,
          itemsAtRisk: 14,
        },
      };
      setData(mockData);
      setLoading(false);
    }, 400);
  }, [selectedMonth]);

  if (loading || !data) {
    return <div className="p-8 text-center text-gray-500">載入 Sales Forecast Dashboard 中...</div>;
  }

  const formatCurrency = (val: number) => `$${val.toLocaleString()}`;

  return (
    <div className="p-6 bg-gray-50 min-h-screen space-y-6">
      {/* 頂部標題與篩選器 */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Sales Forecast Review Dashboard</h1>
          <p className="text-sm text-gray-500">總部 / 原廠協同管理與預測品質審查工具</p>
        </div>
        <div className="flex items-center space-x-3">
          <label className="text-sm font-medium text-gray-600">檢視月份：</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* 核心指標卡片區 (KPI Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Sales Target vs Actual */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Target vs Actual</p>
          <div className="flex items-baseline justify-between mt-2">
            <h3 className="text-xl font-bold text-gray-900">{formatCurrency(data.totalActual)}</h3>
            <span className={`text-sm font-semibold ${data.targetVsActualPct >= 100 ? 'text-green-600' : 'text-amber-600'}`}>
              {data.targetVsActualPct}%
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">目標: {formatCurrency(data.totalTarget)}</p>
        </div>

        {/* Forecast Accuracy */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Forecast Accuracy %</p>
          <div className="flex items-baseline justify-between mt-2">
            <h3 className="text-xl font-bold text-blue-600">{data.forecastAccuracyPct}%</h3>
            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">品質評估</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">預測 vs 實際達成: {data.forecastVsActualPct}%</p>
        </div>

        {/* Forecast Bias */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Forecast Bias (持續偏差)</p>
          <div className="flex items-baseline justify-between mt-2">
            <h3 className={`text-xl font-bold ${data.forecastBias > 0 ? 'text-purple-600' : 'text-indigo-600'}`}>
              {formatCurrency(data.forecastBias)}
            </h3>
            <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">
              {data.forecastBias > 0 ? '高估 (Over)' : '低估 (Under)'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">預測總額: {formatCurrency(data.totalForecast)}</p>
        </div>

        {/* Pipeline Coverage */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pipeline Coverage</p>
          <div className="flex items-baseline justify-between mt-2">
            <h3 className="text-xl font-bold text-gray-900">{data.pipelineCoverageRatio}x</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${data.pipelineCoverageRatio >= 3 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {data.pipelineCoverageRatio >= 3 ? '健康 (>=3x)' : '偏低 (<3x)'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Backlog: {formatCurrency(data.totalBacklog)}</p>
        </div>
      </div>

      {/* 次要數據細節與風險區 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 左側 2 欄：Product Line 與 Country Performance */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Product Line Variance */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Product Line Variance (產品線差異)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 font-medium">
                    <th className="pb-3">產品線</th>
                    <th className="pb-3 text-right">預測 (Forecast)</th>
                    <th className="pb-3 text-right">實際 (Actual)</th>
                    <th className="pb-3 text-right">差異 (Variance)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.productLineVariance.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="py-3 font-medium text-gray-700">{item.productLine}</td>
                      <td className="py-3 text-right text-gray-600">{formatCurrency(item.forecast)}</td>
                      <td className="py-3 text-right text-gray-600">{formatCurrency(item.actual)}</td>
                      <td className={`py-3 text-right font-semibold ${item.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(item.variance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top 10 Customer Variance */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Top 10 Customer Variance (前十大客戶預測差異)</h3>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 font-medium sticky top-0 bg-white">
                    <th className="pb-3">客戶名稱</th>
                    <th className="pb-3 text-right">絕對偏差量</th>
                    <th className="pb-3 text-right">實際偏差 (Actual - Forecast)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.topCustomerVariance.map((cust, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="py-3 font-medium text-gray-700">{cust.customerName}</td>
                      <td className="py-3 text-right text-gray-600">{formatCurrency(cust.absVariance)}</td>
                      <td className={`py-3 text-right font-semibold ${cust.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {cust.variance > 0 ? `+${formatCurrency(cust.variance)}` : formatCurrency(cust.variance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* 右側 1 欄：Country Performance 與 Inventory Risk */}
        <div className="space-y-6">
          
          {/* Inventory Risk (Excess / Shortage) */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Inventory Risk (庫存風險)</h3>
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                <p className="text-xs text-amber-700 font-medium">過剩庫存風險 (Excess)</p>
                <p className="text-lg font-bold text-amber-900 mt-1">{formatCurrency(data.inventoryRiskSummary.excessInventoryValue)}</p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                <p className="text-xs text-red-700 font-medium">缺貨風險 (Shortage)</p>
                <p className="text-lg font-bold text-red-900 mt-1">{formatCurrency(data.inventoryRiskSummary.shortageRiskValue)}</p>
              </div>
              <div className="flex justify-between items-center text-sm px-1 text-gray-500">
                <span>受影響料號數：</span>
                <span className="font-bold text-gray-800">{data.inventoryRiskSummary.itemsAtRisk} 項</span>
              </div>
            </div>
          </div>

          {/* Country Performance */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Country Performance (區域業績表現)</h3>
            <div className="space-y-4">
              {data.countryPerformance.map((country, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-700">{country.country}</span>
                    <span className="text-gray-500 font-semibold">{country.achievementPct}% 達成</span>
                  </div>
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full"
                      style={{ width: `${Math.min(country.achievementPct, 100)}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 pt-0.5">
                    <span>實際: {formatCurrency(country.actual)}</span>
                    <span>目標: {formatCurrency(country.target)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default SalesForecastDashboard;