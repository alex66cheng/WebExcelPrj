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
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

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
// 🔐 Auth (cloud build: Google OAuth)
// ==========================================
// Same Google OAuth Client ID already used by the frontend (see
// my-app-pt1/src/config/googleAuth.ts) — https://console.cloud.google.com/apis/credentials
const GOOGLE_CLIENT_ID = '414351508100-t8tgkajnjoafpjvs59v28vot4cced8r4.apps.googleusercontent.com';
const JWT_SECRET = 'webexcelprj-cloud-jwt-secret-change-me';

// Every /api/* route requires a valid session JWT except the sign-in/sign-up
// endpoints themselves (there's no session yet at the point a client calls them).
const PUBLIC_AUTH_PATHS = new Set(['/auth/google', '/auth/register', '/auth/login']);
app.use('/api', (req, res, next) => {
    if (PUBLIC_AUTH_PATHS.has(req.path)) return next();

    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
        return res.status(401).json({ success: false, message: '未登入或缺少驗證權杖' });
    }
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: '權杖無效或已過期' });
    }
});

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
// 📚 Excel 檔案池 (Excel File Pool)
//    實體目錄：專案根目錄下的 Excels/
//    提供上傳、清單、下載、刪除四支 API 給 Like Excel List 頁面使用
// ==========================================
const excelPoolDirectory = path.join(__dirname, '..', 'Excels');
if (!fs.existsSync(excelPoolDirectory)) {
    fs.mkdirSync(excelPoolDirectory, { recursive: true });
}

const ALLOWED_EXCEL_EXT = ['.xlsx', '.xls', '.xlsm', '.xlsb', '.csv'];
// ExcelJS 只讀得懂 OOXML 格式，舊版 .xls / .xlsb / .csv 無法在線上編輯器開啟
const EDITABLE_EXCEL_EXT = ['xlsx', 'xlsm'];

// 瀏覽器的 multipart 檔名為 UTF-8，但 busboy 預設以 latin1 解讀，
// 中文檔名會變亂碼，這裡把它還原回來。
function decodeOriginalName(name) {
    try {
        const decoded = Buffer.from(name, 'latin1').toString('utf8');
        return decoded.includes('�') ? name : decoded;
    } catch (e) {
        return name;
    }
}

// 🔒 每個使用者只能看到/操作自己的檔案池：以登入者 email 為鍵，各自獨立一個子目錄
function safeUserDirName(email) {
    const normalized = String(email || '').toLowerCase().trim();
    const safe = normalized.replace(/[^a-z0-9._@-]/g, '_');
    return safe || 'unknown';
}

function getUserPoolDir(email) {
    const dir = path.join(excelPoolDirectory, safeUserDirName(email));
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

// 防止 ../ 路徑穿越，且只允許存取「該使用者自己」檔案池目錄下的檔案
function resolvePoolFile(userDir, fileName) {
    const safeName = path.basename(String(fileName || ''));
    if (!safeName || safeName === '.' || safeName === '..') return null;
    const fullPath = path.join(userDir, safeName);
    if (path.dirname(fullPath) !== userDir) return null;
    return fullPath;
}

// 同名檔案不覆蓋，改以 "檔名 (2).xlsx" 方式遞增（僅在該使用者自己的目錄內比對）
function uniquePoolName(userDir, originalName) {
    const safeName = path.basename(decodeOriginalName(originalName)).replace(/[\\/:*?"<>|]/g, '_');
    const ext = path.extname(safeName);
    const base = path.basename(safeName, ext);
    let candidate = `${base}${ext}`;
    let counter = 2;
    while (fs.existsSync(path.join(userDir, candidate))) {
        candidate = `${base} (${counter})${ext}`;
        counter++;
    }
    return candidate;
}

const poolStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        try {
            cb(null, getUserPoolDir(req.user && req.user.email));
        } catch (err) {
            cb(err);
        }
    },
    filename: function (req, file, cb) {
        cb(null, uniquePoolName(getUserPoolDir(req.user && req.user.email), file.originalname));
    }
});

