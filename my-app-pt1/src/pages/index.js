const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const sql = require('mssql'); // ✅ 保留原本的 MSSQL
const { MongoClient } = require('mongodb'); // ✅ 新增引入 MongoDB
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));

// ==========================================
// 📂 ⚙️ 多媒體 Multer 實體磁碟儲存設定 (步驟 0 專用)
// ==========================================
const uploadDirectory = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDirectory)) {
    fs.mkdirSync(uploadDirectory, { recursive: true });
}

// 記憶體暫存 (保留給原本的 open 路由使用)
const memoryStorage = multer.memoryStorage();
const uploadMemory = multer({ storage: memoryStorage });

// 實體硬碟儲存 (提供給儲存至 Server 範本使用)
const diskStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDirectory);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});
const uploadDisk = multer({ storage: diskStorage });


// ==========================================
// ⚡ 🧠 動態資料庫連線池快取管理器 (Dynamic DB Manager - MSSQL)
// ==========================================
// 預設的 fallback 憑證
const defaultDbConfig = {
    user: 'sa',             
    password: '123456', 
    server: '127.0.0.1',       
    database: 'demodb', 
    options: { encrypt: false, trustServerCertificate: true }
};

// 用於存放不同環境的 connection pools 的 Map
const pools = new Map();

/**
 * 核心安全控管方法：根據前端帶入的環境變數動態獲取或建立 Pool
 */
async function getPool(customConfig = {}) {
    const host = customConfig.host || defaultDbConfig.server;
    const user = customConfig.user || defaultDbConfig.user;
    const password = customConfig.password || defaultDbConfig.password;
    const database = defaultDbConfig.database; // 預設鎖定專案的 demodb

    const cacheKey = `${host}_${user}_${database}`;

    if (pools.has(cacheKey)) {
        const cachedPool = pools.get(cacheKey);
        if (cachedPool.connected) return cachedPool;
        pools.delete(cacheKey); // 斷線則移除舊快取
    }

    const targetConfig = {
        user: user,
        password: password,
        server: host,
        database: database,
        options: { encrypt: false, trustServerCertificate: true },
        pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
    };

    console.log(`🔌 正在為資料庫環境進行動態配對建置 [Key: ${cacheKey}]...`);
    const newPool = new sql.ConnectionPool(targetConfig);
    await newPool.connect();
    pools.set(cacheKey, newPool);
    return newPool;
}

// 服務啟動時進行預設連線自我測試
(async () => {
    try {
        await getPool();
        console.log('✅ 預設本機 MSSQL (demodb) 連線測試池初始化成功！');
    } catch (err) {
        console.error('⚠️ 預設本機 MSSQL 連線失敗 (不影響啟動，等候前端動態輸入):', err.message);
    }
})();


// ==========================================
// 🔌 📦 MongoDB 連線參數設定
// ==========================================
const mongoUrl = 'mongodb://127.0.0.1:27017'; // 本地端 MongoDB 預設位址
const mongoDbName = 'excel_import_system';     // 設定儲存的 Database 名稱


// ==========================================
// 🧪 共用工具函式
// ==========================================
const fixColor = (colorObj) => {
    if (!colorObj) return null;
    let argb = colorObj.argb;
    if (argb && argb.length === 8) return `#${argb.slice(2)}`;
    if (argb && argb.length === 6) return `#${argb}`;
    return null;
};

function parseCellValue(cellValue) {
    if (cellValue === undefined || cellValue === null) return "";
    if (cellValue.result !== undefined) {
        cellValue = cellValue.result;
    }
    if (cellValue && cellValue.richText && Array.isArray(cellValue.richText)) {
        return cellValue.richText.map(item => item.text || "").join("").trim();
    }
    if (typeof cellValue === 'object' && !(cellValue instanceof Date)) {
        if (cellValue.text !== undefined) return String(cellValue.text).trim();
        try {
            const strObj = JSON.stringify(cellValue);
            const match = strObj.match(/"(?:text|value|result)"\s*:\s*"([^"]+)"/);
            if (match && match[1]) return match[1].trim();
        } catch(e) {}
            return "";
    }
    return String(cellValue).trim();
}

// 字母欄位轉成 Index 數字 (例如 A->1, B->2, G->7, X->24)
function letterToColumnIndex(letter) {
    if (!letter) return 1;
    let column = 0;
    const length = letter.length;
    for (let i = 0; i < length; i++) {
        column += (letter.toUpperCase().charCodeAt(i) - 64) * Math.pow(26, length - i - 1);
    }
    return column;
}


