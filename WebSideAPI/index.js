const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const vm = require('vm'); // 🌟 原本的 Node.js 虛擬沙盒模組，完整保留
const url = require('url');
const mongoose = require('mongoose');

// 🌟 多人即時協作與網路核心套件
const http = require('http');
const WebSocket = require('ws');
const Y = require('yjs'); // ✨【核心修正】：把被我漏掉的 Yjs 套件宣告補回來！
const { OAuth2Client } = require('google-auth-library');

// ==========================================
// 📝 MongoDB Connection for Cell Logs
// ==========================================
const MONGODB_URI = 'mongodb://127.0.0.1:27017/excel_cell_logs';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected for cell logs'))
    .catch(err => console.error('❌ MongoDB connection error:', err.message));

const app = express();
const server = http.createServer(app);

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
// ⚡ 🧠 動態資料庫連線池快取管理器 (Dynamic DB Manager)
// ==========================================
const defaultDbConfig = {
    user: 'sa',             
    password: '123456', 
    server: '127.0.0.1',       
    database: 'demodb', 
    options: { encrypt: false, trustServerCertificate: true }
};

const dbConfig = {
    user: 'sa',
    password: '123456',
    server: '127.0.0.1', // or your server IP/instance name
    database: 'epsidemodb',
    options: { encrypt: false, trustServerCertificate: true }
};

const pools = new Map();

let poolInstance = null;
async function getPoolXX() {
    if (poolInstance) {
        return poolInstance;
    }
    try {
        poolInstance = await sql.connect(dbConfig);
        console.log("📦 已成功連線至 MSSQL 資料庫 (epsidemodb)");
        return poolInstance;
    } catch (err) {
        console.error("❌ 資料庫連線失敗:", err);
        poolInstance = null;
        throw err;
    }
}