const uploadPool = multer({
    storage: poolStorage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        const ext = path.extname(decodeOriginalName(file.originalname)).toLowerCase();
        if (!ALLOWED_EXCEL_EXT.includes(ext)) {
            return cb(new Error(`不支援的檔案格式 ${ext}，僅接受 ${ALLOWED_EXCEL_EXT.join(' / ')}`));
        }
        cb(null, true);
    }
});

// ------------------------------------------
// 🏷️ 檔案顯示名稱 (Display Name) 中繼資料
//    以 JSON 檔保存 { 實體檔名: { displayName, updatedAt } }，
//    與實體檔名脫鉤，改名不影響下載網址與既有匯入流程。
// ------------------------------------------
function poolMetaFile(userDir) {
    return path.join(userDir, '.pool-meta.json');
}

function readPoolMeta(userDir) {
    try {
        const metaFile = poolMetaFile(userDir);
        if (!fs.existsSync(metaFile)) return {};
        return JSON.parse(fs.readFileSync(metaFile, 'utf8')) || {};
    } catch (err) {
        console.error('⚠️ 讀取檔案池中繼資料失敗，改以空白設定繼續:', err.message);
        return {};
    }
}

function writePoolMeta(userDir, meta) {
    fs.writeFileSync(poolMetaFile(userDir), JSON.stringify(meta, null, 2), 'utf8');
}

// 沒有自訂名稱時，預設顯示為「去掉副檔名的檔名」
function defaultDisplayName(fileName) {
    return path.basename(fileName, path.extname(fileName));
}

// ------------------------------------------
// 🤝 邀請他人共同編輯檔案池中的檔案
//    以 MongoDB 記錄「誰的哪個檔案，邀請了哪個 email」，不搬動實體檔案，
//    被邀請者存取時直接讀寫擁有者的檔案池目錄。
// ------------------------------------------
const fileShareSchema = new mongoose.Schema({
    ownerEmail: { type: String, required: true, lowercase: true, trim: true },
    fileName: { type: String, required: true },
    invitedEmail: { type: String, required: true, lowercase: true, trim: true },
}, { timestamps: true });
fileShareSchema.index({ ownerEmail: 1, fileName: 1, invitedEmail: 1 }, { unique: true });
const FileShare = mongoose.model('FileShare', fileShareSchema, 'file_shares');

// 依 req.user + (query/body 帶入的) owner，解析出實際可存取的檔案路徑：
// - 沒帶 owner，或 owner 就是自己 → 存取自己的檔案池
// - owner 是別人 → 必須有一筆對應的邀請紀錄才允許存取，讀寫都落在「擁有者」的目錄下
async function resolvePoolFileAccess(req, fileName) {
    const requesterEmail = String(req.user.email || '').toLowerCase().trim();
    const ownerParam = String((req.query && req.query.owner) || (req.body && req.body.owner) || '').toLowerCase().trim();
    const ownerEmail = ownerParam || requesterEmail;

    if (ownerEmail !== requesterEmail) {
        const share = await FileShare.findOne({ ownerEmail, fileName: path.basename(String(fileName || '')), invitedEmail: requesterEmail });
        if (!share) return null;
    }

    const userDir = getUserPoolDir(ownerEmail);
    const fullPath = resolvePoolFile(userDir, fileName);
    if (!fullPath || !fs.existsSync(fullPath)) return null;
    return { fullPath, userDir, ownerEmail, isOwner: ownerEmail === requesterEmail };
}

// 上傳一個或多個 Excel 檔案進檔案池
app.post('/api/excel-pool/upload', (req, res) => {
    uploadPool.array('files', 20)(req, res, (err) => {
        if (err) {
            console.error('❌ Excel Pool 上傳失敗:', err.message);
            return res.status(400).json({ success: false, message: err.message });
        }
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: '未偵測到上傳檔案' });
        }
        const saved = req.files.map(f => ({
            fileName: f.filename,
            originalName: decodeOriginalName(f.originalname),
            size: f.size
        }));
        console.log(`💾 已存入 Excel 檔案池 (${saved.length} 筆):`, saved.map(s => s.fileName).join(', '));
        return res.json({ success: true, message: `成功上傳 ${saved.length} 個檔案`, files: saved });
    });
});