// ==========================================
// 🌟 擴充新增路由 0-A：接收 Excel 範本實體儲存至 Server
// ==========================================
app.post('/api/spreadsheet/upload', uploadDisk.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: '未偵測到上傳檔案' });
        }
        console.log(`💾 檔案已安全儲存至 Server: ${req.file.path}`);
        return res.json({
            success: true,
            message: '檔案上傳成功並安全儲存至伺服器端目錄下',
            filePath: req.file.path,
            fileName: req.file.filename
        });
    } catch (err) {
        console.error("Upload Route Error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});


// ==========================================
// 🌟 擴充新增路由 0-B：動態測試資料庫環境連線狀態 (原 MSSQL 測試)
// ==========================================
app.post('/api/spreadsheet/test-connection', async (req, res) => {
    const { host, user, password } = req.body;
    try {
        // 強制不使用快取，直接嘗試全新建立測試
        const testConfig = {
            user: user,
            password: password,
            server: host,
            database: defaultDbConfig.database,
            options: { encrypt: false, trustServerCertificate: true },
            connectTimeout: 5000 // 5 秒連線逾時防呆
        };
        
        const testPool = new sql.ConnectionPool(testConfig);
        await testPool.connect();
        await testPool.close(); // 測試完即關閉釋放

        return res.json({ success: true, message: '連線成功！該環境目前狀態健全。' });
    } catch (err) {
        console.error("DB Dynamic Test Connection Failed:", err.message);
        return res.status(200).json({ success: false, message: err.message });
    }
});

// ==========================================
// 1. 高擬真 OPEN 路由 (完美修復邊線消失、CSS 衝突優化版)
// ==========================================
app.post('/api/spreadsheet/open', uploadMemory.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send("No file uploaded");

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.getWorksheet(1);

        let formattedRows = [];
        worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
            let cells = [];
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                const cleanValue = parseCellValue(cell.value);
                const cellObj = {
                    value: cleanValue,
                    formula: cell.formula ? `=${cell.formula}` : undefined,
                    style: {}
                };

                // 🌟 1. 文字字體樣式
                if (cell.font) {
                    if (cell.font.bold) cellObj.style.fontWeight = 'bold';
                    if (cell.font.italic) cellObj.style.fontStyle = 'italic';
                    if (cell.font.size) cellObj.style.fontSize = `${cell.font.size}pt`;
                    const fColor = fixColor(cell.font.color);
                    if (fColor) cellObj.style.color = fColor;
                }

                // 🌟 2. 背景填滿樣式
                if (cell.fill && cell.fill.fgColor) {
                    const bColor = fixColor(cell.fill.fgColor);
                    if (bColor) cellObj.style.backgroundColor = bColor;
                }

                // 🌟 3. 核心修復：完美補全四面邊線 (對齊 Syncfusion 底層樣式)
                if (cell.border) {
                    const borderStyle = "1px solid #c0c0c0"; // 建議使用微灰或黑，避免相鄰格 CSS 碰撞
                    
                    if (cell.border.top && cell.border.top.style) {
                        cellObj.style.borderTop = borderStyle;
                    }
                    if (cell.border.bottom && cell.border.bottom.style) {
                        cellObj.style.borderBottom = borderStyle;
                    }
                    if (cell.border.left && cell.border.left.style) {
                        cellObj.style.borderLeft = borderStyle;
                    }
                    if (cell.border.right && cell.border.right.style) {
                        cellObj.style.borderRight = borderStyle;
                    }
                }

                // 🌟 4. 文字對齊樣式
                if (cell.alignment) {
                    if (cell.alignment.horizontal) cellObj.style.textAlign = cell.alignment.horizontal;
                    if (cell.alignment.vertical) {
                        cellObj.style.verticalAlign = cell.alignment.vertical === 'middle' ? 'middle' : cell.alignment.vertical;
                    }
                    if (cell.alignment.wrapText) cellObj.style.wrap = true;
                }
                cells[colNumber - 1] = cellObj;
            });
            formattedRows[rowNumber - 1] = { cells: cells, height: row.height ? row.height * 1.33 : 20 };
        });

        const columns = worksheet.columns.map(col => ({ width: col.width ? col.width * 7 : 64 }));

        // 🌟 5. 合併儲存格邊線防護（避免副儲存格蓋掉主儲存格的邊框）
        if (worksheet._merges) {
            Object.values(worksheet._merges).forEach(merge => {
                const { top, left, bottom, right } = merge;
                const masterRow = formattedRows[top - 1];
                if (masterRow && masterRow.cells[left - 1]) {
                    const masterCell = masterRow.cells[left - 1];
                    masterCell.rowSpan = (bottom - top) + 1;
                    masterCell.colSpan = (right - left) + 1;
                    
                    // 遍歷所有被覆蓋的副儲存格，不要用空物件覆蓋它，而是保留其結構以維持 Table 框線連續性
                    for (let r = top; r <= bottom; r++) {
                        for (let c = left; c <= right; c++) {
                            if (r === top && c === left) continue;
                            if (formattedRows[r - 1] && formattedRows[r - 1].cells[c - 1]) {
                                // 僅清空值，保留原有的基本框線線索
                                formattedRows[r - 1].cells[c - 1].value = ""; 
                            }
                        }
                    }
                }
            });
        }

        const result = { Workbook: { sheets: [{ name: worksheet.name, rows: formattedRows, columns: columns }] } };
        res.json({ jsonObject: JSON.stringify(result) });
    } catch (err) { 
        console.error("Open Error:", err);
        res.status(500).send(err.message); 
    }
});


