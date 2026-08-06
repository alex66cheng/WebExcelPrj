import React, { useState, useRef } from 'react';
// Syncfusion Spreadsheet Imports
import { 
    SpreadsheetComponent, SheetsDirective, SheetDirective, ColumnsDirective, 
    ColumnDirective, RowsDirective, RowDirective, CellsDirective, CellDirective 
} from '@syncfusion/ej2-react-spreadsheet';
// Syncfusion Chart Imports
import { 
    AccumulationChartComponent, AccumulationSeriesCollectionDirective, AccumulationSeriesDirective, 
    PieSeries, Inject, AccumulationTooltip, AccumulationDataLabel,
    ChartComponent, SeriesCollectionDirective, SeriesDirective, LineSeries, Category, Legend, Tooltip
} from '@syncfusion/ej2-react-charts';

// Core Syncfusion Styles (Fixes the "Failed to resolve import" errors)
import "@syncfusion/ej2-base/styles/material.css";
import "@syncfusion/ej2-spreadsheet/styles/material.css";
import "@syncfusion/ej2-buttons/styles/material.css";
import "@syncfusion/ej2-splitbuttons/styles/material.css";
import "@syncfusion/ej2-dropdowns/styles/material.css";
import "@syncfusion/ej2-inputs/styles/material.css";
import "@syncfusion/ej2-popups/styles/material.css";