async function getPool(customConfig = {}) {
    const host = customConfig.host || dbConfig.server;
    const user = customConfig.user || dbConfig.user;
    const password = customConfig.password || dbConfig.password;
    const database = dbConfig.database; 

    const cacheKey = `${host}_${user}_${database}`;

    if (pools.has(cacheKey)) {
        const cachedPool = pools.get(cacheKey);
        if (cachedPool.connected) return cachedPool;
        pools.delete(cacheKey); 
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
// 🧪 共用工具函式
// ==========================================
const fixColorX = (colorObj) => {
    if (!colorObj) return null;
    let argb = colorObj.argb;
    if (argb && argb.length === 8) return `#${argb.slice(2)}`;
    if (argb && argb.length === 6) return `#${argb}`;
    return null;
};

function parseCellValue(cell) {
    if (cell === undefined || cell === null) return '';
    if (typeof cell === 'object') {
        return cell.value !== undefined ? String(cell.value) : (cell.text !== undefined ? String(cell.text) : '');
    }
    return String(cell);
}

function parseCellValueX(cellValue) {
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
// 🌟 擴充新增路由 0-B：動態測試資料庫環境連線狀態
// ==========================================
app.post('/api/spreadsheet/test-connection', async (req, res) => {
    const { host, user, password } = req.body;
    try {
        const testConfig = {
            user: user,
            password: password,
            server: host,
            database: defaultDbConfig.database,
            options: { encrypt: false, trustServerCertificate: true },
            connectTimeout: 5000 
        };
        
        const testPool = new sql.ConnectionPool(testConfig);
        await testPool.connect();
        await testPool.close(); 

        return res.json({ success: true, message: '連線成功！該環境目前狀態健全。' });
    } catch (err) {
        console.error("DB Dynamic Test Connection Failed:", err.message);
        return res.status(200).json({ success: false, message: err.message });
    }
});


// ==========================================
// 1. 高擬真 OPEN 路由
// ==========================================
//const fs = require('fs'); // 確保有引入 fs

function fixColor(colorObj) {
    if (!colorObj) return undefined;
    
    // 如果是 ARGB 格式 (例如 { argb: 'FF0070C0' })
    if (colorObj.argb) {
        let argb = colorObj.argb.toString();
        // 如果帶有 8 碼透明度，取後面 6 碼轉換成 Hex
        if (argb.length === 8) {
            return '#' + argb.substring(2);
        }
        return '#' + argb;
    }
    
    // 如果直接是 hex 屬性
    if (colorObj.hex) {
        return '#' + colorObj.hex;
    }
    
    return undefined;
};

app.post('/api/spreadsheet/open', uploadMemory.single('file'), async (req, res) => {
    console.log("-----------------------------------------");
    console.log("🚀 [DEBUG] 收到請求 URL:", req.url);
    console.log("🚀 [DEBUG] Header Content-Type:", req.headers['content-type']);
    console.log("🚀 [DEBUG] req.file 是否存在:", !!req.file);

    try {
        let fileBuffer;

        // 情況 A：如果是透過檔案上傳
        if (req.file) {
            console.log("🚀 [DEBUG] 檔名:", req.file.originalname, "大小:", req.file.size);
            fileBuffer = req.file.buffer;
        } 
        // 情況 B：如果是透過前端傳送 filePath (例如 C:\Alex\AAA.xlsx)
        else if (req.body && req.body.filePath) {
            const filePath = req.body.filePath;
            console.log("🚀 [DEBUG] 讀取伺服器檔案路徑:", filePath);
            
            if (!fs.existsSync(filePath)) {
                return res.status(400).send("File not found on server path");
            }
            fileBuffer = fs.readFileSync(filePath);
        } 
        else {
            return res.status(400).send("No file uploaded or file path provided");
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(fileBuffer);
        const worksheet = workbook.getWorksheet(1);

        // 🛡️ 決定全域的最大欄位數基準（至少 26 欄，或依工作表實際最大欄位而定）
        const maxColCount = Math.max(worksheet.columnCount || 0, 26);

        let formattedRows = [];
        worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
            let cells = [];
            
            // 🛡️ 改用絕對迴圈讀取每一欄，確保 cells 陣列索引 1 對 1 絕對不會位移
            for (let c = 1; c <= maxColCount; c++) {
                const cell = row.getCell(c);
                const cellObj = {
                    formula: cell.formula ? `=${cell.formula}` : undefined,
                    style: {}
                };

                // 🎨 安全處理：將 richText 陣列合併為純文字字串，避免格式崩潰或出現 [object Object]
                if (cell.value && typeof cell.value === 'object' && Array.isArray(cell.value.richText)) {
                    cellObj.value = cell.value.richText.map(rt => rt.text || '').join('');
                } else {
                    cellObj.value = parseCellValue(cell.value);
                }

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

                cells[c - 1] = cellObj;
            }

            formattedRows[rowNumber - 1] = { cells: cells, height: row.height ? row.height * 1.33 : 20 };
        });

        // 🛡️ 建立對應的欄位寬度陣列
        const columns = [];
        for (let c = 1; c <= maxColCount; c++) {
            const col = worksheet.getColumn(c);
            columns.push({ width: col.width ? col.width * 7 : 64 });
        }

       if (worksheet._merges) {
            Object.values(worksheet._merges).forEach(merge => {
                const { top, left, bottom, right } = merge;
                const masterRow = formattedRows[top - 1];
                if (masterRow && masterRow.cells[left - 1]) {
                    const masterCell = masterRow.cells[left - 1];
                    masterCell.rowSpan = (bottom - top) + 1;
                    masterCell.colSpan = (right - left) + 1;

                    // 🛡️ 確保合併儲存格的每一個子儲存格都有完整的邊框，防止線條缺損
                    for (let r = top; r <= bottom; r++) {
                        for (let c = left; c <= right; c++) {
                            if (formattedRows[r - 1] && formattedRows[r - 1].cells[c - 1]) {
                                const targetCell = formattedRows[r - 1].cells[c - 1];
                                if (!targetCell.style) targetCell.style = {};

                                // 針對合併區塊的邊界補上框線，確保四周與格線完整
                                if (r === top) targetCell.style.borderTop = "1px solid #000000";
                                if (r === bottom) targetCell.style.borderBottom = "1px solid #000000";
                                if (c === left) targetCell.style.borderLeft = "1px solid #000000";
                                if (c === right) targetCell.style.borderRight = "1px solid #000000";

                                // 除了左上角主格保留內容外，其餘被合併涵蓋的格子清空值
                                if (r !== top || c !== left) {
                                    targetCell.value = "";
                                    targetCell.formula = undefined;
                                }
                            }
                        }
                    }
                }
            });
        }

        const result = { Workbook: { sheets: [{ name: worksheet.name, rows: formattedRows, columns: columns }] } };
        console.log("📤 [DEBUG] 準備回傳給前端，JSON 字串長度:", JSON.stringify(result).length);
        res.json({ jsonObject: JSON.stringify(result) });
    } catch (err) { 
        console.error("Open Error:", err);
        res.status(500).send(err.message); 
    }
});

app.post('/api/spreadsheet/openXX', uploadMemory.single('file'), async (req, res) => {
 //  app.post('/api/spreadsheet/open', uploadMemory.single('file'), async (req, res) => {
    // === 只留這一段關鍵 Log ===
    console.log("-----------------------------------------");
    console.log("🚀 [DEBUG] 收到請求 URL:", req.url);
    console.log("🚀 [DEBUG] Header Content-Type:", req.headers['content-type']);
    console.log("🚀 [DEBUG] req.file 是否存在:", !!req.file);
    if (req.file) {
        console.log("🚀 [DEBUG] 檔名:", req.file.originalname, "大小:", req.file.size);
    } else {
        console.log("🚀 [DEBUG] req.body 內容:", JSON.stringify(req.body));
    }
    // ===========================

    try {
        if (!req.file) return res.status(400).send("No file uploaded");
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
        console.log("📤 [DEBUG] 準備回傳給前端，JSON 字串長度:", JSON.stringify(result).length);
        res.json({ jsonObject: JSON.stringify(result) });
    } catch (err) { 
        console.error("Open Error:", err);
        res.status(500).send(err.message); 
    }
});

// ==========================================
// 2. SAVE 匯出 Excel 路由
// ==========================================
app.post('/api/spreadsheet/saveX2', uploadMemory.any(), (req, res) => {
    try {
        const rawData = req.body.JSONData;
        if (!rawData) return res.status(400).send("No data received");

        const fullModel = JSON.parse(rawData);
        const sheet = fullModel.sheets[0];
        if (!sheet || !sheet.rows) return res.status(400).send("No valid sheet found");

        const maxCols = sheet.rows.reduce((max, row) => (row && row.cells) ? Math.max(max, row.cells.length) : max, 0);

        const rowsData = sheet.rows.map((row) => {
            const rowArray = [];
            if (!row || !row.cells) return new Array(maxCols).fill("");
            for (let i = 0; i < maxCols; i++) {
                const cell = row.cells[i];
                rowArray.push(cell ? (cell.value !== undefined ? cell.value : (cell.text || "")) : "");
            }
            return rowArray;
        });

        const worksheet = XLSX.utils.aoa_to_sheet(rowsData);
        const workbook = XLSX.utils.book_new();
        XUtils = XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

        const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=AAA.xlsx');
        res.send(buf);
    } catch (error) {
        res.status(500).send("Server Error");
    }
});

// ==========================================
// 3. SAVE TO DB 主細表聯動儲存路由 (保留預設連線)
// ==========================================
// 新的 API 路由，對應您的真實資料表結構
// 輔助函數：將 Excel 欄位英文字母轉為數字索引 (A -> 0, B -> 1, ..., Z -> 25, AA -> 26, Y -> 24, AX -> 49)
// 輔助函數：將 Excel 欄位英文字母轉為數字索引 (A -> 0, B -> 1, ..., Z -> 25, Y -> 24, AX -> 49)
function excelColToIndex(colStr) {
    if (!colStr) return 0;
    let column = colStr.toUpperCase();
    let result = 0;
    for (let i = 0; i < column.length; i++) {
        result *= 26;
        result += column.charCodeAt(i) - 'A'.charCodeAt(0) + 1;
    }
    return result - 1;
}

app.post('/api/spreadsheet/save-excel-to-db', async (req, res) => {
    try {
        console.log("📥 正在解析試算表（分離 Year 與 Month）並寫入 xlsx2dbqtyl1...");
        
        let incoming = req.body.spreadsheetData || req.body;
        let spreadsheetData = (typeof incoming === 'string') ? JSON.parse(incoming) : incoming;

        const workbook = spreadsheetData?.jsonObject?.Workbook || spreadsheetData?.Workbook;
        if (!workbook || !workbook.sheets || workbook.sheets.length === 0) {
            return res.status(400).json({ message: '無效的試算表資料結構' });
        }
        
        const rows = workbook.sheets[0].rows;
        const rowList = Array.isArray(rows) ? rows : (rows ? Object.values(rows) : []);

        const activePool = await getPool();

        // 1. 讀取 L1 設定
        const l1Result = await activePool.request()
            .input('id', sql.Int, 1)
            .query('SELECT * FROM dbo.xlsx2dbsetL1 WHERE ID = @id');
        const templateL1 = l1Result.recordset[0];
        const rowStartSetting = templateL1?.rowstart !== undefined ? parseInt(templateL1.rowstart, 10) : 1;
        const startIndex = rowStartSetting > 0 ? rowStartSetting - 1 : 0;

        // 2. 讀取 L3 設定 (取得 startcol, endcol, yearrow, itemrow 等)
        const l3Result = await activePool.request().query('SELECT * FROM dbo.xlsx2dbsetL3');
        const settingL3 = l3Result.recordset[0];

        const startColStr = settingL3?.startcol || 'Y';
        const endColStr = settingL3?.endcol || 'AX';
        
        // 假設年份行 (yearrow) 與 項目/月份行 (itemrow)
        const yearRowIdx = (settingL3?.yearrow ? parseInt(settingL3.yearrow, 10) : 1) - 1; 
        const itemRowIdx = (settingL3?.itemrow ? parseInt(settingL3.itemrow, 10) : 2) - 1; 

        const startColIndex = excelColToIndex(startColStr);
        const endColIndex = excelColToIndex(endColStr);

        const transaction = new sql.Transaction(activePool);
        await transaction.begin();

        try {
            let savedCount = 0;
            let currentCustomer = '';
            let currentCategory = '';

            // 用來快照記錄跨欄對應的年份（如果年份是合併儲存格或每隔幾個月出現一次）
            let lastYearVal = '';

            for (let i = startIndex; i < rowList.length; i++) {
                const row = rowList[i];
                if (!row || !row.cells) continue;
                const cells = Array.isArray(row.cells) ? row.cells : Object.values(row.cells);

                const colB = parseCellValue(cells[1]?.value || cells[1]); 
                const colC = parseCellValue(cells[2]?.value || cells[2]); 
                const colD = parseCellValue(cells[3]?.value || cells[3]); 
                const colE = parseCellValue(cells[4]?.value || cells[4]); 

                if (colB && colB !== '[object Object]') currentCustomer = colB;
                if (colC && colC !== '[object Object]') currentCategory = colC;

                const modelVal = (colD && colD !== '[object Object]') ? colD : '';
                const projectVal = (colE && colE !== '[object Object]') ? colE : '';

                if (!currentCustomer && !currentCategory && !modelVal) continue;
                if (currentCategory.includes('合計') || modelVal.includes('合計')) continue;

                for (let colIdx = startColIndex; colIdx <= endColIndex; colIdx++) {
                    const cellData = cells[colIdx];
                    if (!cellData) continue;

                    let rawAmt = cellData.value !== undefined ? cellData.value : cellData;
                    if (rawAmt && typeof rawAmt === 'object') {
                        rawAmt = rawAmt.result !== undefined ? rawAmt.result : rawAmt.text;
                    }
                    
                    const amtvalVal = (rawAmt !== undefined && rawAmt !== null && rawAmt !== '') 
                        ? parseInt(String(rawAmt).replace(/,/g, ''), 10) || 0 
                        : 0;

                    // 有空白或 0 就不寫入
                    if (amtvalVal === 0) continue;

                    // 取得 Year (例如 FY24)
                    let yearVal = '';
                    if (rowList[yearRowIdx] && rowList[yearRowIdx].cells) {
                        const yearCells = Array.isArray(rowList[yearRowIdx].cells) ? rowList[yearRowIdx].cells : Object.values(rowList[yearRowIdx].cells);
                        const val = parseCellValue(yearCells[colIdx]?.value || yearCells[colIdx]);
                        if (val && val.trim() !== '') {
                            yearVal = val;
                            lastYearVal = val; // 記住上一個年份，以防合併儲存格後面幾欄空白
                        } else {
                            yearVal = lastYearVal;
                        }
                    }

                    // 取得 Month (例如 Apr, May)
                    let monthVal = '';
                    if (rowList[itemRowIdx] && rowList[itemRowIdx].cells) {
                        const itemCells = Array.isArray(rowList[itemRowIdx].cells) ? rowList[itemRowIdx].cells : Object.values(rowList[itemRowIdx].cells);
                        monthVal = parseCellValue(itemCells[colIdx]?.value || itemCells[colIdx]);
                    }

                    if (!monthVal || monthVal.trim() === '' || monthVal.startsWith('CQ')) continue; // 略過季總計等非月份欄位

                    // 寫入目標資料表
                    const insertRequest = new sql.Request(transaction);
                    await insertRequest
                        .input('customer', sql.VarChar(16), currentCustomer.substring(0, 16))
                        .input('category', sql.VarChar(32), currentCategory.substring(0, 32))
                        .input('model', sql.VarChar(32), modelVal.substring(0, 32))
                        .input('project', sql.VarChar(8), projectVal.substring(0, 8))
                        .input('Month', sql.VarChar(8), monthVal.substring(0, 8))
                        .input('Year', sql.VarChar(8), yearVal.substring(0, 8))
                        .input('amtval', sql.Int, amtvalVal)
                        .input('sheet', sql.VarChar(16), 'Sheet1')
                        .input('myfile', sql.VarChar(64), templateL1?.filename || 'AAA.xlsx')
                        .query(`
                            INSERT INTO dbo.xlsx2dbqtyl1 (customer, category, model, project, Month, Year, amtval, sheet, myfile)
                            VALUES (@customer, @category, @model, @project, @Month, @Year, @amtval, @sheet, @myfile)
                        `);
                    
                    savedCount++;
                }
            }

            await transaction.commit();
            console.log(`✅ 成功寫入 ${savedCount} 筆資料 (Year 與 Month 已正確分離)`);
            res.status(200).json({ success: true, count: savedCount, message: "資料已成功對應 Year 與 Month 並寫入。" });

        } catch (sqlErr) {
            await transaction.rollback();
            console.error("❌ [SQL Error] 寫入失敗，已回滾:", sqlErr);
            throw sqlErr;
        }

    } catch (err) {
        console.error("💥 [Fatal Route Error]:", err);
        res.status(500).json({ error: '寫入本機 MSSQL 發生錯誤', detail: err.message });
    }
});

app.post('/api/spreadsheet/save-excel-to-dbX', async (req, res) => {
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
// 4. Modal 自訂規格建表 API
// ==========================================
app.post('/api/spreadsheet/check-table', async (req, res) => {
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
        const activePool = await getPool({ host, user, password });

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

        const uniqueFields = [];
        const seen = new Set();
        for (const f of fields) {
            if (f.name && !seen.has(f.name.toLowerCase())) {
                seen.add(f.name.toLowerCase());
                uniqueFields.push(f);
            }
        }

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
// 🌟 依據 Table Name 動態取得實體欄位清單
// ==========================================
app.get('/api/spreadsheet/get-table-columns', async (req, res) => {
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
// 💾 MongoDB 設定檔快取（模擬區塊）
// ==========================================
app.post('/api/spreadsheet/save-template', (req, res) => {
    console.log("💾 後端已收到包含步驟 5 JavaScript 巨集的 Mapping 設計檔：", req.body);
    return res.json({ success: true, message: "同步配置成功！" });
});


// ==========================================
// ⚡ 🌟 重要整合：執行實體 Excel 動態轉置匯入（整合步驟 5 巨集引擎）
// ==========================================
app.post('/api/spreadsheet/execute-import', async (req, res) => {
    const config = req.body;
    const { 
        uploadedFilePath, targetTable, dataStartRow, sheetMode, sheetValue, 
        rowHeaders, timeline, skipHeaders, dbConfig,
        macroScript // 🌟 新增：由前端傳入的自訂 JavaScript 巨集代碼字串
    } = config;

    if (!uploadedFilePath || !fs.existsSync(uploadedFilePath)) {
        return res.status(400).json({ success: false, message: '伺服器找不到先前上傳的 Excel 檔案實體，請重新上傳。' });
    }

    try {
        // 1. 動態建立資料庫連線池
        const activePool = await getPool({
            host: dbConfig?.host,
            user: dbConfig?.user,
            password: dbConfig?.password
        });

        // 2. 利用 exceljs 讀取指定的 Excel 檔案
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(uploadedFilePath);
        
        const worksheet = sheetMode === 'index' 
            ? workbook.worksheets[Number(sheetValue) - 1] 
            : workbook.getWorksheet(sheetValue);

        if (!worksheet) {
            return res.status(400).json({ success: false, message: `找不到指定的 Sheet 工作表: ${sheetValue}` });
        }

        const startColIdx = letterToColumnIndex(timeline.startColumn);
        const endColIdx = letterToColumnIndex(timeline.endColumn);

        // 3. 橫向解析時間標頭矩陣
        const timelineHeaders = {}; 
        for (let col = startColIdx; col <= endColIdx; col++) {
            const yearVal = parseCellValue(worksheet.getRow(timeline.yearRow).getCell(col).value);
            const itemVal = parseCellValue(worksheet.getRow(timeline.itemRow).getCell(col).value);

            if ((skipHeaders || []).includes(itemVal) || (skipHeaders || []).includes(yearVal)) {
                continue;
            }
            if (!itemVal && !yearVal) continue;

            timelineHeaders[col] = { year: yearVal, item: itemVal };
        }

        // 4. 縱向每列遍歷解析 + Grouped 遇空向下沿用快取
        const groupedCache = {};
        let recordsToInsert = []; // 🌟 改用 let，允許巨集整體過濾或重構
        const totalRows = worksheet.rowCount;
        const startRow = Number(dataStartRow) || 1;

        for (let r = startRow; r <= totalRows; r++) {
            const row = worksheet.getRow(r);
            const fixedFields = {};
            let isRowValid = true;

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

                if (header.filterType === 'not_empty' && !cellValue) {
                    isRowValid = false;
                    break;
                }
                fixedFields[header.dbFieldName] = cellValue;
            }

            if (!isRowValid) continue; 

            for (let col = startColIdx; col <= endColIdx; col++) {
                if (timelineHeaders[col]) {
                    const rawNumVal = row.getCell(col).value;
                    let numValue = null;
                    if (rawNumVal !== undefined && rawNumVal !== null && rawNumVal !== '') {
                        const cleanNum = typeof rawNumVal === 'object' ? (rawNumVal.result !== undefined ? rawNumVal.result : rawNumVal.text) : rawNumVal;
                        numValue = parseFloat(String(cleanNum).replace(/,/g, '')) || 0;
                    }

                    recordsToInsert.push({
                        ...fixedFields,
                        [timeline.dbYearField]: timelineHeaders[col].year,
                        [timeline.dbItemField]: timelineHeaders[col].item,
                        [timeline.dbValueField]: numValue
                    });
                }
            }
        }

        // ========================================================
        // 🌟 核心新增：步驟 5 VBA Alternative 巨集處理安全沙盒引擎
        // ========================================================
        if (macroScript && macroScript.trim()) {
            console.log("⚡ 偵測到內嵌自訂 JavaScript 巨集，準備進入沙盒解譯執行...");
            try {
                // 建構沙盒環境上下文，注入解構後的 rows 變數與 console 控制
                const sandbox = {
                    rows: recordsToInsert, // 前端巨集寫 rows.forEach 的操作對象
                    console: {
                        log: (...args) => console.log("[🔮 沙盒日誌]:", ...args),
                        error: (...args) => console.error("[🔮 沙盒錯誤]:", ...args)
                    }
                };
                
                // 建立安全的 Context
                vm.createContext(sandbox);
                
                // 設定 2 秒逾時防呆，防使用者不小心寫出無窮迴圈 (e.g. while(true))
                const script = new vm.Script(macroScript);
                script.runInContext(sandbox, { timeout: 2000 });
                
                // 將沙盒執行完畢後變更的數據重新指派回待寫入陣列
                recordsToInsert = sandbox.rows;
                console.log("🟢 巨集沙盒處理完畢，數據清洗校正成功。");
            } catch (macroErr) {
                console.error("❌ 巨集腳本執行期間發生崩潰，阻擋寫入交易:", macroErr.message);
                return res.status(400).json({ 
                    success: false, 
                    message: `巨集指令執行錯誤，已攔截阻擋寫入。錯誤詳情: ${macroErr.message}` 
                });
            }
        }

        // 5. 使用 MSSQL 進行大量寫入事務 (Transaction Bulk Insert)
        if (recordsToInsert.length === 0) {
            return res.json({ success: true, insertedCount: 0, message: '解析完成（或被巨集過濾空），未發現合規數據列。' });
        }

        const transaction = new sql.Transaction(activePool);
        await transaction.begin();

        try {
            for (const record of recordsToInsert) {
                const reqInsert = new sql.Request(transaction);
                
                let insertColumns = [];
                let insertValues = [];
                
                Object.keys(record).forEach((fieldName, idx) => {
                    const paramName = `param_${idx}`;
                    insertColumns.push(`[${fieldName}]`);
                    insertValues.push(`@${paramName}`);
                    
                    if (fieldName === timeline.dbValueField) {
                        reqInsert.input(paramName, sql.Decimal(18, 4), record[fieldName]);
                    } else {
                        reqInsert.input(paramName, sql.NVarChar(sql.MAX), record[fieldName] ? String(record[fieldName]) : null);
                    }
                });

                const queryStr = `
                    INSERT INTO ${targetTable} (${insertColumns.join(', ')})
                    VALUES (${insertValues.join(', ')})
                `;
                await reqInsert.query(queryStr);
            }
            await transaction.commit();

            return res.json({
                success: true,
                insertedCount: recordsToInsert.length,
                message: `成功讀取 Excel 進行矩陣解構與巨集清洗，已將 ${recordsToInsert.length} 筆明細數據寫入資料表 [${targetTable}]。`
            });

        } catch (dbErr) {
            await transaction.rollback();
            throw dbErr;
        }

    } catch (err) {
        console.error('❌ 執行試算表解析匯入發生核心崩潰:', err);
        return res.status(500).json({ success: false, error: err.message, message: '解析或寫入目標 MSSQL 資料庫時失敗' });
    }
});


// ========================================================
// 🌟 【新增安全區】：Google ID Token 安全簽章驗證器
// ========================================================
async function verifyGoogleToken(token) {
    try {
        const ticket = await oAuth2Client.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        return { success: true, payload }; // 解出身分資訊：email, name, picture
    } catch (err) {
        console.error("❌ Google ID Token 驗證拒絕:", err.message);
        return { success: false, error: err.message };
    }
}


const wss = new WebSocket.Server({ noServer: true });

// 在 server.on('upgrade') 時，必須支援帶有 query string 的路徑比對
server.on('upgrade', (request, socket, head) => {
  const { pathname, query } = url.parse(request.url, true);
  
  // 🔴 注意：比對路徑時，不能直接用 request.url === '/excel-room-...' 
  // 必須用 pathname 來比對，否則帶了 ?auth_token 欄位後會比對失敗而 404！
  if (pathname.startsWith('/excel-room-')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// 🎯 解決前端 get-templates 404 錯誤的關鍵路由
app.get('/api/spreadsheet/get-templates', (req, res) => {
    console.log("📂 前端正在請求試算表模板清單...");
    // 先回傳一個空陣列，確保前端不會因為 404 報錯而卡死
    res.json([]); 
});

app.get('/api/user/profile', (req, res) => {
    // 這取決於你的 AD 驗證方式，通常是從 Header 或 Session 取得
    // 範例：若使用 Windows Authentication
    const userId = req.headers['x-remote-user'] || 'Guest_User';
    res.json({ id: userId });
});

// ==========================================
// 📋 取得所有範本及對應的 L2 欄位設定
// ==========================================
app.get('/api/xlsx2dbsetL1', async (req, res) => {
  try {
    // 1. 取得預設或指定的資料庫連線池 (對應你的 pools 架構)
    let pool = pools.get('default');
    if (!pool) {
      pool = await new sql.ConnectionPool(dbConfig).connect();
      pools.set('default', pool);
    }

    // 2. 查詢主範本資料表 (xlsx2dbsetL1)
    const templateResult = await pool.request().query('SELECT * FROM xlsx2dbsetL1');
    const templates = templateResult.recordset;

    // 3. 逐一撈取每個範本對應的 L2 (xlsx2dbsetL2) 與 L3 (xlsx2dbsetL3) 設定
    const detailedTemplates = await Promise.all(templates.map(async (t) => {
      // 3.1 查詢 L2 欄位對應設定
      const l2Result = await pool.request()
        .input('templateId', sql.Int, t.ID)
        .query('SELECT col AS excelColumn, field AS dbFieldName, space, [regexp] AS filterExpression FROM xlsx2dbsetL2 WHERE ID = @templateId');
      
      const l2Rows = l2Result.recordset;

      // 3.2 查詢 L3 範本 metadata 設定 (xlsx2dbsetL3)
      const l3Result = await pool.request()
        .input('templateId', sql.Int, t.ID)
        .query('SELECT startcol, endcol, yearrow, itemrow, skipspace FROM xlsx2dbsetL3 WHERE ID = @templateId');
      
      // 假設 L3 對應單一筆記錄或取第一筆，若無則給預設值
      const l3Row = l3Result.recordset[0] || {
        startcol: 1,
        endcol: 10,
        yearrow: 1,
        itemrow: 2,
        skipspace: 0
      };

      return {
        ...t,
        // 對應前端需要的 rowHeaders 結構 (L2)
        rowHeaders: l2Rows.map((row, index) => ({
          id: String(index + 1),
          excelColumn: row.excelColumn || '',
          dbFieldName: row.dbFieldName || '',
          isGrouped: row.space === 1,
          filterType: row.filterExpression ? 'regex' : 'none',
          filterExpression: row.filterExpression || ''
        })),
        // 對應前端 Step 4 的 L3 座標與對應設定
        l3Settings: {
          startCol: l3Row.startcol,
          endCol: l3Row.endcol,
          yearRow: l3Row.yearrow,
          itemRow: l3Row.itemrow,
          skipSpace: l3Row.skipspace
        }
      };
    }));

    res.json(detailedTemplates);
  } catch (err) {
    console.error('❌ 讀取 xlsx2dbsetL1 失敗:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});


// ==========================================
// 📋 取得指定資料表的所有欄位名稱 (請確認這段程式碼存在於 port 3000 的 Express 檔案中)
// ==========================================
app.get('/api/table-columns', async (req, res) => {
  const tableName = req.query.table;
  if (!tableName) {
    return res.status(400).json({ success: false, message: 'Table name is required' });
  }

  try {
    let pool = pools.get('default');
    if (!pool) {
      pool = await new sql.ConnectionPool(dbConfig).connect();
      pools.set('default', pool);
    }

    const result = await pool.request()
      .input('tableName', sql.VarChar, tableName)
      .query(`
        SELECT COLUMN_NAME as name, DATA_TYPE as type 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = @tableName
        ORDER BY ORDINAL_POSITION;
      `);

    // This now sends an array of objects: [{ name: 'Col1', type: 'int' }, ...]
    res.json({ success: true, columns: result.recordset });
  } catch (err) {
    console.error('❌ 取得資料庫欄位失敗:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 📝 Cell Modification Logging Endpoint (MongoDB)
// ==========================================

// Define schema for cell logs
const cellLogSchema = new mongoose.Schema({
    cellAddress: { type: String, required: true },
    oldValue: { type: String, default: null },
    newValue: { type: String, default: null },
    user: { type: String, default: 'anonymous' },
    timestamp: { type: Date, default: Date.now },
    reason: { type: String, default: null }
}, { timestamps: true });

// Cache for dynamic models (one per collection)
const cellLogModels = new Map();

// Helper to get collection name: templateCode_YYYYMMDD
function getCellLogCollectionName(templateCode) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    const safeTemplateCode = (templateCode || 'unknown').replace(/[^a-zA-Z0-9_]/g, '_');
    return `${safeTemplateCode}_${dateStr}`;
}

// Helper to get or create model for a collection
function getCellLogModel(collectionName) {
    if (cellLogModels.has(collectionName)) {
        return cellLogModels.get(collectionName);
    }
    const model = mongoose.model(collectionName, cellLogSchema, collectionName);
    cellLogModels.set(collectionName, model);
    return model;
}

app.post('/api/spreadsheet/log-cell-change', async (req, res) => {
    const { templateCode, cellAddress, oldValue, newValue, user, timestamp, reason } = req.body;

    if (!cellAddress) {
        return res.status(400).json({ success: false, message: 'Cell address is required' });
    }

    try {
        const collectionName = getCellLogCollectionName(templateCode);
        const CellLogModel = getCellLogModel(collectionName);

        const logEntry = new CellLogModel({
            cellAddress,
            oldValue: oldValue !== undefined ? oldValue : null,
            newValue: newValue !== undefined ? newValue : null,
            user: user || 'anonymous',
            timestamp: timestamp ? new Date(timestamp) : new Date(),
            reason: reason || null
        });

        await logEntry.save();

        console.log(`📝 [Cell Log → ${collectionName}] ${logEntry.user} modified ${logEntry.cellAddress}: "${logEntry.oldValue}" → "${logEntry.newValue}"${logEntry.reason ? ` | Reason: ${logEntry.reason}` : ''}`);

        return res.json({ success: true, logId: logEntry._id, collection: collectionName });
    } catch (err) {
        console.error('❌ Failed to save cell log to MongoDB:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// Get cell modification logs (from MongoDB)
app.get('/api/spreadsheet/cell-logs', async (req, res) => {
    const { templateCode, date, limit = 100 } = req.query;

    try {
        // If date is provided, use it; otherwise use today
        let collectionName;
        if (date) {
            // date format: YYYYMMDD
            const safeTemplateCode = (templateCode || 'unknown').replace(/[^a-zA-Z0-9_]/g, '_');
            collectionName = `${safeTemplateCode}_${date}`;
        } else {
            collectionName = getCellLogCollectionName(templateCode);
        }

        // Check if collection exists
        const collections = await mongoose.connection.db.listCollections({ name: collectionName }).toArray();
        if (collections.length === 0) {
            return res.json({ success: true, logs: [], total: 0, collection: collectionName, message: 'Collection not found' });
        }

        const CellLogModel = getCellLogModel(collectionName);
        const logs = await CellLogModel.find()
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .lean();

        const total = await CellLogModel.countDocuments();

        return res.json({ success: true, logs, total, collection: collectionName });
    } catch (err) {
        console.error('❌ Failed to fetch cell logs from MongoDB:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// List all cell log collections
app.get('/api/spreadsheet/cell-log-collections', async (req, res) => {
    try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        const cellLogCollections = collections
            .map(c => c.name)
            .filter(name => /^[a-zA-Z0-9_]+_\d{8}$/.test(name))
            .sort()
            .reverse();

        return res.json({ success: true, collections: cellLogCollections });
    } catch (err) {
        console.error('❌ Failed to list collections:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// 🌟 伺服器啟動監聯
server.listen(3000, () => {
    console.log(`🚀 Final Data Server running at http://localhost:3000`);
});