// ==========================================
// 1. 高擬真 OPEN 路由
// ==========================================
app.post('/api/spreadsheet/open2', uploadMemory.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send("No file uploaded");

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.getWorksheet(1);

        let formattedRows = [];
        worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
            let cells = [];
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                const cleanValue = parseCellValue(cell.value);
                const cellObj = {
                    value: cleanValue,
                    formula: cell.formula ? `=${cell.formula}` : undefined,
                    style: {}
                };

                if (cell.font) {
                    if (cell.font.bold) cellObj.style.fontWeight = 'bold';
                    if (cell.font.italic) cellObj.style.fontStyle = 'italic';
                    if (cell.font.size) cellObj.style.fontSize = `${cell.font.size}pt`;
                    const fColor = fixColor(cell.font.color);
                    if (fColor) cellObj.style.color = fColor;
                }

                if (cell.fill && cell.fill.fgColor) {
                    const bColor = fixColor(cell.fill.fgColor);
                    if (bColor) cellObj.style.backgroundColor = bColor;
                }

                if (cell.border) {
                    if (cell.border.top) cellObj.style.borderTop = "1px solid #000000";
                    if (cell.border.bottom) cellObj.style.borderBottom = "1px solid #000000";
                    if (cell.border.left) cellObj.style.borderLeft = "1px solid #000000";
                    if (cell.border.right) cellObj.style.borderRight = "1px solid #000000";
                }

                if (cell.alignment) {
                    if (cell.alignment.horizontal) cellObj.style.textAlign = cell.alignment.horizontal;
                    if (cell.alignment.vertical) {
                        cellObj.style.verticalAlign = cell.alignment.vertical === 'middle' ? 'middle' : cell.alignment.vertical;
                    }
                    if (cell.alignment.wrapText) cellObj.style.wrap = true;
                }
                cells[colNumber - 1] = cellObj;
            });
            formattedRows[rowNumber - 1] = { cells: cells, height: row.height ? row.height * 1.33 : 20 };
        });

        const columns = worksheet.columns.map(col => ({ width: col.width ? col.width * 7 : 64 }));

        if (worksheet._merges) {
            Object.values(worksheet._merges).forEach(merge => {
                const { top, left, bottom, right } = merge;
                const masterRow = formattedRows[top - 1];
                if (masterRow && masterRow.cells[left - 1]) {
                    const masterCell = masterRow.cells[left - 1];
                    masterCell.rowSpan = (bottom - top) + 1;
                    masterCell.colSpan = (right - left) + 1;
                    for (let r = top; r <= bottom; r++) {
                        for (let c = left; c <= right; c++) {
                            if (r === top && c === left) continue;
                            if (formattedRows[r - 1] && formattedRows[r - 1].cells[c - 1]) {
                                formattedRows[r - 1].cells[c - 1] = { value: "" }; 
                            }
                        }
                    }
                }
            });
        }

        const result = { Workbook: { sheets: [{ name: worksheet.name, rows: formattedRows, columns: columns }] } };
        res.json({ jsonObject: JSON.stringify(result) });
    } catch (err) { 
        console.error("Open Error:", err);
        res.status(500).send(err.message); 
    }
});