const Dashboard = () => {
    const ssObj = useRef<SpreadsheetComponent>(null);
    
    // --- DASHBOARD STATE ---
    const [salesVolume, setSalesVolume] = useState(10);
    const [priceDiscount, setPriceDiscount] = useState(0);
    const [basePrice, setBasePrice] = useState(950000);
    const [vendorCost, setVendorCost] = useState(715000);

    // --- EVENT: LINK SPREADSHEET TO DASHBOARD ---
    const handleCellSave = () => {
    // A slightly longer delay ensures the spreadsheet has updated its internal JSON model
    setTimeout(async () => {
        if (ssObj.current) {
            // We use the specific sheet name "Costs" and the exact range B1:B2
            const rangeData = await ssObj.current.getData("Costs!B1:B2");
            
            // Syncfusion returns a Map-like structure or an array of rows
            // Let's grab the values directly from the internal sheet data for 100% accuracy
            const sheetData = ssObj.current.getActiveSheet().rows;
            
            if (sheetData) {
                // Row 0, Cell 1 is Base Price
                const priceValue = sheetData[0]?.cells?.[1]?.value;
                // Row 1, Cell 1 is Vendor Cost
                const costValue = sheetData[1]?.cells?.[1]?.value;

                console.log("Extracted from Sheet:", { priceValue, costValue });

                if (typeof priceValue === 'number') setBasePrice(priceValue);
                if (typeof costValue === 'number') setVendorCost(costValue);
            }
        }
    }, 200);
};

    // --- BUSINESS CALCULATIONS ---
    const unitPrice = basePrice * (1 - priceDiscount / 100);
    const totalSales = unitPrice * salesVolume;
    const totalCost = vendorCost * salesVolume;
    const netProfit = totalSales - totalCost;
    const gpPercentage = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

    return (
        <div style={{ width: '100%', minHeight: '100vh', backgroundColor: '#f1f5f9', padding: '20px' }}>
            <div style={{ maxWidth: '1150px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* ROW 1: KPI CARDS (CSS GRID FORCED HORIZONTAL) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
                    <div style={cardStyle}>
                        <div style={labelStyle}>SALES AMOUNT</div>
                        <div style={valStyle}>${(totalSales / 1000).toLocaleString()}k</div>
                    </div>
                    <div style={cardStyle}>
                        <div style={labelStyle}>NET PROFIT</div>
                        <div style={{...valStyle, color: '#10b981'}}>${(netProfit / 1000).toLocaleString()}k</div>
                    </div>
                    <div style={cardStyle}>
                        <div style={labelStyle}>GP %</div>
                        <div style={{...valStyle, color: '#10b981'}}>{gpPercentage.toFixed(0)}%</div>
                    </div>
                    <div style={cardStyle}>
                        <div style={labelStyle}>MARGIN</div>
                        <div style={{...valStyle, color: '#10b981'}}>70%</div>
                    </div>
                </div>

                {/* ROW 2: DARK SLIDER BAR */}
                <div style={sliderContainerStyle}>
                    <div style={{flex: 1}}>
                        <div style={sliderLabelStyle}><span>SALES VOLUME</span> <span>{salesVolume}</span></div>
                        <input type="range" min="1" max="100" value={salesVolume} onChange={(e) => setSalesVolume(Number(e.target.value))} style={rangeStyle} />
                    </div>
                    <div style={{flex: 1}}>
                        <div style={sliderLabelStyle}><span>DISCOUNT Adjustment</span> <span>{priceDiscount}%</span></div>
                        <input type="range" min="0" max="40" value={priceDiscount} onChange={(e) => setPriceDiscount(Number(e.target.value))} style={rangeStyle} />
                    </div>
                </div>

                {/* ROW 3: SYNCFUSION SPREADSHEET (DATA SOURCE) */}
                <div style={{ height: '240px', background: '#fff', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                    <div style={{ padding: '8px 15px', background: '#334155', color: '#fff', fontSize: '11px', fontWeight: 'bold' }}>
                        MASTER DATA CONFIGURATION (EDIT B1 OR B2)
                    </div>
                    <SpreadsheetComponent 
                        ref={ssObj} 
                        cellSave={handleCellSave}
                        showRibbon={false} 
                        showSheetTabs={false}
                    >
                        <SheetsDirective>
                            <SheetDirective name="Costs">
                                <RowsDirective>
                                    <RowDirective>
                                        <CellsDirective>
                                            <CellDirective value="Standard Base Price" />
                                            {/* toString() fixes the "Type number is not assignable to type string" error */}
                                            <CellDirective value={basePrice.toString()} format="$#,##0" />
                                        </CellsDirective>
                                    </RowDirective>
                                    <RowDirective>
                                        <CellsDirective>
                                            <CellDirective value="Raw Vendor Cost" />
                                            <CellDirective value={vendorCost.toString()} format="$#,##0" />
                                        </CellsDirective>
                                    </RowDirective>
                                </RowsDirective>
                                <ColumnsDirective>
                                    <ColumnDirective width={180} />
                                    <ColumnDirective width={150} />
                                </ColumnsDirective>
                            </SheetDirective>
                        </SheetsDirective>
                    </SpreadsheetComponent>
                </div>

                {/* ROW 4: CHARTS SIDE-BY-SIDE */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 2.5fr', gap: '15px', height: '350px' }}>
                    <div style={chartWrapperStyle}>
                        <p style={{...labelStyle, textAlign: 'center'}}>COST BREAKDOWN</p>
                        <AccumulationChartComponent id="pie" height="100%" legendSettings={{visible: false}}>
                            <Inject services={[PieSeries, AccumulationDataLabel, AccumulationTooltip]} />
                            <AccumulationSeriesCollectionDirective>
                                <AccumulationSeriesDirective 
                                    dataSource={[{x: 'Cost', y: totalCost}, {x: 'Profit', y: netProfit}]} 
                                    xName="x" yName="y" innerRadius="60%"
                                    dataLabel={{ visible: true, position: 'Inside', font: { color: 'white', fontWeight: 'bold' }}}
                                    palettes={['#334155', '#10b981']}
                                />
                            </AccumulationSeriesCollectionDirective>
                        </AccumulationChartComponent>
                    </div>

                    <div style={chartWrapperStyle}>
                        <p style={{...labelStyle, textAlign: 'center'}}>CASH FLOW PROJECTION</p>
                        <ChartComponent id="line" primaryXAxis={{ valueType: 'Category' }} height="100%">
                            <Inject services={[LineSeries, Category, Legend, Tooltip]} />
                            <SeriesCollectionDirective>
                                <SeriesDirective 
                                    dataSource={[
                                        {x: 'Y1', y: netProfit * 0.8}, 
                                        {x: 'Y2', y: netProfit * 1.5}, 
                                        {x: 'Y3', y: netProfit * 2.5}
                                    ]} 
                                    xName="x" yName="y" type="Line" width={4} marker={{visible: true, width: 10, height: 10}}
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
const cardStyle = { background: '#fff', padding: '20px', textAlign: 'center' as const, borderRadius: '4px', borderBottom: '4px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };
const labelStyle = { fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', marginBottom: '8px' };
const valStyle = { fontSize: '1.8rem', fontWeight: '900', color: '#1e293b' };
const sliderContainerStyle = { display: 'flex', gap: '60px', padding: '25px 40px', alignItems: 'center', background: '#0f172a', borderRadius: '4px' };
const sliderLabelStyle = { display: 'flex', justifyContent: 'space-between', color: '#38bdf8', fontSize: '12px', fontWeight: 'bold', marginBottom: '10px' };
const rangeStyle = { width: '100%', accentColor: '#38bdf8', cursor: 'pointer' };
const chartWrapperStyle = { background: '#fff', padding: '15px', borderRadius: '4px' };

export default Dashboard;