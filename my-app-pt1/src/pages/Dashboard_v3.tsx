import React, { useState, useRef } from 'react';
import { 
    SpreadsheetComponent, SheetsDirective, SheetDirective, ColumnsDirective, 
    ColumnDirective, RowsDirective, RowDirective, CellsDirective, CellDirective 
} from '@syncfusion/ej2-react-spreadsheet';
import { 
    AccumulationChartComponent, AccumulationSeriesCollectionDirective, AccumulationSeriesDirective, 
    PieSeries, Inject, AccumulationDataLabel, ChartComponent, SeriesCollectionDirective, 
    SeriesDirective, LineSeries, Category, Tooltip
} from '@syncfusion/ej2-react-charts';

import "@syncfusion/ej2-base/styles/material.css";
import "@syncfusion/ej2-spreadsheet/styles/material.css";

const Dashboard = () => {
    const ssObj = useRef<SpreadsheetComponent>(null);
    
    // --- STATE ---
    const [globalDiscount, setGlobalDiscount] = useState(0); // Slider Control
    const [currentMonth, setCurrentMonth] = useState("January");
    
    // Data pulled from Spreadsheet
    const [monthlyS, setMonthlyS] = useState(950000); // Raw Sales (S)
    const [monthlyC, setMonthlyC] = useState(715000); // Total Cost (C)

    // --- LOGIC: LINKING SPREADSHEET ---
    const syncData = () => {
        setTimeout(() => {
            if (ssObj.current) {
                const sheetData = ssObj.current.getActiveSheet().rows;
                if (sheetData) {
                    // We assume B1 is Jan Sales, B2 is Jan Cost
                    // In a full version, we could detect which column the user clicked
                    const sValue = sheetData[0]?.cells?.[1]?.value;
                    const cValue = sheetData[1]?.cells?.[1]?.value;

                    if (typeof sValue === 'number') setMonthlyS(sValue);
                    if (typeof cValue === 'number') setMonthlyC(cValue);
                }
            }
        }, 200);
    };

    // --- FINANCIAL CALCULATIONS ---
    const realSales = monthlyS * (1 - globalDiscount / 100);
    const netProfit = realSales - monthlyC;
    const grossMargin = realSales > 0 ? (netProfit / realSales) * 100 : 0;

    return (
        <div style={{ width: '100%', minHeight: '100vh', backgroundColor: '#f8fafc', padding: '20px' }}>
            <div style={{ maxWidth: '1150px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* TITLE & MONTH INDICATOR */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ color: '#1e293b', margin: 0 }}>Monthly Performance: <span style={{color: '#3b82f6'}}>{currentMonth}</span></h2>
                </div>

                {/* ROW 1: KPI CARDS */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
                    <div style={cardStyle}>
                        <div style={labelStyle}>GROSS SALES (S)</div>
                        <div style={valStyle}>${(monthlyS / 1000).toLocaleString()}k</div>
                    </div>
                    <div style={cardStyle}>
                        <div style={labelStyle}>REAL SALES (S - Discount)</div>
                        <div style={{...valStyle, color: '#3b82f6'}}>${(realSales / 1000).toLocaleString()}k</div>
                    </div>
                    <div style={cardStyle}>
                        <div style={labelStyle}>NET PROFIT</div>
                        <div style={{...valStyle, color: '#10b981'}}>${(netProfit / 1000).toLocaleString()}k</div>
                    </div>
                    <div style={cardStyle}>
                        <div style={labelStyle}>GROSS MARGIN %</div>
                        <div style={{...valStyle, color: '#10b981'}}>{grossMargin.toFixed(1)}%</div>
                    </div>
                </div>

                {/* ROW 2: LIVE DISCOUNT SLIDER */}
                <div style={sliderContainerStyle}>
                    <div style={{flex: 1}}>
                        <div style={sliderLabelStyle}>
                            <span>ADJUST DISCOUNT SIMULATION</span> 
                            <span style={{background: '#38bdf8', color: '#000', padding: '2px 8px', borderRadius: '4px'}}>{globalDiscount}%</span>
                        </div>
                        <input 
                            type="range" min="0" max="50" step="1"
                            value={globalDiscount} 
                            onChange={(e) => setGlobalDiscount(Number(e.target.value))} 
                            style={rangeStyle} 
                        />
                    </div>
                </div>

                {/* ROW 3: MONTHLY MASTER SPREADSHEET */}
                <div style={{ height: '220px', background: '#fff', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                    <div style={{ padding: '8px 15px', background: '#1e293b', color: '#fff', fontSize: '11px' }}>
                        MONTHLY DATA INPUT (Edit January Column to update Dashboard)
                    </div>
                    <SpreadsheetComponent 
                        ref={ssObj} 
                        cellSave={syncData}
                        showRibbon={false} 
                        showSheetTabs={false}
                    >
                        <SheetsDirective>
                            <SheetDirective name="Forecast">
                                <RowsDirective>
                                    <RowDirective>
                                        <CellsDirective>
                                            <CellDirective value="Gross Sales (S)" />
                                            <CellDirective value={monthlyS.toString()} format="$#,##0" />
                                            <CellDirective value="1050000" format="$#,##0" /> {/* Feb */}
                                            <CellDirective value="1100000" format="$#,##0" /> {/* Mar */}
                                        </CellsDirective>
                                    </RowDirective>
                                    <RowDirective>
                                        <CellsDirective>
                                            <CellDirective value="Total Cost (C)" />
                                            <CellDirective value={monthlyC.toString()} format="$#,##0" />
                                            <CellDirective value="720000" format="$#,##0" /> {/* Feb */}
                                            <CellDirective value="735000" format="$#,##0" /> {/* Mar */}
                                        </CellsDirective>
                                    </RowDirective>
                                </RowsDirective>
                                <ColumnsDirective>
                                    <ColumnDirective width={150} />
                                    <ColumnDirective width={120} /> {/* Jan */}
                                    <ColumnDirective width={120} /> {/* Feb */}
                                    <ColumnDirective width={120} /> {/* Mar */}
                                </ColumnsDirective>
                            </SheetDirective>
                        </SheetsDirective>
                    </SpreadsheetComponent>
                </div>

                {/* ROW 4: CHARTS */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '15px', height: '300px' }}>
                    <div style={chartWrapperStyle}>
                        <AccumulationChartComponent id="pie" height="100%" legendSettings={{visible: false}}>
                            <Inject services={[PieSeries, AccumulationDataLabel]} />
                            <AccumulationSeriesCollectionDirective>
                                <AccumulationSeriesDirective 
                                    dataSource={[{x: 'Costs', y: monthlyC}, {x: 'Profit', y: netProfit}]} 
                                    xName="x" yName="y" innerRadius="65%"
                                    dataLabel={{ visible: true, position: 'Inside' }}
                                    palettes={['#cbd5e1', '#10b981']}
                                />
                            </AccumulationSeriesCollectionDirective>
                        </AccumulationChartComponent>
                    </div>
                    <div style={chartWrapperStyle}>
                        <ChartComponent id="line" primaryXAxis={{ valueType: 'Category' }} height="100%">
                            <Inject services={[LineSeries, Category, Tooltip]} />
                            <SeriesCollectionDirective>
                                <SeriesDirective 
                                    dataSource={[
                                        {x: 'Jan', y: 235000}, {x: 'Feb', y: 330000}, {x: 'Mar', y: 365000}
                                    ]} 
                                    xName="x" yName="y" type="Line" width={4} marker={{visible: true}}
                                />
                            </SeriesCollectionDirective>
                        </ChartComponent>
                    </div>
                </div>

            </div>
        </div>
    );
};

// --- STYLES ---
const cardStyle = { background: '#fff', padding: '20px', textAlign: 'center' as const, borderRadius: '8px', border: '1px solid #e2e8f0' };
const labelStyle = { fontSize: '10px', fontWeight: 'bold', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' as const };
const valStyle = { fontSize: '1.8rem', fontWeight: '800', color: '#0f172a' };
const sliderContainerStyle = { padding: '25px 40px', background: '#0f172a', borderRadius: '8px' };
const sliderLabelStyle = { display: 'flex', justifyContent: 'space-between', color: '#38bdf8', fontSize: '12px', fontWeight: 'bold', marginBottom: '15px' };
const rangeStyle = { width: '100%', accentColor: '#38bdf8', cursor: 'pointer' };
const chartWrapperStyle = { background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' };

export default Dashboard;