// 取得檔案池內所有 Excel 檔案清單（僅限自己上傳的檔案）
app.get('/api/excel-pool/list', (req, res) => {
    try {
        const userDir = getUserPoolDir(req.user.email);
        const meta = readPoolMeta(userDir);
        const files = fs.readdirSync(userDir)
            .filter(name => ALLOWED_EXCEL_EXT.includes(path.extname(name).toLowerCase()))
            .map(name => {
                const stat = fs.statSync(path.join(userDir, name));
                const ext = path.extname(name).toLowerCase().replace('.', '');
                return {
                    fileName: name,
                    displayName: (meta[name] && meta[name].displayName) || defaultDisplayName(name),
                    ext: ext,
                    editable: EDITABLE_EXCEL_EXT.includes(ext), // 僅 OOXML 格式可於線上編輯器開啟
                    size: stat.size,
                    uploadedAt: stat.mtime.toISOString()
                };
            })
            .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

        return res.json({ success: true, count: files.length, files });
    } catch (err) {
        console.error('❌ 讀取 Excel 檔案池失敗:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// 修改單一檔案的顯示名稱 / 別名 (不更動實體檔名)
app.patch('/api/excel-pool/:fileName/name', (req, res) => {
    const userDir = getUserPoolDir(req.user.email);
    const fullPath = resolvePoolFile(userDir, req.params.fileName);
    if (!fullPath || !fs.existsSync(fullPath)) {
        return res.status(404).json({ success: false, message: '找不到指定檔案' });
    }

    const displayName = String((req.body && req.body.displayName) || '').trim();
    if (!displayName) {
        return res.status(400).json({ success: false, message: '名稱不可空白' });
    }
    if (displayName.length > 120) {
        return res.status(400).json({ success: false, message: '名稱長度不可超過 120 個字元' });
    }

    try {
        const fileName = path.basename(fullPath);
        const meta = readPoolMeta(userDir);
        meta[fileName] = { displayName, updatedAt: new Date().toISOString() };
        writePoolMeta(userDir, meta);
        console.log(`🏷️ 已更新檔案顯示名稱: ${fileName} → ${displayName}`);
        return res.json({ success: true, message: '名稱已更新', fileName, displayName });
    } catch (err) {
        console.error('❌ 更新檔案顯示名稱失敗:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// 開啟檔案池中的檔案，轉成 Syncfusion Spreadsheet 可載入的 JSON
app.get('/api/excel-pool/open/:fileName', async (req, res) => {
    const access = await resolvePoolFileAccess(req, req.params.fileName);
    if (!access) {
        return res.status(404).json({ success: false, message: '找不到指定檔案，或您沒有此檔案的存取權限' });
    }
    const { fullPath, userDir } = access;

    const fileName = path.basename(fullPath);
    const ext = path.extname(fileName).toLowerCase().replace('.', '');
    if (!EDITABLE_EXCEL_EXT.includes(ext)) {
        return res.status(400).json({
            success: false,
            message: `.${ext} 格式無法於線上編輯器開啟，請先下載並另存為 .xlsx 後再上傳`
        });
    }

    try {
        const { result, sheetCount, sheetNames } = await excelBufferToSpreadsheetJson(fs.readFileSync(fullPath));
        const meta = readPoolMeta(userDir);
        console.log(`📖 已開啟檔案池檔案: ${fileName} (共 ${sheetCount} 個工作表)`);
        return res.json({
            success: true,
            fileName,
            displayName: (meta[fileName] && meta[fileName].displayName) || defaultDisplayName(fileName),
            sheetCount,
            sheetNames,
            // 線上編輯器只載入第一個工作表，因此只有「單一工作表的 .xlsx」覆蓋回存才不會遺失內容
            canOverwrite: ext === 'xlsx' && sheetCount === 1,
            jsonObject: JSON.stringify(result)
        });
    } catch (err) {
        console.error('❌ 開啟檔案池檔案失敗:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// ------------------------------------------
// 💾 將 Syncfusion Spreadsheet JSON 還原為 ExcelJS 活頁簿 (保留基本樣式)
// ------------------------------------------
function spreadsheetJsonToWorkbook(workbookJson, sheetName) {
    const workbook = new ExcelJS.Workbook();
    const sourceSheet = (workbookJson.sheets && workbookJson.sheets[0]) || {};
    const worksheet = workbook.addWorksheet(sheetName || sourceSheet.name || 'Sheet1');

    const sourceRows = Array.isArray(sourceSheet.rows) ? sourceSheet.rows : Object.values(sourceSheet.rows || {});
    const merges = [];

    sourceRows.forEach((row, rowIdx) => {
        if (!row) return;
        const targetRow = worksheet.getRow(rowIdx + 1);
        if (row.height) targetRow.height = row.height / 1.33;

        const cells = Array.isArray(row.cells) ? row.cells : Object.values(row.cells || {});
        cells.forEach((cell, colIdx) => {
            if (!cell) return;
            const targetCell = targetRow.getCell(colIdx + 1);

            // 值：公式優先，數字字串還原為數值，避免回寫後全部變成文字
            if (cell.formula) {
                targetCell.value = { formula: String(cell.formula).replace(/^=/, '') };
            } else if (cell.value !== undefined && cell.value !== null && cell.value !== '') {
                const raw = cell.value;
                const asNumber = Number(raw);
                targetCell.value = (typeof raw !== 'boolean' && String(raw).trim() !== '' && !Number.isNaN(asNumber))
                    ? asNumber
                    : raw;
            }

            const style = cell.style || {};
            const font = {};
            if (style.fontWeight === 'bold') font.bold = true;
            if (style.fontStyle === 'italic') font.italic = true;
            if (style.fontSize) font.size = parseFloat(style.fontSize);
            if (style.color) font.color = { argb: `FF${String(style.color).replace('#', '')}` };
            if (Object.keys(font).length > 0) targetCell.font = font;

            if (style.backgroundColor) {
                targetCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: `FF${String(style.backgroundColor).replace('#', '')}` }
                };
            }

            const alignment = {};
            if (style.textAlign) alignment.horizontal = style.textAlign;
            if (style.verticalAlign) alignment.vertical = style.verticalAlign;
            if (style.wrap) alignment.wrapText = true;
            if (Object.keys(alignment).length > 0) targetCell.alignment = alignment;

            const border = {};
            ['Top', 'Bottom', 'Left', 'Right'].forEach(side => {
                if (style[`border${side}`]) border[side.toLowerCase()] = { style: 'thin', color: { argb: 'FF000000' } };
            });
            if (Object.keys(border).length > 0) targetCell.border = border;

            // 合併儲存格：以 rowSpan / colSpan 還原
            const rowSpan = cell.rowSpan || 1;
            const colSpan = cell.colSpan || 1;
            if (rowSpan > 1 || colSpan > 1) {
                merges.push([rowIdx + 1, colIdx + 1, rowIdx + rowSpan - 1, colIdx + colSpan]);
            }
        });
        targetRow.commit();
    });

    const sourceColumns = Array.isArray(sourceSheet.columns) ? sourceSheet.columns : [];
    sourceColumns.forEach((col, idx) => {
        if (col && col.width) worksheet.getColumn(idx + 1).width = col.width / 7;
    });

    merges.forEach(range => {
        try {
            worksheet.mergeCells(range[0], range[1], range[2], range[3]);
        } catch (e) {
            // 重疊或無效的合併範圍直接略過，不中斷整份檔案的回存
        }
    });

    return workbook;
}

// 將線上編輯器的內容回存至檔案池 (覆蓋原檔或另存新檔)
app.post('/api/excel-pool/save', async (req, res) => {
    const { fileName, mode, spreadsheetData } = req.body || {};
    const access = await resolvePoolFileAccess(req, fileName);
    if (!access) {
        return res.status(404).json({ success: false, message: '找不到來源檔案，或您沒有此檔案的存取權限' });
    }
    const { fullPath, userDir } = access;

    const workbookJson = spreadsheetData && (spreadsheetData.Workbook || spreadsheetData);
    if (!workbookJson || !workbookJson.sheets || workbookJson.sheets.length === 0) {
        return res.status(400).json({ success: false, message: '無效的試算表資料結構' });
    }

    const sourceName = path.basename(fullPath);
    const ext = path.extname(sourceName).toLowerCase();

    try {
        let targetName = sourceName;

        if (mode === 'overwrite') {
            // 編輯器只載入第一個工作表，覆蓋多工作表或含巨集的檔案會造成內容遺失，因此擋下
            if (ext !== '.xlsx') {
                return res.status(400).json({
                    success: false,
                    message: `${ext} 檔案不支援覆蓋回存 (會遺失巨集或原始格式)，請改用另存新檔`
                });
            }
            const existing = new ExcelJS.Workbook();
            await existing.xlsx.readFile(fullPath);
            if (existing.worksheets.length > 1) {
                return res.status(400).json({
                    success: false,
                    message: `原檔含 ${existing.worksheets.length} 個工作表，但編輯器只載入第一個，覆蓋會遺失其餘工作表，請改用另存新檔`
                });
            }
        } else {
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
            targetName = uniquePoolName(userDir, `${path.basename(sourceName, ext)} (編輯 ${stamp}).xlsx`);
        }

        const workbook = spreadsheetJsonToWorkbook(workbookJson, workbookJson.sheets[0].name);
        await workbook.xlsx.writeFile(path.join(userDir, targetName));

        // 另存新檔時，沿用原檔的別名作為新檔別名的基礎
        if (targetName !== sourceName) {
            const meta = readPoolMeta(userDir);
            const baseName = (meta[sourceName] && meta[sourceName].displayName) || defaultDisplayName(sourceName);
            meta[targetName] = { displayName: `${baseName} (編輯版)`, updatedAt: new Date().toISOString() };
            writePoolMeta(userDir, meta);
        }

        console.log(`💾 編輯內容已回存至檔案池: ${targetName} (mode=${mode || 'new'})`);
        return res.json({
            success: true,
            message: mode === 'overwrite' ? '已覆蓋原檔' : `已另存為「${targetName}」`,
            fileName: targetName
        });
    } catch (err) {
        console.error('❌ 回存檔案池失敗:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// 下載 / 開啟檔案池中的單一檔案
app.get('/api/excel-pool/download/:fileName', async (req, res) => {
    const access = await resolvePoolFileAccess(req, req.params.fileName);
    if (!access) {
        return res.status(404).json({ success: false, message: '找不到指定檔案，或您沒有此檔案的存取權限' });
    }
    return res.download(access.fullPath, path.basename(access.fullPath));
});

// 從檔案池刪除單一檔案
app.delete('/api/excel-pool/:fileName', (req, res) => {
    const userDir = getUserPoolDir(req.user.email);
    const fullPath = resolvePoolFile(userDir, req.params.fileName);
    if (!fullPath || !fs.existsSync(fullPath)) {
        return res.status(404).json({ success: false, message: '找不到指定檔案' });
    }
    try {
        const fileName = path.basename(fullPath);
        fs.unlinkSync(fullPath);

        // 一併清掉別名設定，避免同名檔案重新上傳時沿用到舊別名
        const meta = readPoolMeta(userDir);
        if (meta[fileName]) {
            delete meta[fileName];
            writePoolMeta(userDir, meta);
        }
        console.log(`🗑️ 已從 Excel 檔案池刪除: ${fileName}`);
        return res.json({ success: true, message: '檔案已刪除' });
    } catch (err) {
        console.error('❌ 刪除檔案失敗:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// 邀請他人共同編輯檔案池中的某個檔案（僅擁有者本人可邀請）
app.post('/api/excel-pool/:fileName/invite', async (req, res) => {
    const ownerEmail = String(req.user.email || '').toLowerCase().trim();
    const userDir = getUserPoolDir(ownerEmail);
    const fullPath = resolvePoolFile(userDir, req.params.fileName);
    if (!fullPath || !fs.existsSync(fullPath)) {
        return res.status(404).json({ success: false, message: '找不到指定檔案' });
    }

    const invitedEmail = String((req.body && req.body.email) || '').toLowerCase().trim();
    if (!invitedEmail || !invitedEmail.includes('@')) {
        return res.status(400).json({ success: false, message: '請提供有效的 email' });
    }
    if (invitedEmail === ownerEmail) {
        return res.status(400).json({ success: false, message: '不能邀請自己' });
    }

    try {
        const fileName = path.basename(fullPath);
        await FileShare.findOneAndUpdate(
            { ownerEmail, fileName, invitedEmail },
            { ownerEmail, fileName, invitedEmail },
            { upsert: true, returnDocument: 'after' }
        );
        console.log(`🤝 已邀請 ${invitedEmail} 共同編輯 ${fileName} (擁有者: ${ownerEmail})`);
        return res.json({ success: true, message: `已邀請 ${invitedEmail} 共同編輯`, fileName, invitedEmail });
    } catch (err) {
        console.error('❌ 邀請共同編輯失敗:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// 取得單一檔案目前已邀請的共同編輯者名單
// 擁有者本人，或已被邀請的共同編輯者（帶 ?owner= 查詢），都可以查看這份名單，
// 藉此在畫面上顯示「這份檔案有哪些人可以共同編輯」；邀請/取消邀請仍僅限擁有者本人操作。
app.get('/api/excel-pool/:fileName/shares', async (req, res) => {
    const access = await resolvePoolFileAccess(req, req.params.fileName);
    if (!access) {
        return res.status(404).json({ success: false, message: '找不到指定檔案，或您沒有此檔案的存取權限' });
    }
    try {
        const fileName = path.basename(access.fullPath);
        const shares = await FileShare.find({ ownerEmail: access.ownerEmail, fileName }).sort({ createdAt: 1 });
        return res.json({
            success: true,
            fileName,
            ownerEmail: access.ownerEmail,
            invitedEmails: shares.map(s => s.invitedEmail)
        });
    } catch (err) {
        console.error('❌ 讀取共同編輯名單失敗:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// 取消某人共同編輯的權限（僅擁有者本人可取消）
app.delete('/api/excel-pool/:fileName/invite/:email', async (req, res) => {
    const ownerEmail = String(req.user.email || '').toLowerCase().trim();
    const userDir = getUserPoolDir(ownerEmail);
    const fullPath = resolvePoolFile(userDir, req.params.fileName);
    if (!fullPath || !fs.existsSync(fullPath)) {
        return res.status(404).json({ success: false, message: '找不到指定檔案' });
    }
    try {
        const fileName = path.basename(fullPath);
        const invitedEmail = String(req.params.email || '').toLowerCase().trim();
        await FileShare.deleteOne({ ownerEmail, fileName, invitedEmail });
        console.log(`🚫 已取消 ${invitedEmail} 對 ${fileName} 的共同編輯權限`);
        return res.json({ success: true, message: `已取消 ${invitedEmail} 的共同編輯權限` });
    } catch (err) {
        console.error('❌ 取消共同編輯權限失敗:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// 取得別人邀請「我」共同編輯的檔案清單
app.get('/api/excel-pool/shared-with-me', async (req, res) => {
    const myEmail = String(req.user.email || '').toLowerCase().trim();
    try {
        const shares = await FileShare.find({ invitedEmail: myEmail }).sort({ createdAt: -1 });
        const files = shares.map(share => {
            const ownerDir = getUserPoolDir(share.ownerEmail);
            const fullPath = resolvePoolFile(ownerDir, share.fileName);
            if (!fullPath || !fs.existsSync(fullPath)) return null;
            const stat = fs.statSync(fullPath);
            const meta = readPoolMeta(ownerDir);
            const ext = path.extname(share.fileName).toLowerCase().replace('.', '');
            return {
                fileName: share.fileName,
                displayName: (meta[share.fileName] && meta[share.fileName].displayName) || defaultDisplayName(share.fileName),
                ext,
                editable: EDITABLE_EXCEL_EXT.includes(ext),
                size: stat.size,
                uploadedAt: stat.mtime.toISOString(),
                ownerEmail: share.ownerEmail
            };
        }).filter(Boolean);
        return res.json({ success: true, count: files.length, files });
    } catch (err) {
        console.error('❌ 讀取共同編輯檔案清單失敗:', err.message);
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

// ==========================================
// 🔄 共用轉換器：ExcelJS 活頁簿 Buffer → Syncfusion Spreadsheet JSON
//    (由 /api/spreadsheet/open 與 Excel 檔案池的 open 路由共用)
// ==========================================
async function excelBufferToSpreadsheetJson(fileBuffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);
    // getWorksheet(1) resolves by ExcelJS's internal sheet id, not tab position —
    // for workbooks whose sheets were reordered/copied (ids no longer start at 1),
    // that silently loads the wrong tab. Instead, match what Excel actually shows on
    // open: the saved activeTab if it's visible, else the first visible sheet, else
    // just the first sheet (e.g. if every sheet is hidden).
    const activeTabIndex = workbook.views && workbook.views[0] ? workbook.views[0].activeTab : 0;
    const activeCandidate = workbook.worksheets[activeTabIndex];
    const worksheet = (activeCandidate && activeCandidate.state === 'visible')
        ? activeCandidate
        : (workbook.worksheets.find(ws => ws.state === 'visible') || workbook.worksheets[0]);

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
    return {
        result,
        sheetCount: workbook.worksheets.length,
        sheetNames: workbook.worksheets.map(ws => ws.name)
    };
}

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

        const { result } = await excelBufferToSpreadsheetJson(fileBuffer);
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
// 🌟 Google Access Token 驗證器 + 登入路由
// ========================================================
// 前端用 @react-oauth/google 的 useGoogleLogin（OAuth 彈窗流程，與 likeexcelG.tsx
// 原本驗證過可用的方式一致）取得 access_token，而不是 Google 官方 "Sign In With
// Google" 按鈕元件的 ID token —— 後者的 Google Identity Services 只允許
// http://localhost 或 https:// 來源，純 IP + HTTP 環境下會被 Google 政策擋下。
// 現在 www.mygwsite.com 由 Caddy 提供 HTTPS（見 Caddyfile），Google OAuth Client
// 的 Authorized JavaScript origins 也已加上 https://www.mygwsite.com。
async function verifyGoogleAccessToken(accessToken) {
    try {
        // 1. 確認這個 access token 確實是核發給本應用程式（比對 audience），
        //    避免有人拿其他 Google App 核發的 token 冒充登入。
        const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
        if (!tokenInfoRes.ok) {
            return { success: false, error: 'Google access token 無效或已過期' };
        }
        const tokenInfo = await tokenInfoRes.json();
        if (tokenInfo.aud !== GOOGLE_CLIENT_ID) {
            return { success: false, error: 'Access token 並非核發給本應用程式' };
        }

        // 2. 取得使用者基本資料
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!userInfoRes.ok) {
            return { success: false, error: '讀取 Google 使用者資料失敗' };
        }
        const payload = await userInfoRes.json(); // email, name, picture
        return { success: true, payload };
    } catch (err) {
        console.error("❌ Google Access Token 驗證拒絕:", err.message);
        return { success: false, error: err.message };
    }
}

app.post('/api/auth/google', async (req, res) => {
    const { access_token } = req.body;
    if (!access_token) {
        return res.status(400).json({ success: false, message: '缺少 Google access token' });
    }
    const result = await verifyGoogleAccessToken(access_token);
    if (!result.success) {
        return res.status(401).json({ success: false, message: result.error });
    }
    const { email, name, picture } = result.payload;
    const token = jwt.sign({ email, name, picture }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ success: true, token, user: { email, name, picture } });
});

app.get('/api/auth/me', (req, res) => {
    res.json({ success: true, user: req.user });
});

// ========================================================
// 🔑 Email/password 登入（Google 需要 HTTPS 或 localhost 才能用；www.mygwsite.com
// 現在有 Caddy 提供的 HTTPS，Google 登入是主要方式，這個保留作為備用登入方式）
// ========================================================
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true },
}, { timestamps: true });
const User = mongoose.model('User', userSchema, 'users');

app.post('/api/auth/register', async (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
        return res.status(400).json({ success: false, message: '缺少 email、password 或 name' });
    }
    if (password.length < 8) {
        return res.status(400).json({ success: false, message: '密碼至少需要 8 個字元' });
    }
    try {
        const normalizedEmail = email.toLowerCase().trim();
        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) {
            return res.status(409).json({ success: false, message: '此 email 已被註冊' });
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({ email: normalizedEmail, passwordHash, name });
        const token = jwt.sign({ email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ success: true, token, user: { email: user.email, name: user.name } });
    } catch (err) {
        console.error('❌ 註冊失敗:', err.message);
        res.status(500).json({ success: false, message: '註冊失敗' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: '缺少 email 或 password' });
    }
    try {
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        const match = user && await bcrypt.compare(password, user.passwordHash);
        if (!match) {
            return res.status(401).json({ success: false, message: 'Email 或密碼錯誤' });
        }
        const token = jwt.sign({ email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ success: true, token, user: { email: user.email, name: user.name } });
    } catch (err) {
        console.error('❌ 登入失敗:', err.message);
        res.status(500).json({ success: false, message: '登入失敗' });
    }
});


const wss = new WebSocket.Server({ noServer: true });

// 🌟 每個房間（templateCode / 檔案池）各自對應一份 Y.Doc + Awareness，
//    負責把某個使用者送來的 sync/awareness 訊息轉發給同房間的其他所有連線。
//    y-websocket 3.x 拿掉了舊版內建的 server 端 bin/utils，所以這段轉發邏輯要自己實作，
//    否則客戶端各自的 Y.Doc 永遠不會收到彼此的更新（表現出來就是 A 改了 B 看不到）。
const messageSync = 0;
const messageAwareness = 1;
const yRooms = new Map(); // roomName -> { doc, awareness, conns: Map<ws, Set<clientID>> }

function getYRoom(roomName) {
  let room = yRooms.get(roomName);
  if (room) return room;

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  const conns = new Map();
  room = { doc, awareness, conns };
  yRooms.set(roomName, room);

  const send = (ws, message) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message, (err) => { if (err) ws.close(); });
    }
  };

  doc.on('update', (update, origin) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    conns.forEach((_clientIDs, conn) => {
      if (conn !== origin) send(conn, message);
    });
  });

  awareness.on('update', ({ added, updated, removed }, origin) => {
    const changedClients = added.concat(updated, removed);
    if (origin !== null && conns.has(origin)) {
      const connControlledIDs = conns.get(origin);
      added.forEach((clientID) => connControlledIDs.add(clientID));
      removed.forEach((clientID) => connControlledIDs.delete(clientID));
    }
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients));
    const message = encoding.toUint8Array(encoder);
    conns.forEach((_clientIDs, conn) => send(conn, message));
  });

  return room;
}

function setupYWebsocketConnection(ws, roomName) {
  const { doc, awareness, conns } = getYRoom(roomName);
  conns.set(ws, new Set());
  ws.binaryType = 'arraybuffer';

  const send = (message) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message, (err) => { if (err) ws.close(); });
    }
  };

  ws.on('message', (data) => {
    try {
      const uint8 = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer || data);
      const decoder = decoding.createDecoder(uint8);
      const messageType = decoding.readVarUint(decoder);
      switch (messageType) {
        case messageSync: {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, messageSync);
          syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
          if (encoding.length(encoder) > 1) send(encoding.toUint8Array(encoder));
          break;
        }
        case messageAwareness: {
          awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), ws);
          break;
        }
      }
    } catch (err) {
      console.error('❌ [Yjs 訊息處理失敗]', err.message);
    }
  });

  ws.on('close', () => {
    const controlledIDs = conns.get(ws);
    conns.delete(ws);
    if (controlledIDs) {
      awarenessProtocol.removeAwarenessStates(awareness, Array.from(controlledIDs), null);
    }
    if (conns.size === 0) yRooms.delete(roomName);
  });

  // 連線建立時：送出 sync step1，讓新加入者跟現有文件對齊
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(encoding.toUint8Array(encoder));
  }
  // 並同步現有的 awareness 狀態（讓新加入者馬上看到誰在線上）
  const awarenessStates = awareness.getStates();
  if (awarenessStates.size > 0) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awarenessStates.keys())));
    send(encoding.toUint8Array(encoder));
  }
}

// 在 server.on('upgrade') 時，必須支援帶有 query string 的路徑比對
server.on('upgrade', (request, socket, head) => {
  const { pathname, query } = url.parse(request.url, true);

  // 🔴 注意：比對路徑時，不能直接用 request.url === '/excel-room-...'
  // 必須用 pathname 來比對，否則帶了 ?auth_token 欄位後會比對失敗而 404！
  if (pathname.startsWith('/excel-room-')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      const roomName = pathname.slice(1); // 去掉開頭斜線，對應前端 roomName
      setupYWebsocketConnection(ws, roomName);
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