// ==========================================
// 🎨 2. 完美整合優化：高擬真 SaveX2 路由 (自動校正數字型態版)
// ==========================================
app.post('/api/spreadsheet/saveX2', uploadMemory.any(), async (req, res) => {
    try {
        let rawData = req.body.JSONData;
        if (!rawData) return res.status(400).send("No data received");

        let fullModel = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        
        if (fullModel.jsonObject) {
            fullModel = typeof fullModel.jsonObject === 'string' ? JSON.parse(fullModel.jsonObject).Workbook : fullModel.jsonObject;
        } else if (fullModel.Workbook) {
            fullModel = fullModel.Workbook;
        }

        const sheet = fullModel.sheets?.[0];
        if (!sheet || !sheet.rows) return res.status(400).send("No valid sheet found");

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(sheet.name || 'Sheet1');

        if (sheet.columns) {
            worksheet.columns = sheet.columns.map(col => ({
                width: col.width ? col.width / 7 : 12
            }));
        }

        sheet.rows.forEach((row, rIdx) => {
            if (!row || !row.cells) return;
            const excelRow = worksheet.getRow(rIdx + 1);
            if (row.height) excelRow.height = row.height / 1.33;

            row.cells.forEach((cell, cIdx) => {
                if (!cell) return;
                const excelCell = excelRow.getCell(cIdx + 1);

                // 🌟 核心修正：自動檢測並將「純數字字串」轉回真實的 Number 型態，消滅綠色三角形
                let targetValue = cell.value;
                if (targetValue !== undefined && targetValue !== null && targetValue !== '') {
                    // 去除千分位逗號後，若為純數字則轉為 float/int
                    const cleanedStr = String(targetValue).replace(/,/g, '').trim();
                    if (!isNaN(cleanedStr) && cleanedStr !== '') {
                        targetValue = Number(cleanedStr);
                    }
                }

                // 還原數值或公式
                if (cell.formula) {
                    excelCell.value = { formula: cell.formula.replace(/^=/, ''), result: targetValue };
                } else {
                    excelCell.value = targetValue;
                }

                // 還原前端設定之樣式 (Style)
                if (cell.style) {
                    const style = cell.style;
                    
                    excelCell.font = {
                        bold: style.fontWeight === 'bold',
                        italic: style.fontStyle === 'italic',
                        size: style.fontSize ? parseInt(style.fontSize) : 11,
                        color: style.color ? { argb: 'FF' + style.color.replace('#', '') } : undefined
                    };

                    if (style.backgroundColor) {
                        excelCell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FF' + style.backgroundColor.replace('#', '') }
                        };
                    }

                    if (style.borderTop || style.borderBottom || style.borderLeft || style.borderRight) {
                        excelCell.border = {
                            top: style.borderTop ? { style: 'thin', color: { argb: 'FFC0C0C0' } } : undefined,
                            bottom: style.borderBottom ? { style: 'thin', color: { argb: 'FFC0C0C0' } } : undefined,
                            left: style.borderLeft ? { style: 'thin', color: { argb: 'FFC0C0C0' } } : undefined,
                            right: style.borderRight ? { style: 'thin', color: { argb: 'FFC0C0C0' } } : undefined
                        };
                    }

                    if (style.textAlign || style.verticalAlign) {
                        excelCell.alignment = {
                            horizontal: style.textAlign || 'left',
                            vertical: style.verticalAlign === 'middle' ? 'middle' : 'top',
                            wrapText: !!style.wrap
                        };
                    }
                }
            });
        });

        sheet.rows.forEach((row, rIdx) => {
            if (!row || !row.cells) return;
            row.cells.forEach((cell, cIdx) => {
                if (cell && (cell.rowSpan > 1 || cell.colSpan > 1)) {
                    const top = rIdx + 1;
                    const left = cIdx + 1;
                    const bottom = top + (cell.rowSpan || 1) - 1;
                    const right = left + (cell.colSpan || 1) - 1;
                    try {
                        worksheet.mergeCells(top, left, bottom, right);
                    } catch (e) {}
                }
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=ExportTemplate.xlsx');
        return res.send(buffer);

    } catch (error) {
        console.error("❌ SaveX2 核心處理崩潰:", error);
        res.status(500).send(`伺服器導出 Excel 失敗: ${error.message}`);
    }
});

// ==========================================================================
// ⚡ 核心整合：讀取前端畫面 JSON + 依 MongoDB 範本規則轉置 + 寫入 MSSQL 資料表
// ==========================================================================
app.post('/api/spreadsheet/save-excel-to-mssql-by-template', async (req, res) => {
    const { spreadsheetData, templateCode } = req.body;

    if (!templateCode) {
        return res.status(400).json({ success: false, message: '請提供 templateCode 識別碼' });
    }

    let incoming = spreadsheetData;
    let gridData = (typeof incoming === 'string') ? JSON.parse(incoming) : incoming;
    const workbookJson = gridData?.jsonObject?.Workbook || gridData?.Workbook;
    
    if (!workbookJson || !workbookJson.sheets || workbookJson.sheets.length === 0) {
        return res.status(400).json({ success: false, message: '無效或空的的試算表數據' });
    }

    // ── STEP 1: 從 MongoDB 中撈取該 templateCode 的詳細 Mapping 配置 ──
    const mongoClient = new MongoClient(mongoUrl);
    let config = null;
    try {
        await mongoClient.connect();
        const db = mongoClient.db(mongoDbName);
        config = await db.collection('templates').findOne({ templateCode: templateCode });
        if (!config) {
            return res.status(404).json({ success: false, message: `在 MongoDB 中找不到代碼為 [${templateCode}] 的設定檔` });
        }
    } catch (mongoErr) {
        console.error("❌ 讀取 MongoDB 範本失敗:", mongoErr);
        return res.status(500).json({ success: false, message: '讀取 MongoDB 範本配置時發生異常' });
    } finally {
        await mongoClient.close();
    }

    // 解構 MongoDB 撈出的設定
    const { targetTable, dataStartRow, rowHeaders, timeline, skipHeaders, dbConfig } = config;
    const sheetData = workbookJson.sheets[0];
    const rows = sheetData.rows || [];

    const startColIdx = letterToColumnIndex(timeline.startColumn);
    const endColIdx = letterToColumnIndex(timeline.endColumn);

    try {
        // ── STEP 2: 橫向解析時間標頭矩陣 (從畫面的 Row 中撈取) ──
        const timelineHeaders = {};
        const yearRowData = rows[timeline.yearRow - 1];
        const itemRowData = rows[timeline.itemRow - 1];

        for (let col = startColIdx; col <= endColIdx; col++) {
            const yearCell = yearRowData?.cells?.[col - 1];
            const itemCell = itemRowData?.cells?.[col - 1];
            const yearVal = parseCellValue(yearCell?.value !== undefined ? yearCell.value : yearCell);
            const itemVal = parseCellValue(itemCell?.value !== undefined ? itemCell.value : itemCell);

            if ((skipHeaders || []).includes(itemVal) || (skipHeaders || []).includes(yearVal)) continue;
            if (!itemVal && !yearVal) continue;

            timelineHeaders[col] = { year: yearVal, item: itemVal };
        }

        // ── STEP 3: 縱向遍歷資料列進行 Unpivot 轉置 ──
        const groupedCache = {};
        const recordsToInsert = [];
        const startRow = Number(dataStartRow) || 1;

        for (let r = startRow; r <= rows.length; r++) {
            const rowData = rows[r - 1];
            if (!rowData || !rowData.cells) continue;

            const fixedFields = {};
            let isRowValid = true;

            // 解析固定維度
            for (const header of rowHeaders) {
                const colIdx = letterToColumnIndex(header.excelColumn);
                const cell = rowData.cells[colIdx - 1];
                let cellValue = parseCellValue(cell?.value !== undefined ? cell.value : cell);

                if (header.isGrouped) {
                    if (cellValue !== '') {
                        groupedCache[header.dbFieldName] = cellValue;
                    } else {
                        cellValue = groupedCache[header.dbFieldName] || '';
                    }
                }

                if (header.filterType === 'not_empty' && !cellValue) {
                    isRowValid = false;
                    break;
                }
                fixedFields[header.dbFieldName] = cellValue;
            }

            if (!isRowValid) continue;

            // 交叉轉置時間與數值
            for (let col = startColIdx; col <= endColIdx; col++) {
                if (timelineHeaders[col]) {
                    const cell = rowData.cells[col - 1];
                    let rawNumVal = cell?.value !== undefined ? cell.value : cell;
                    if (rawNumVal && typeof rawNumVal === 'object') {
                        rawNumVal = rawNumVal.result !== undefined ? rawNumVal.result : rawNumVal.text;
                    }
                    let numValue = 0;
                    if (rawNumVal !== undefined && rawNumVal !== null && rawNumVal !== '' && rawNumVal !== '[object Object]') {
                        numValue = parseFloat(String(rawNumVal).replace(/,/g, '')) || 0;
                    }

                    // 組裝成標準扁平化物件
                    recordsToInsert.push({
                        ...fixedFields,
                        [timeline.dbYearField]: timelineHeaders[col].year,
                        [timeline.dbItemField]: timelineHeaders[col].item,
                        [timeline.dbValueField]: numValue
                    });
                }
            }
        }

        if (recordsToInsert.length === 0) {
            return res.json({ success: true, insertedCount: 0, message: "沒有解析出任何有效數據。" });
        }

        // ── STEP 4: 建立動態 MSSQL 連線池並透過 Transaction 批量寫入 ──
        const activePool = await getPool(dbConfig || {});
        
        // 🌟 新增：先至目標資料表抓取真實存在的欄位清單，避免硬塞沒建立的欄位
        const checkColsReq = new sql.Request(activePool);
        let schemaName = 'dbo';
        let tableName = targetTable.trim();
        if (tableName.includes('.')) {
            const parts = tableName.split('.');
            schemaName = parts[0].replace(/[\[\]]/g, '');
            tableName = parts[1].replace(/[\[\]]/g, '');
        }
        checkColsReq.input('schName', sql.NVarChar(128), schemaName);
        checkColsReq.input('tblName', sql.NVarChar(128), tableName);
        const actualColsRes = await checkColsReq.query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = @schName AND TABLE_NAME = @tblName
        `);
        const existingColumns = new Set(actualColsRes.recordset.map(c => c.COLUMN_NAME.toLowerCase()));

        // 如果連資料表基本的欄位都抓不到，拋出明確提示
        if (existingColumns.size === 0) {
            return res.status(400).json({ success: false, message: `找不到目標資料表 [${targetTable}]，請確認是否已建表。` });
        }

        const transaction = new sql.Transaction(activePool);
        await transaction.begin();

        try {
            const now = new Date();
            const timestamp = now.toISOString().replace(/[-T:.Z]/g, "").substring(0, 14);
            const batchNo = `BAT-${timestamp}`;

            for (let i = 0; i < recordsToInsert.length; i++) {
                const record = recordsToInsert[i];
                const reqInsert = new sql.Request(transaction);

                // 🌟 改為動態自適應檢查：目標實體資料表有該欄位才加入 INSERT 指令
                const insertColumns = [];
                const insertValues = [];

                if (existingColumns.has('batch_no')) {
                    insertColumns.push('[batch_no]');
                    insertValues.push('@batch_no');
                    reqInsert.input('batch_no', sql.VarChar(50), batchNo);
                }
                if (existingColumns.has('template_code')) {
                    insertColumns.push('[template_code]');
                    insertValues.push('@template_code');
                    reqInsert.input('template_code', sql.VarChar(50), templateCode);
                }

                // 動態對應範本欄位放入 MSSQL Input
                Object.keys(record).forEach((fieldName, idx) => {
                    // 🌟 核心防護：只有當 MSSQL 真的存在該欄位時才塞入，否則自動跳過防護
                    if (existingColumns.has(fieldName.toLowerCase())) {
                        const paramName = `param_${idx}`;
                        insertColumns.push(`[${fieldName}]`);
                        insertValues.push(`@${paramName}`);

                        if (fieldName === timeline.dbValueField) {
                            reqInsert.input(paramName, sql.Decimal(18, 4), record[fieldName]);
                        } else {
                            reqInsert.input(paramName, sql.NVarChar(sql.MAX), record[fieldName] !== undefined && record[fieldName] !== null ? String(record[fieldName]) : null);
                        }
                    }
                });

                // 防呆：如果完全沒有符合的欄位則不執行
                if (insertColumns.length === 0) continue;

                const queryStr = `
                    INSERT INTO ${targetTable} (${insertColumns.join(', ')})
                    VALUES (${insertValues.join(', ')})
                `;
                await reqInsert.query(queryStr);
            }
            await transaction.commit();

            return res.json({
                success: true,
                batchNo: batchNo,
                insertedCount: recordsToInsert.length,
                message: `成功依據範本 [${templateCode}] 進行解構，已將 ${recordsToInsert.length} 筆明細數據寫入 MSSQL 資料表 [${targetTable}]。`
            });

        } catch (dbErr) {
            await transaction.rollback();
            throw dbErr;
        }

    } catch (err) {
        console.error('❌ 依範本解析匯入 MSSQL 核心崩潰:', err);
        return res.status(500).json({ success: false, error: err.message, message: '寫入目標 MSSQL 資料庫時失敗' });
    }
});

// ==========================================
// 3. SAVE TO DB 主細表聯動儲存路由 (保留預設 MSSQL 連線功能)
// ==========================================
app.post('/api/spreadsheet/save-excel-to-db', async (req, res) => {
    try {
        console.log("📥 Packaging grid data for Master-Detail entry...");
        let incoming = req.body.spreadsheetData || req.body;
        let spreadsheetData = (typeof incoming === 'string') ? JSON.parse(incoming) : incoming;

        const workbook = spreadsheetData?.jsonObject?.Workbook || spreadsheetData?.Workbook;
        if (!workbook || !workbook.sheets || workbook.sheets.length === 0) {
            return res.status(400).json({ message: '無效的試算表資料結構' });
        }
        
        const rows = workbook.sheets[0].rows;
        const now = new Date();
        const timestamp = now.toISOString().replace(/[-T:.Z]/g, "").substring(0, 14);
        const batchNo = `BAT-${timestamp}`;

        // 使用預設 Pool 執行原本儲存邏輯
        const activePool = await getPool();

        if (activePool && rows && rows.length > 0) {
            const transaction = new sql.Transaction(activePool);
            await transaction.begin();

            try {
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    if (!row || !row.cells || row.cells.length === 0) continue;

                    const cmVal = parseCellValue(row.cells[0]?.value || row.cells[0]);
                    const applicationVal = parseCellValue(row.cells[1]?.value || row.cells[1]);
                    const projectVal = parseCellValue(row.cells[2]?.value || row.cells[2]);

                    if (cmVal === '[object Object]' || applicationVal === '[object Object]' || projectVal === '[object Object]') {
                        continue;
                    }

                    if (!cmVal && !applicationVal && !projectVal) continue;
                    if (cmVal.includes('合計') || applicationVal.includes('合計') || projectVal.includes('合計')) continue;
                    if (cmVal === 'CM' && applicationVal === 'Application') continue; 

                    const masterRequest = new sql.Request(transaction);
                    const masterResult = await masterRequest
                        .input('batch_no', sql.VarChar(50), batchNo)
                        .input('cm', sql.NVarChar(100), cmVal ? cmVal.substring(0, 100) : 'Unknown')
                        .input('application', sql.NVarChar(250), applicationVal ? applicationVal.substring(0, 250) : 'Unknown')
                        .input('project', sql.NVarChar(100), projectVal ? projectVal.substring(0, 100) : 'Unknown')
                        .input('created_at', sql.DateTime, now)
                        .input('updated_at', sql.DateTime, now)
                        .query(`
                            INSERT INTO dbo.factory_demand_forecast (batch_no, cm, application, project, created_at, updated_at)
                            OUTPUT INSERTED.id
                            VALUES (@batch_no, @cm, @application, @project, @created_at, @updated_at)
                        `);

                    const forecastId = masterResult.recordset[0].id;

                    const fiscalYearVal = parseCellValue(row.cells[3]?.value || row.cells[3]);   
                    const fontRowItemVal = parseCellValue(row.cells[4]?.value || row.cells[4]); 
                    
                    let rawVal = row.cells[5]?.value !== undefined ? row.cells[5]?.value : row.cells[5];
                    if (rawVal && typeof rawVal === 'object') {
                        rawVal = rawVal.result !== undefined ? rawVal.result : rawVal.text;
                    }
                    let forecastValueVal = 0;
                    if (rawVal !== undefined && rawVal !== null && rawVal !== '' && rawVal !== '[object Object]') {
                        forecastValueVal = parseFloat(String(rawVal).replace(/,/g, '')) || 0;
                    }

                    if (fiscalYearVal !== '' && fiscalYearVal !== '[object Object]' && fiscalYearVal.length <= 10 && fontRowItemVal !== '') {
                        const detailRequest = new sql.Request(transaction);
                        await detailRequest
                            .input('forecast_id', sql.Int, forecastId)
                            .input('fiscal_year', sql.VarChar(10), fiscalYearVal.substring(0, 10))
                            .input('forecast_item', sql.VarChar(20), fontRowItemVal.substring(0, 20))
                            .input('forecast_value', sql.Decimal(18, 4), forecastValueVal)
                            .query(`
                                INSERT INTO dbo.factory_demand_forecast_detail (forecast_id, fiscal_year, forecast_item, forecast_value)
                                VALUES (@forecast_id, @fiscal_year, @forecast_item, @forecast_value)
                            `);
                    }
                }
                await transaction.commit();
            } catch (sqlErr) {
                await transaction.rollback();
                throw sqlErr;
            }
        }

        res.status(200).json({ success: true, batchNo: batchNo, message: "資料已成功解構並寫入資料庫。" });
    } catch (err) {
        res.status(500).json({ error: '寫入本機 MSSQL 發生錯誤', detail: err.message });
    }
});


// ==========================================
// 💡 4. 優化調整：配合前端動態連線與 Modal 自訂規格建表 API (原本的 MSSQL 功能)
// ==========================================
app.post('/api/spreadsheet/check-table', async (req, res) => {
    // 接收前端傳入的 dbHost, dbUser, dbPassword 進階連線憑證
    const { targetTable, fields, host, user, password } = req.body;

    if (!targetTable || !targetTable.trim()) {
        return res.status(400).json({ success: false, message: '請先輸入目標資料庫 Table Name' });
    }

    let schemaName = 'dbo';
    let tableName = targetTable.trim();

    if (tableName.includes('.')) {
        const parts = tableName.split('.');
        schemaName = parts[0];
        tableName = parts[1];
    }

    try {
        // 動態配對或從快取取出特定的 Connection Pool
        const activePool = await getPool({ host, user, password });

        // 1. 參數化安全檢查資料表是否存在
        const checkRequest = new sql.Request(activePool);
        checkRequest.input('schemaName', sql.NVarChar(128), schemaName);
        checkRequest.input('tableName', sql.NVarChar(128), tableName);
        
        const checkResult = await checkRequest.query(`
            SELECT COUNT(*) AS TABLE_COUNT 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_SCHEMA = @schemaName AND TABLE_NAME = @tableName
        `);
        
        const tableExists = checkResult.recordset[0].TABLE_COUNT > 0;

        if (tableExists) {
            return res.json({ 
                success: true, 
                exists: true, 
                message: `資料表 [${schemaName}].[${tableName}] 已經存在於目標系統中。` 
            });
        }

        if (!fields || !Array.isArray(fields) || fields.length === 0) {
            return res.json({ 
                success: true, 
                exists: false, 
                message: `資料表 [${schemaName}].[${tableName}] 目前不存在。` 
            });
        }

        // 3. 欄位去重清洗
        const uniqueFields = [];
        const seen = new Set();
        for (const f of fields) {
            if (f.name && !seen.has(f.name.toLowerCase())) {
                seen.add(f.name.toLowerCase());
                uniqueFields.push(f);
            }
        }

        // 動態拼接欄位規格
        const columnDefinitions = uniqueFields.map(f => {
            const colName = f.name.replace(/[\[\]]/g, ''); 
            let typeStr = f.type;

            if ((f.type === 'varchar' || f.type === 'nvarchar') && f.length) {
                typeStr = `${f.type}(${f.length})`;
            } else if (f.type === 'decimal') {
                typeStr = 'DECIMAL(18, 4)'; 
            }

            const nullStr = f.allowNull ? 'NULL' : 'NOT NULL';
            return `[${colName}] ${typeStr} ${nullStr}`;
        });

        // 4. 執行實體建立表格指令
        const createSql = `
            CREATE TABLE [${schemaName}].[${tableName}] (
                [id] INT IDENTITY(1,1) PRIMARY KEY,
                ${columnDefinitions.join(',\n                ')},
                [created_at] DATETIME DEFAULT GETDATE()
            )
        `;
        
        console.log(`🔨 執行動態客製化建表陳述句:\n${createSql}`);
        const createRequest = new sql.Request(activePool);
        await createRequest.query(createSql);

        return res.status(201).json({ 
            success: true, 
            exists: true, 
            created: true, 
            message: `資料表 [${schemaName}].[${tableName}] 已成功建立！` 
        });

    } catch (err) {
        console.error('❌ 動態建表任務攔截失敗:', err.message);
        res.status(500).json({ success: false, error: err.message, message: '操作 MSSQL 執行核心指令時失敗' });
    }
});


// ==========================================
// 🌟 全新擴充：依據 Table Name 動態取得實體欄位清單 (原本的 MSSQL 功能)
// ==========================================
app.get('/api/spreadsheet/get-table-columns', async (req, res) => {
    // GET 請求從 query 中嘗試獲取主機連線參數
    const { targetTable, host, user, password } = req.query;

    if (!targetTable || !targetTable.trim()) {
        return res.status(400).json({ success: false, message: '未提供目標資料表名稱' });
    }

    let schemaName = 'dbo';
    let tableName = targetTable.trim();

    if (tableName.includes('.')) {
        const parts = tableName.split('.');
        schemaName = parts[0].replace(/[\[\]]/g, '');
        tableName = parts[1].replace(/[\[\]]/g, '');
    }

    try {
        const activePool = await getPool({ host, user, password });

        const colRequest = new sql.Request(activePool);
        colRequest.input('schemaName', sql.NVarChar(128), schemaName);
        colRequest.input('tableName', sql.NVarChar(128), tableName);

        const colResult = await colRequest.query(`
            SELECT COLUMN_NAME AS name, DATA_TYPE AS type
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = @schemaName AND TABLE_NAME = @tableName
            ORDER BY ORDINAL_POSITION
        `);

        if (colResult.recordset.length === 0) {
            return res.json({ success: false, fields: [], message: '找不到該資料表的欄位，請確認表是否存在' });
        }

        return res.json({
            success: true,
            fields: colResult.recordset 
        });

    } catch (err) {
        console.error('❌ 取得資料表欄位失敗:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ==========================================
// 💾 新增重要修改：將前端 Mapping 設計配置真正存入 MongoDB
// DB: excel_import_system, Collection: templates
// ==========================================
app.post('/api/spreadsheet/save-template', async (req, res) => {
    console.log("💾 收到前端打包之 Mapping 設計架構檔：", req.body);
    
    const config = req.body;
    if (!config.templateCode) {
        return res.status(400).json({ success: false, message: "配置檔缺少必要識別碼 templateCode" });
    }

    const client = new MongoClient(mongoUrl);
    try {
        await client.connect();
        const db = client.db(mongoDbName);
        const collection = db.collection('templates'); // 固定存放在 templates 集合中

        // Upsert 邏輯：存在就更新，不存在就自動 Insert
        await collection.updateOne(
            { templateCode: config.templateCode },
            { $set: { ...config, updatedAt: new Date() } },
            { upsert: true }
        );

        return res.json({ 
            success: true, 
            message: `配置範本 [${config.templateCode}] 已成功持久化儲存至 MongoDB [${mongoDbName}].[templates] 資料表中。` 
        });
    } catch (err) {
        console.error("MongoDB save-template Error:", err);
        return res.status(500).json({ success: false, error: err.message, message: "儲存至 MongoDB 失敗" });
    } finally {
        await client.close();
    }
});


// ==========================================
// ⚡ 🌟 全新重要整合：執行實體 Excel 動態轉置並批量寫入 MongoDB (通用解構引擎)
// DB: excel_import_system, Collection: [動態抓取前端傳入的 targetTable]
// ==========================================
app.post('/api/spreadsheet/execute-import', async (req, res) => {
    const config = req.body;
    const { 
        uploadedFilePath, targetTable, dataStartRow, sheetMode, sheetValue, 
        rowHeaders, timeline, skipHeaders 
    } = config;

    if (!uploadedFilePath || !fs.existsSync(uploadedFilePath)) {
        return res.status(400).json({ success: false, message: '伺服器找不到先前上傳的 Excel 檔案實體，請重新上傳。' });
    }

    const client = new MongoClient(mongoUrl);
    try {
        // 1. 利用 exceljs 讀取指定的 Excel 檔案實體
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(uploadedFilePath);
        
        // 判定 worksheet 選擇模式
        const worksheet = sheetMode === 'index' 
            ? workbook.worksheets[Number(sheetValue) - 1] 
            : workbook.getWorksheet(sheetValue);

        if (!worksheet) {
            return res.status(400).json({ success: false, message: `找不到指定的 Sheet 工作表: ${sheetValue}` });
        }

        const startColIdx = letterToColumnIndex(timeline.startColumn);
        const endColIdx = letterToColumnIndex(timeline.endColumn);

        // 2. 橫向解析時間與品項標頭矩陣 (過濾 skipHeaders，如 TTL 等不轉置欄)
        const timelineHeaders = {}; // 格式: { colIdx: { year: 'FY23', item: 'Apr' } }
        for (let col = startColIdx; col <= endColIdx; col++) {
            const yearVal = parseCellValue(worksheet.getRow(timeline.yearRow).getCell(col).value);
            const itemVal = parseCellValue(worksheet.getRow(timeline.itemRow).getCell(col).value);

            // 若符合排除項目則跳過不解開
            if ((skipHeaders || []).includes(itemVal) || (skipHeaders || []).includes(yearVal)) {
                continue;
            }
            if (!itemVal && !yearVal) continue;

            timelineHeaders[col] = { year: yearVal, item: itemVal };
        }

        // 3. 縱向每列遍歷解析 + Grouped 合併儲存格遇空向下沿用快取
        const groupedCache = {};
        const documentsToInsert = []; // 準備塞入 MongoDB 的 BSON 物件陣列
        const totalRows = worksheet.rowCount;
        const startRow = Number(dataStartRow) || 1;

        for (let r = startRow; r <= totalRows; r++) {
            const row = worksheet.getRow(r);
            const fixedFields = {};
            let isRowValid = true;

            // 解析固定維度欄位
            for (const header of rowHeaders) {
                const colIdx = letterToColumnIndex(header.excelColumn);
                let cellValue = parseCellValue(row.getCell(colIdx).value);

                if (header.isGrouped) {
                    if (cellValue !== '') {
                        groupedCache[header.dbFieldName] = cellValue;
                    } else {
                        cellValue = groupedCache[header.dbFieldName] || '';
                    }
                }

                // 檢核：過濾非空
                if (header.filterType === 'not_empty' && !cellValue) {
                    isRowValid = false;
                    break;
                }
                fixedFields[header.dbFieldName] = cellValue;
            }

            if (!isRowValid) continue; // 判定為無效或需過濾之空白列，直接跳出

            // 橫向時間與數值交叉轉置 (Unpivot 核心)
            for (let col = startColIdx; col <= endColIdx; col++) {
                if (timelineHeaders[col]) {
                    const rawNumVal = row.getCell(col).value;
                    let numValue = null;
                    if (rawNumVal !== undefined && rawNumVal !== null && rawNumVal !== '') {
                        // 包含公式結果處理與科學符號清洗
                        const cleanNum = typeof rawNumVal === 'object' ? (rawNumVal.result !== undefined ? rawNumVal.result : rawNumVal.text) : rawNumVal;
                        numValue = parseFloat(String(cleanNum).replace(/,/g, '')) || 0;
                    }

                    // 組裝單筆寫入 MongoDB Document 物件
                    documentsToInsert.push({
                        templateCode: config.templateCode, // 標記來源架構代碼
                        ...fixedFields,
                        [timeline.dbYearField]: timelineHeaders[col].year,
                        [timeline.dbItemField]: timelineHeaders[col].item,
                        [timeline.dbValueField]: numValue,
                        importedAt: new Date()
                    });
                }
            }
        }

        // 4. 使用 insertMany 批量高速寫入 MongoDB 目標集合 (Table)
        let insertedCount = 0;
        const targetCollectionName = targetTable || 'factory_demand_forecast_default';

        if (documentsToInsert.length > 0) {
            await client.connect();
            const db = client.db(mongoDbName);
            const targetCollection = db.collection(targetCollectionName);

            // 執行高性能大量寫入
            const result = await targetCollection.insertMany(documentsToInsert);
            insertedCount = result.insertedCount;
        }

        return res.json({
            success: true,
            insertedCount: insertedCount,
            message: `Excel 實體檔案矩陣解構成功！已將 ${insertedCount} 筆轉置後的明細數據批量寫入 MongoDB [${mongoDbName}].[${targetCollectionName}] 集合中。`
        });

    } catch (err) {
        console.error('❌ 執行試算表解析匯入 MongoDB 發生核心崩潰:', err);
        return res.status(500).json({ success: false, error: err.message, message: '解析或大量寫入 MongoDB 資料庫時失敗' });
    } finally {
        await client.close();
    }
});


app.listen(3000, () => console.log(`🚀 Final Co-exist Data Server running at http://localhost:3000`));