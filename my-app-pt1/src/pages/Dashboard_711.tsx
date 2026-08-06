import React, { useState, useEffect } from 'react';
import { 
  Thermometer, 
  Zap, 
  Activity, 
  Coffee, 
  Wind, 
  Refrigerator, 
  AlertTriangle, 
  CheckCircle 
} from 'lucide-react';

// === TypeScript 型態定義 ===
interface BaseDevice {
  id: string;
  name: string;
  isOnline: boolean;
}

interface ApplianceDevice extends BaseDevice {
  temperature: number;
  powerConsumption: number; // 單位: kWh
}

interface CoffeeMachineDevice extends BaseDevice {
  cups: {
    americano: number;
    latte: number;
    cappuccino: number;
  };
}

export default function Dashboard() {
  // === 1. 初始化 2台空調 & 5台冷凍櫃的模擬數據 ===
  const [acDevices, setAcDevices] = useState<ApplianceDevice[]>([
    { id: 'AC-01', name: '大廳空調 1型', isOnline: true, temperature: 24.5, powerConsumption: 1.2 },
    { id: 'AC-02', name: '包廂空調 2型', isOnline: true, temperature: 26.0, powerConsumption: 0.9 },
  ]);

  const [fridgeDevices, setFridgeDevices] = useState<ApplianceDevice[]>([
    { id: 'FR-01', name: '吧台冷凍櫃 A', isOnline: true, temperature: -18.0, powerConsumption: 2.1 },
    { id: 'FR-02', name: '後廚冷凍櫃 B', isOnline: true, temperature: -16.5, powerConsumption: 2.4 },
    { id: 'FR-03', name: '食材冷凍櫃 C', isOnline: false, temperature: 5.2, powerConsumption: 0.0 }, // 離線異常
    { id: 'FR-04', name: '飲料冷藏櫃 D', isOnline: true, temperature: 4.0, powerConsumption: 1.5 },
    { id: 'FR-05', name: '甜點展示櫃 E', isOnline: true, temperature: 5.0, powerConsumption: 1.1 },
  ]);

  // === 2. 初始化 3台咖啡機的模擬數據 ===
  const [coffeeMachines, setCoffeeMachines] = useState<CoffeeMachineDevice[]>([
    { id: 'CF-01', name: '義式主機 1號', isOnline: true, cups: { americano: 45, latte: 32, cappuccino: 18 } },
    { id: 'CF-02', name: '美式外帶 2號', isOnline: true, cups: { americano: 88, latte: 12, cappuccino: 5 } },
    { id: 'CF-03', name: '吧台備用 3號', isOnline: true, cups: { americano: 12, latte: 8, cappuccino: 4 } },
  ]);

  // === 3. 模擬 MQTT 即時數據跳動效果 ===
  useEffect(() => {
    const interval = setInterval(() => {
      // 隨機微調空調與冰箱的溫度、能耗
      setAcDevices(prev => prev.map(ac => ac.isOnline ? {
        ...ac,
        temperature: +(ac.temperature + (Math.random() - 0.5) * 0.4).toFixed(1),
        powerConsumption: +(ac.powerConsumption + Math.random() * 0.05).toFixed(2)
      } : ac));

      setFridgeDevices(prev => prev.map(fr => fr.isOnline ? {
        ...fr,
        temperature: +(fr.temperature + (Math.random() - 0.5) * 0.2).toFixed(1),
        powerConsumption: +(fr.powerConsumption + Math.random() * 0.03).toFixed(2)
      } : fr));

      // 隨機模擬咖啡機出杯數增加
      setCoffeeMachines(prev => prev.map(cf => {
        if (!cf.isOnline) return cf;
        const rand = Math.random();
        if (rand > 0.7) {
          return {
            ...cf,
            cups: {
              americano: cf.cups.americano + (rand > 0.9 ? 1 : 0),
              latte: cf.cups.latte + (rand > 0.8 && rand <= 0.9 ? 1 : 0),
              cappuccino: cf.cups.cappuccino + (rand > 0.7 && rand <= 0.8 ? 1 : 0),
            }
          };
        }
        return cf;
      }));
    }, 3000); // 每 3 秒更新一次數據

    return () => clearInterval(interval);
  }, []);

  // 計算總出杯數
  const totalCups = coffeeMachines.reduce((sum, cf) => 
    sum + cf.cups.americano + cf.cups.latte + cf.cups.cappuccino, 0
  );

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6 font-sans">
      {/* 標頭架構 */}
      <header className="mb-8 border-b border-gray-800 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-amber-500 bg-clip-text text-transparent">
            IoT 智慧門市即時監控看板
          </h1>
          <p className="text-sm text-gray-400 mt-1">數據源：GCP MQTT IoT Hub (即時推送中)</p>
        </div>
        <div className="flex items-center gap-4 text-sm bg-gray-800 px-4 py-2 rounded-lg border border-gray-700">
          <span className="flex items-center gap-1.5"><Activity className="w-4 h-4 text-green-400 animate-pulse" /> 系統連線正常</span>
          <span className="text-gray-500">|</span>
          <span>總出杯數: <strong className="text-orange-400">{totalCups}</strong> 杯</span>
        </div>
      </header>

      {/* 區塊一：環境與能源監控 (2台空調 + 5台冷凍櫃) */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-blue-400">
          <Zap className="w-5 h-5" /> 非咖啡設備監控 (空調 x2, 冷凍櫃 x5)
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 空調卡片渲染 */}
          {acDevices.map(ac => (
            <div key={ac.id} className="bg-gray-800 p-4 rounded-xl border border-gray-700 relative overflow-hidden">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400"><Wind className="w-5 h-5" /></div>
                  <div>
                    <h3 className="font-medium text-sm">{ac.name}</h3>
                    <span className="text-xs text-gray-500">{ac.id}</span>
                  </div>
                </div>
                <StatusBadge isOnline={ac.isOnline} />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4 pt-2 border-t border-gray-700/50">
                <div>
                  <p className="text-xs text-gray-400 flex items-center gap-1"><Thermometer className="w-3 h-3" /> 溫度</p>
                  <p className="text-xl font-semibold mt-0.5 text-blue-300">{ac.temperature}°C</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 flex items-center gap-1"><Zap className="w-3 h-3" /> 當前能耗</p>
                  <p className="text-xl font-semibold mt-0.5 text-amber-400">{ac.powerConsumption} <span className="text-xs font-normal text-gray-500">kWh</span></p>
                </div>
              </div>
            </div>
          ))}

          {/* 冷凍櫃卡片渲染 */}
          {fridgeDevices.map(fr => (
            <div key={fr.id} className={`bg-gray-800 p-4 rounded-xl border relative overflow-hidden transition-colors ${fr.isOnline ? 'border-gray-700' : 'border-red-500/40 bg-red-950/10'}`}>
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${fr.isOnline ? 'bg-teal-500/10 text-teal-400' : 'bg-red-500/10 text-red-400'}`}>
                    <Refrigerator className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-sm">{fr.name}</h3>
                    <span className="text-xs text-gray-500">{fr.id}</span>
                  </div>
                </div>
                <StatusBadge isOnline={fr.isOnline} />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4 pt-2 border-t border-gray-700/50">
                <div>
                  <p className="text-xs text-gray-400 flex items-center gap-1"><Thermometer className="w-3 h-3" /> 溫度</p>
                  <p className={`text-xl font-semibold mt-0.5 ${!fr.isOnline || fr.temperature > 0 ? 'text-red-400' : 'text-teal-300'}`}>
                    {fr.temperature}°C
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 flex items-center gap-1"><Zap className="w-3 h-3" /> 當前能耗</p>
                  <p className="text-xl font-semibold mt-0.5 text-amber-400">{fr.powerConsumption} <span className="text-xs font-normal text-gray-500">kWh</span></p>
                </div>
              </div>
              {!fr.isOnline && (
                <div className="absolute bottom-0 left-0 right-0 bg-red-600 text-[10px] text-center py-0.5 font-medium tracking-wider uppercase text-white">
                  溫度異常告警中
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 區塊二：設備端咖啡機營運 (3台咖啡機各自的出杯數) */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-orange-400">
          <Coffee className="w-5 h-5" /> 設備端咖啡機數據 (咖啡機 x3)
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {coffeeMachines.map(cf => {
            const machineTotal = cf.cups.americano + cf.cups.latte + cf.cups.cappuccino;
            return (
              <div key={cf.id} className="bg-gray-800 p-5 rounded-xl border border-gray-700">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 bg-orange-500/10 rounded-lg text-orange-400"><Coffee className="w-5 h-5" /></div>
                    <div>
                      <h3 className="font-semibold text-base">{cf.name}</h3>
                      <p className="text-xs text-gray-500">ID: {cf.id} | 連線模式: MQTT</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold bg-gray-700 px-2.5 py-1 rounded-full text-orange-300">
                    單機總計: {machineTotal} 杯
                  </span>
                </div>

                {/* 各式咖啡杯數細節 */}
                <div className="space-y-3 mt-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">☕ 美式咖啡 (Americano)</span>
                      <span className="font-medium text-gray-200">{cf.cups.americano} 杯</span>
                    </div>
                    <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
                      <div className="bg-amber-700 h-full rounded-full" style={{ width: `${Math.min((cf.cups.americano/120)*100, 100)}%` }}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">🥛 拿鐵咖啡 (Latte)</span>
                      <span className="font-medium text-gray-200">{cf.cups.latte} 杯</span>
                    </div>
                    <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
                      <div className="bg-orange-400 h-full rounded-full" style={{ width: `${Math.min((cf.cups.latte/120)*100, 100)}%` }}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">🧼 卡布奇諾 (Cappuccino)</span>
                      <span className="font-medium text-gray-200">{cf.cups.cappuccino} 杯</span>
                    </div>
                    <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
                      <div className="bg-yellow-600 h-full rounded-full" style={{ width: `${Math.min((cf.cups.cappuccino/120)*100, 100)}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// === 內部元件：在線狀態標籤 ===
function StatusBadge({ isOnline }: { isOnline: boolean }) {
  return isOnline ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full border border-green-500/20">
      <CheckCircle className="w-3 h-3" /> 在線
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full border border-red-500/20 animate-pulse">
      <AlertTriangle className="w-3 h-3" /> 離線
    </span>
  );
}