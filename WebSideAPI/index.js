const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const sql = require('mssql');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const vm = require('vm'); // 🌟 原本的 Node.js 虛擬沙盒模組，完整保留
const util = require('util');
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
const { msg } = require('./i18n');
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
        return res.status(401).json({ success: false, message: msg(req, 'authMissingToken') });
    }
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: msg(req, 'authInvalidToken') });
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
// 🗄️ XLSX Template Setup 專用：本機 SQLite 資料庫檔案管理
// ==========================================
// 取代原本的遠端 MSSQL host/user/password 連線設定 —— 範本改為「先建立一個
// 本機 .db 檔案，再把 Excel 範本綁定到該檔案」，檔案存放於 sqlite-dbs/。
const sqliteDbDirectory = path.join(__dirname, 'sqlite-dbs');
if (!fs.existsSync(sqliteDbDirectory)) {
    fs.mkdirSync(sqliteDbDirectory, { recursive: true });
}

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
function isValidIdentifier(name) {
    return typeof name === 'string' && IDENTIFIER_PATTERN.test(name);
}

// 🔒 每個使用者只能看到/操作自己的 SQLite 資料庫檔案：以登入者 email 為鍵，
// 各自獨立一個子目錄（對照下方 Excel 檔案池的 getUserPoolDir() 作法）。
// safeUserDirName() 定義在下方「Excel 檔案池」區塊，因 function 宣告會整檔提升(hoist)，此處可直接呼叫。
function getUserSqliteDir(email) {
    const dir = path.join(sqliteDbDirectory, safeUserDirName(email));
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

// 只允許存取「該使用者自己」SQLite 子目錄底下、副檔名為 .db 的檔案，避免路徑穿越。
function resolveSqliteDbPath(dbFile, email) {
    const safeName = path.basename(String(dbFile || '').trim());
    if (!safeName || !safeName.toLowerCase().endsWith('.db')) return null;
    return path.join(getUserSqliteDir(email), safeName);
}

// 每個 .db 檔案只保留一個常駐連線，避免每個 request 都重新開檔/關檔
// （對照 MSSQL 那邊的 pools/getPool() 快取模式）。
const sqliteDbPool = new Map(); // 完整檔案路徑 (已含使用者子目錄) -> DatabaseSync 實例

function getSqliteDb(dbFile, email) {
    const dbPath = resolveSqliteDbPath(dbFile, email);
    if (!dbPath) throw new Error('無效的 SQLite 資料庫檔名');

    const cacheKey = dbPath; // 完整路徑已包含使用者子目錄，天然區隔不同使用者
    const cached = sqliteDbPool.get(cacheKey);
    if (cached) return cached;

    console.log(`🔌 開啟並快取本機 SQLite 連線 [${cacheKey}]...`);
    const db = new DatabaseSync(dbPath); // 檔案不存在時會自動建立
    sqliteDbPool.set(cacheKey, db);
    return db;
}

// 服務關閉時，把目前池內所有 SQLite 連線平順關閉，避免留下鎖檔。
function closeAllSqliteDbs() {
    for (const [cacheKey, db] of sqliteDbPool) {
        try { db.close(); } catch (err) { console.error(`⚠️ 關閉 SQLite 連線 [${cacheKey}] 失敗:`, err.message); }
    }
    sqliteDbPool.clear();
}
process.on('exit', closeAllSqliteDbs);
process.on('SIGINT', () => { closeAllSqliteDbs(); process.exit(0); });
process.on('SIGTERM', () => { closeAllSqliteDbs(); process.exit(0); });

app.get('/api/spreadsheet/sqlite/list-dbs', (req, res) => {
    try {
        const userDir = getUserSqliteDir(req.user.email);
        const files = fs.readdirSync(userDir).filter(f => f.toLowerCase().endsWith('.db'));
        res.json({ success: true, files });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/spreadsheet/sqlite/create-db', (req, res) => {
    const requestedName = String(req.body?.dbFile || '').trim();
    if (!requestedName) {
        return res.status(400).json({ success: false, message: msg(req, 'dbFileRequired') });
    }
    const dbFile = requestedName.toLowerCase().endsWith('.db') ? requestedName : `${requestedName}.db`;
    const dbPath = resolveSqliteDbPath(dbFile, req.user.email);
    if (!dbPath) {
        return res.status(400).json({ success: false, message: msg(req, 'dbFileInvalid') });
    }
    try {
        const alreadyExisted = fs.existsSync(dbPath);
        getSqliteDb(dbFile, req.user.email); // 建立（或開啟既有的）SQLite 檔案並存入連線池
        res.json({
            success: true,
            dbFile: path.basename(dbPath),
            message: alreadyExisted
                ? msg(req, 'dbBoundExisting', { file: path.basename(dbPath) })
                : msg(req, 'dbCreated', { file: path.basename(dbPath) }),
        });
    } catch (err) {
        console.error('❌ 建立 SQLite 資料庫檔案失敗:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 🌟 DB Console 頁面專用：對使用者選定的本機 SQLite 資料庫檔案，直接執行使用者輸入的
// 任意 SQL 指令（SELECT 查詢回傳表格資料；INSERT/UPDATE/DELETE 回傳影響列數；
// CREATE/DROP/多語句腳本則透過 db.exec() 執行）。dbPath 已經過 resolveSqliteDbPath()
// 限制在該登入者自己的 sqlite-dbs/<user> 子目錄內，不會讓使用者操作到別人的資料庫檔案。
app.post('/api/spreadsheet/sqlite/execute-sql', (req, res) => {
    const dbFile = req.body?.dbFile;
    const sqlText = String(req.body?.sql || '').trim();

    if (!sqlText) {
        return res.status(400).json({ success: false, message: msg(req, 'sqlRequired') });
    }

    const dbPath = resolveSqliteDbPath(dbFile, req.user.email);
    if (!dbPath || !fs.existsSync(dbPath)) {
        return res.status(400).json({ success: false, message: msg(req, 'sqlSelectDb') });
    }

    try {
        const db = getSqliteDb(dbFile, req.user.email);

        try {
            // 先嘗試當作「單一語句」處理，才能分辨是否為查詢型指令（有回傳列）
            const stmt = db.prepare(sqlText);
            if (/^\s*(select|pragma|explain)/i.test(sqlText)) {
                const rows = stmt.all();
                return res.json({
                    success: true,
                    mode: 'rows',
                    columns: rows.length > 0 ? Object.keys(rows[0]) : [],
                    rows,
                    message: msg(req, 'sqlQueryDone', { count: rows.length })
                });
            }
            const info = stmt.run();
            return res.json({
                success: true,
                mode: 'run',
                changes: info.changes,
                lastInsertRowid: info.lastInsertRowid !== undefined ? String(info.lastInsertRowid) : null,
                message: msg(req, 'sqlRunDone', { count: info.changes })
            });
        } catch (prepareErr) {
            // prepare() 只接受單一語句；多語句腳本或部分 DDL 改用 exec() 執行（無回傳資料）
            db.exec(sqlText);
            return res.json({ success: true, mode: 'exec', message: msg(req, 'sqlExecDone') });
        }
    } catch (err) {
        console.error('❌ 執行 SQL 指令失敗:', err.message);
        return res.status(400).json({ success: false, message: err.message });
    }
});


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

// ⏰ 編輯期限：擁有者可替檔案設定 editDeadline（ISO 時間，存在 .pool-meta.json），
//    超過期限後受邀的共同編輯者只能檢視、不能再編輯/回存；擁有者本人不受限制，可隨時調整或清除期限。
function getPoolEditLock(userDir, fileName, isOwner) {
    const meta = readPoolMeta(userDir);
    const editDeadline = (meta[fileName] && meta[fileName].editDeadline) || null;
    const expired = !!editDeadline && Date.now() >= new Date(editDeadline).getTime();
    return { editDeadline, readOnly: !isOwner && expired };
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

// ------------------------------------------
// 📜 檔案修訂紀錄：每個檔案池檔案的儲存格修改與回存事件
//    以「擁有者 + 實體檔名」為鍵存在同一個 collection（不再像舊的 templateCode_YYYYMMDD
//    依範本/日期拆表），修改者一律取自登入身分 req.user，不採信前端送來的名字。
// ------------------------------------------
const fileRevisionSchema = new mongoose.Schema({
    ownerEmail: { type: String, required: true, lowercase: true, trim: true },
    fileName: { type: String, required: true },
    type: { type: String, enum: ['cell', 'save'], required: true },
    user: { type: String, required: true },
    // type = 'cell'
    cellAddress: { type: String, default: null },
    oldValue: { type: String, default: null },
    newValue: { type: String, default: null },
    reason: { type: String, default: null },
    // type = 'save'
    saveMode: { type: String, enum: ['overwrite', 'new', null], default: null },
    savedAs: { type: String, default: null },
    auto: { type: Boolean, default: false },
}, { timestamps: true });
fileRevisionSchema.index({ ownerEmail: 1, fileName: 1, createdAt: -1 });
const FileRevision = mongoose.model('FileRevision', fileRevisionSchema, 'file_revisions');

// 紀錄失敗不影響主要動作（編輯/存檔本身已經成功），只記在伺服器 log
function recordFileRevision(entry) {
    FileRevision.create(entry).catch(err => console.error('❌ 寫入檔案修訂紀錄失敗:', err.message));
}

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
            return res.status(400).json({ success: false, message: msg(req, 'noFileUploaded') });
        }
        const saved = req.files.map(f => ({
            fileName: f.filename,
            originalName: decodeOriginalName(f.originalname),
            size: f.size
        }));
        console.log(`💾 已存入 Excel 檔案池 (${saved.length} 筆):`, saved.map(s => s.fileName).join(', '));
        return res.json({ success: true, message: msg(req, 'uploadedCount', { count: saved.length }), files: saved });
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
                    editDeadline: (meta[name] && meta[name].editDeadline) || null,
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
        return res.status(404).json({ success: false, message: msg(req, 'fileNotFound') });
    }

    const displayName = String((req.body && req.body.displayName) || '').trim();
    if (!displayName) {
        return res.status(400).json({ success: false, message: msg(req, 'nameEmpty') });
    }
    if (displayName.length > 120) {
        return res.status(400).json({ success: false, message: msg(req, 'nameTooLong') });
    }

    try {
        const fileName = path.basename(fullPath);
        const meta = readPoolMeta(userDir);
        meta[fileName] = { ...meta[fileName], displayName, updatedAt: new Date().toISOString() };
        writePoolMeta(userDir, meta);
        console.log(`🏷️ 已更新檔案顯示名稱: ${fileName} → ${displayName}`);
        return res.json({ success: true, message: msg(req, 'nameUpdated'), fileName, displayName });
    } catch (err) {
        console.error('❌ 更新檔案顯示名稱失敗:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// ⏰ 設定 / 清除單一檔案的編輯期限（僅擁有者本人可設定）
//    body: { editDeadline: ISO 時間字串 }，傳 null 或空字串代表清除期限（恢復永久可編輯）
app.patch('/api/excel-pool/:fileName/deadline', (req, res) => {
    const userDir = getUserPoolDir(req.user.email);
    const fullPath = resolvePoolFile(userDir, req.params.fileName);
    if (!fullPath || !fs.existsSync(fullPath)) {
        return res.status(404).json({ success: false, message: msg(req, 'fileNotFound') });
    }

    const raw = req.body && req.body.editDeadline;
    let editDeadline = null;
    if (raw) {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) {
            return res.status(400).json({ success: false, message: msg(req, 'deadlineInvalid') });
        }
        editDeadline = d.toISOString();
    }

    try {
        const fileName = path.basename(fullPath);
        const meta = readPoolMeta(userDir);
        const entry = { ...meta[fileName] };
        if (editDeadline) entry.editDeadline = editDeadline;
        else delete entry.editDeadline;
        meta[fileName] = entry;
        writePoolMeta(userDir, meta);
        console.log(`⏰ 已${editDeadline ? `設定 ${fileName} 編輯期限: ${editDeadline}` : `清除 ${fileName} 的編輯期限`}`);
        return res.json({ success: true, message: editDeadline ? msg(req, 'deadlineSet') : msg(req, 'deadlineCleared'), fileName, editDeadline });
    } catch (err) {
        console.error('❌ 設定編輯期限失敗:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// 開啟檔案池中的檔案，轉成 Syncfusion Spreadsheet 可載入的 JSON
app.get('/api/excel-pool/open/:fileName', async (req, res) => {
    const access = await resolvePoolFileAccess(req, req.params.fileName);
    if (!access) {
        return res.status(404).json({ success: false, message: msg(req, 'fileNotFoundOrNoAccess') });
    }
    const { fullPath, userDir, isOwner } = access;

    const fileName = path.basename(fullPath);
    const ext = path.extname(fileName).toLowerCase().replace('.', '');
    if (!EDITABLE_EXCEL_EXT.includes(ext)) {
        return res.status(400).json({
            success: false,
            message: msg(req, 'formatNotEditable', { ext })
        });
    }

    try {
        const { result, sheetCount, sheetNames } = await excelBufferToSpreadsheetJson(fs.readFileSync(fullPath), {
            skipBlankCells: SKIP_BLANK_CELLS_FILES.has(fileName)
        });
        const meta = readPoolMeta(userDir);
        const { editDeadline, readOnly } = getPoolEditLock(userDir, fileName, isOwner);
        console.log(`📖 已開啟檔案池檔案: ${fileName} (共 ${sheetCount} 個工作表)${readOnly ? ' [已過編輯期限，唯讀]' : ''}`);
        return res.json({
            success: true,
            fileName,
            displayName: (meta[fileName] && meta[fileName].displayName) || defaultDisplayName(fileName),
            sheetCount,
            sheetNames,
            // 線上編輯器只載入/編輯「可見」工作表，隱藏工作表不載入也不送到前端；
            // 覆蓋回存時後端會就地覆寫這些可見工作表，隱藏工作表完全不去動、原封不動保留，
            // 因此只要是 .xlsx 就能覆蓋回存，不限單一工作表
            canOverwrite: ext === 'xlsx',
            isOwner,
            editDeadline,
            readOnly,
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
function populateWorksheetFromSpreadsheetJson(worksheet, sourceSheet) {
    sourceSheet = sourceSheet || {};
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

            // 🧮 開檔時 Syncfusion 算不出來的公式（IFNA/XLOOKUP/表格參照…）是以快取結果顯示、沒有帶公式的；
            //    就地覆寫原檔時，若該格的值仍等於原公式的快取結果（使用者沒改過），就保留原公式不動，
            //    否則存檔會把這些公式全部變成寫死的數值。使用者改成別的值時才照常覆寫。
            const keepOriginalFormula = !cell.formula && targetCell.formula &&
                String(cell.value ?? '') === excelValueToSpreadsheetValue(targetCell.result);

            // 值：公式優先，數字字串還原為數值，避免回寫後全部變成文字
            if (keepOriginalFormula) {
                // 原公式與快取結果原封不動
            } else if (cell.formula) {
                targetCell.value = { formula: String(cell.formula).replace(/^=/, '') };
            } else if (cell.value !== undefined && cell.value !== null && cell.value !== '') {
                const raw = cell.value;
                const asNumber = Number(raw);
                targetCell.value = (typeof raw !== 'boolean' && String(raw).trim() !== '' && !Number.isNaN(asNumber))
                    ? asNumber
                    : raw;
            }

            // 🔢 數字格式（貨幣/百分比/日期等）：回存時原樣寫回 ExcelJS 的 numFmt，
            // 否則格式化過的數字存檔後會全部變回沒有格式的純數字
            if (cell.format && cell.format !== 'General') {
                targetCell.numFmt = cell.format;
            }

            const style = cell.style || {};
            const font = {};
            if (style.fontWeight === 'bold') font.bold = true;
            if (style.fontStyle === 'italic') font.italic = true;
            if (style.fontSize) font.size = parseFloat(style.fontSize);
            if (style.fontFamily) font.name = style.fontFamily;
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

            // 🖼️ 框線：還原成實際的線寬/線型/顏色，而不是全部寫死成 1px 黑色細線
            const border = {};
            ['Top', 'Bottom', 'Left', 'Right'].forEach(side => {
                const cssVal = style[`border${side}`];
                if (cssVal) border[side.toLowerCase()] = cssBorderToExcelBorderSide(cssVal);
            });
            if (Object.keys(border).length > 0) targetCell.border = border;

            // 合併儲存格：以 rowSpan / colSpan 還原
            const rowSpan = cell.rowSpan || 1;
            const colSpan = cell.colSpan || 1;
            if (rowSpan > 1 || colSpan > 1) {
                // top/left 用 1-based (rowIdx+1 / colIdx+1)，bottom/right 要再加上 span 才對：
                // bottom = top + rowSpan - 1 = rowIdx + rowSpan（先前寫成 rowIdx + rowSpan - 1，
                // 比正確值少了 1 列，導致垂直合併儲存格存檔後永遠少合併最後一列）
                merges.push([rowIdx + 1, colIdx + 1, rowIdx + rowSpan, colIdx + colSpan]);
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
}

// 🌟 這是讀不到原檔時的退路（整份重建，而非就地覆寫）：把 JSON 裡「可見」的每個工作表
//    都還原回一份全新的活頁簿。stateByName（可選）用來把原檔各工作表的隱藏狀態依名稱比對
//    套用回新產生的工作表——但因為讀原檔已經失敗，通常沒有東西可套用，隱藏工作表在這條
//    退路上無論如何都無法保留（原檔內容讀不到，自然也重建不出來）。
function spreadsheetJsonToWorkbook(workbookJson, stateByName) {
    const workbook = new ExcelJS.Workbook();
    const sourceSheets = Array.isArray(workbookJson.sheets) && workbookJson.sheets.length > 0
        ? workbookJson.sheets
        : [{}];

    sourceSheets.forEach((sourceSheet, idx) => {
        const name = (sourceSheet && sourceSheet.name) || `Sheet${idx + 1}`;
        const worksheet = workbook.addWorksheet(name);
        populateWorksheetFromSpreadsheetJson(worksheet, sourceSheet);
        if (stateByName && stateByName[name] && stateByName[name] !== 'visible') {
            worksheet.state = stateByName[name];
        }
    });

    // .xlsx 規格要求至少一個可見工作表；若套用隱藏狀態後全部變成隱藏，強制留下第一個可見
    if (!workbook.worksheets.some(ws => ws.state === 'visible')) {
        workbook.worksheets[0].state = 'visible';
    }

    return workbook;
}

// 🌟 檔案池「覆蓋回存」的高擬真版本：不整份重建活頁簿，而是直接在讀進來的原始活頁簿上
//    就地覆寫 JSON 涵蓋到的儲存格值/樣式/合併範圍，其餘原檔屬性——凍結窗格、頁面設定、
//    自動篩選、已定義名稱、嵌入圖片、索引標籤顏色、欄/列隱藏與群組層級、活頁簿主題/內建
//    屬性等 Syncfusion JSON 完全沒有承載的東西——全部原封不動留在原檔物件上，不會因為
//    整份用 ExcelJS 重新產生活頁簿而被拿掉，回存後才能盡量貼近原始檔案。
function patchWorkbookFromSpreadsheetJson(existingWorkbook, workbookJson, stateByName) {
    const sourceSheets = Array.isArray(workbookJson.sheets) ? workbookJson.sheets : [];

    sourceSheets.forEach((sourceSheet, idx) => {
        const name = (sourceSheet && sourceSheet.name) || `Sheet${idx + 1}`;
        // 🌟 開檔現在只會把「可見」分頁送到編輯器，隱藏分頁不在 JSON 裡——所以這裡的陣列索引
        // idx 不再等於原始活頁簿的分頁索引（原始活頁簿仍然包含隱藏分頁），一定要優先用分頁
        // 名稱比對，索引只能當作「真的找不到同名分頁」時的備援，否則隱藏分頁一多，
        // 存檔就會把內容寫到位置對不上的錯誤分頁去。
        let worksheet = existingWorkbook.getWorksheet(name) || existingWorkbook.worksheets[idx];
        if (!worksheet) {
            worksheet = existingWorkbook.addWorksheet(name);
        }

        // 先解除原本的合併範圍再依 JSON 重新合併，避免使用者在編輯器裡調整過合併範圍時，
        // 殘留原檔舊的合併與新的合併範圍互相衝突而整段被 ExcelJS 靜默忽略。
        // 🐢 注意：這裡故意直接讀 worksheet._merges，不要改成 worksheet.model.merges ——
        // 跟 workbook.model 一樣，worksheet.model 也是即算 getter，會把「這張工作表的每一列」
        // 重新序列化一次，對幾千列的大分頁來說，單純只是為了拿合併範圍就會多花不少時間。
        const existingMerges = Object.values(worksheet._merges || {});
        existingMerges.forEach(merge => {
            try { worksheet.unMergeCells(merge.top, merge.left, merge.bottom, merge.right); } catch (e) { /* 忽略無效範圍 */ }
        });

        populateWorksheetFromSpreadsheetJson(worksheet, sourceSheet);

        if (stateByName && stateByName[name] && stateByName[name] !== 'visible') {
            worksheet.state = stateByName[name];
        }
    });

    if (!existingWorkbook.worksheets.some(ws => ws.state === 'visible')) {
        existingWorkbook.worksheets[0].state = 'visible';
    }

    return existingWorkbook;
}

// 將線上編輯器的內容回存至檔案池 (覆蓋原檔或另存新檔)
app.post('/api/excel-pool/save', async (req, res) => {
    const { fileName, mode, spreadsheetData } = req.body || {};
    const access = await resolvePoolFileAccess(req, fileName);
    if (!access) {
        return res.status(404).json({ success: false, message: msg(req, 'sourceNotFoundOrNoAccess') });
    }
    const { fullPath, userDir, isOwner } = access;

    if (getPoolEditLock(userDir, path.basename(fullPath), isOwner).readOnly) {
        return res.status(403).json({ success: false, message: msg(req, 'deadlinePassedReadOnly') });
    }

    const workbookJson = spreadsheetData && (spreadsheetData.Workbook || spreadsheetData);
    if (!workbookJson || !workbookJson.sheets || workbookJson.sheets.length === 0) {
        return res.status(400).json({ success: false, message: msg(req, 'invalidSpreadsheetData') });
    }

    const sourceName = path.basename(fullPath);
    const ext = path.extname(sourceName).toLowerCase();

    try {
        if (mode === 'overwrite' && ext !== '.xlsx') {
            return res.status(400).json({
                success: false,
                message: msg(req, 'overwriteNotSupported', { ext })
            });
        }

        // 🌟 回存前先把原檔整份讀進來當底稿：編輯器只會顯示/編輯原檔裡「可見」的工作表，
        //    隱藏工作表完全不會載入，這裡順便記下每個可見工作表目前的隱藏狀態（理論上都是
        //    'visible'，但保留這段以防萬一），回存時依名稱比對套用回去。
        //    baseWorkbook 若成功讀到，回存時會直接在它上面就地覆寫，而不是整份重建，這樣
        //    凍結窗格/頁面設定/自動篩選/已定義名稱/嵌入圖片/索引標籤顏色/欄列群組層級，
        //    以及完全沒被編輯器載入過的隱藏工作表本身，都不會被存檔動作動到，盡量貼近原始檔案。
        const originalStateByName = {};
        let baseWorkbook = null;
        try {
            baseWorkbook = new ExcelJS.Workbook();
            await baseWorkbook.xlsx.readFile(fullPath);
            baseWorkbook.worksheets.forEach(ws => { originalStateByName[ws.name] = ws.state; });
        } catch (e) {
            // 讀取原檔失敗（例如來源檔案本身已損毀）就退回整份重建，不套用隱藏狀態
            baseWorkbook = null;
        }

        let targetName = sourceName;
        if (mode !== 'overwrite') {
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
            targetName = uniquePoolName(userDir, `${path.basename(sourceName, ext)} (編輯 ${stamp}).xlsx`);
        }

        const workbook = baseWorkbook
            ? patchWorkbookFromSpreadsheetJson(baseWorkbook, workbookJson, originalStateByName)
            : spreadsheetJsonToWorkbook(workbookJson, originalStateByName);
        await workbook.xlsx.writeFile(path.join(userDir, targetName));

        // 另存新檔時，沿用原檔的別名作為新檔別名的基礎；覆蓋原檔則不需要另外建立別名
        if (targetName !== sourceName) {
            const meta = readPoolMeta(userDir);
            const baseName = (meta[sourceName] && meta[sourceName].displayName) || defaultDisplayName(sourceName);
            meta[targetName] = { displayName: `${baseName} (編輯版)`, updatedAt: new Date().toISOString() };
            writePoolMeta(userDir, meta);
        }

        console.log(`💾 編輯內容已回存至檔案池: ${targetName} (mode=${mode || 'new'}, 共 ${workbookJson.sheets.length} 個工作表)`);
        recordFileRevision({
            ownerEmail: access.ownerEmail,
            fileName: sourceName,
            type: 'save',
            user: String(req.user.email || '').toLowerCase(),
            saveMode: mode === 'overwrite' ? 'overwrite' : 'new',
            savedAs: targetName !== sourceName ? targetName : null,
            auto: !!(req.body && req.body.auto),
        });
        return res.json({
            success: true,
            message: mode === 'overwrite' ? msg(req, 'overwritten') : msg(req, 'savedAs', { name: targetName }),
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
        return res.status(404).json({ success: false, message: msg(req, 'fileNotFoundOrNoAccess') });
    }
    return res.download(access.fullPath, path.basename(access.fullPath));
});

// 從檔案池刪除單一檔案
app.delete('/api/excel-pool/:fileName', (req, res) => {
    const userDir = getUserPoolDir(req.user.email);
    const fullPath = resolvePoolFile(userDir, req.params.fileName);
    if (!fullPath || !fs.existsSync(fullPath)) {
        return res.status(404).json({ success: false, message: msg(req, 'fileNotFound') });
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
        // 一併刪除修訂紀錄，避免之後上傳同名檔案時沿用到舊檔案的歷史
        FileRevision.deleteMany({ ownerEmail: String(req.user.email || '').toLowerCase().trim(), fileName })
            .catch(err => console.error('❌ 刪除檔案修訂紀錄失敗:', err.message));
        console.log(`🗑️ 已從 Excel 檔案池刪除: ${fileName}`);
        return res.json({ success: true, message: msg(req, 'fileDeleted') });
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
        return res.status(404).json({ success: false, message: msg(req, 'fileNotFound') });
    }

    const invitedEmail = String((req.body && req.body.email) || '').toLowerCase().trim();
    if (!invitedEmail || !invitedEmail.includes('@')) {
        return res.status(400).json({ success: false, message: msg(req, 'inviteEmailInvalid') });
    }
    if (invitedEmail === ownerEmail) {
        return res.status(400).json({ success: false, message: msg(req, 'inviteSelf') });
    }

    try {
        const fileName = path.basename(fullPath);
        await FileShare.findOneAndUpdate(
            { ownerEmail, fileName, invitedEmail },
            { ownerEmail, fileName, invitedEmail },
            { upsert: true, returnDocument: 'after' }
        );
        console.log(`🤝 已邀請 ${invitedEmail} 共同編輯 ${fileName} (擁有者: ${ownerEmail})`);
        return res.json({ success: true, message: msg(req, 'invited', { email: invitedEmail }), fileName, invitedEmail });
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
        return res.status(404).json({ success: false, message: msg(req, 'fileNotFoundOrNoAccess') });
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
        return res.status(404).json({ success: false, message: msg(req, 'fileNotFound') });
    }
    try {
        const fileName = path.basename(fullPath);
        const invitedEmail = String(req.params.email || '').toLowerCase().trim();
        await FileShare.deleteOne({ ownerEmail, fileName, invitedEmail });
        console.log(`🚫 已取消 ${invitedEmail} 對 ${fileName} 的共同編輯權限`);
        return res.json({ success: true, message: msg(req, 'inviteRevoked', { email: invitedEmail }) });
    } catch (err) {
        console.error('❌ 取消共同編輯權限失敗:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// 📜 記錄一筆儲存格修改（擁有者或受邀共同編輯者；超過編輯期限的共同編輯者不可再記錄）
app.post('/api/excel-pool/:fileName/revisions', async (req, res) => {
    const access = await resolvePoolFileAccess(req, req.params.fileName);
    if (!access) {
        return res.status(404).json({ success: false, message: msg(req, 'fileNotFoundOrNoAccess') });
    }
    const fileName = path.basename(access.fullPath);
    if (getPoolEditLock(access.userDir, fileName, access.isOwner).readOnly) {
        return res.status(403).json({ success: false, message: msg(req, 'deadlinePassedReadOnly') });
    }

    const { cellAddress, oldValue, newValue, reason } = req.body || {};
    if (!cellAddress) {
        return res.status(400).json({ success: false, message: msg(req, 'cellAddressRequired') });
    }
    const asText = (v) => (v === undefined || v === null ? null : String(v).slice(0, 2000));

    try {
        const entry = await FileRevision.create({
            ownerEmail: access.ownerEmail,
            fileName,
            type: 'cell',
            user: String(req.user.email || '').toLowerCase(),
            cellAddress: String(cellAddress).slice(0, 200),
            oldValue: asText(oldValue),
            newValue: asText(newValue),
            reason: asText(reason) || null,
        });
        return res.json({ success: true, id: entry._id });
    } catch (err) {
        console.error('❌ 寫入檔案修訂紀錄失敗:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// 📜 讀取檔案修訂紀錄（擁有者或受邀共同編輯者皆可檢視）
//    query: owner、type(cell|save)、user、cell(位址關鍵字)、from/to(ISO 時間)、limit(預設 100，上限 5000)、
//    before(上一頁最後一筆的 _id，用來往下載入更多)
app.get('/api/excel-pool/:fileName/revisions', async (req, res) => {
    const access = await resolvePoolFileAccess(req, req.params.fileName);
    if (!access) {
        return res.status(404).json({ success: false, message: msg(req, 'fileNotFoundOrNoAccess') });
    }
    const fileName = path.basename(access.fullPath);
    const { type, user, cell, from, to, before } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 5000);

    const base = { ownerEmail: access.ownerEmail, fileName };
    const filter = { ...base };
    if (type === 'cell' || type === 'save') filter.type = type;
    if (user) filter.user = String(user).toLowerCase();
    if (cell) filter.cellAddress = { $regex: String(cell).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const createdAt = {};
    if (from && !Number.isNaN(new Date(from).getTime())) createdAt.$gte = new Date(from);
    if (to && !Number.isNaN(new Date(to).getTime())) createdAt.$lte = new Date(to);
    if (Object.keys(createdAt).length) filter.createdAt = createdAt;
    // total 是「符合篩選條件」的總筆數，不受分頁游標 before 影響
    const countFilter = { ...filter };
    if (before && mongoose.isValidObjectId(before)) filter._id = { $lt: new mongoose.Types.ObjectId(String(before)) };

    try {
        const [entries, users, total] = await Promise.all([
            FileRevision.find(filter).sort({ _id: -1 }).limit(limit + 1).lean(),
            FileRevision.distinct('user', base),
            FileRevision.countDocuments(countFilter),
        ]);
        const meta = readPoolMeta(access.userDir);
        return res.json({
            success: true,
            fileName,
            displayName: (meta[fileName] && meta[fileName].displayName) || defaultDisplayName(fileName),
            ownerEmail: access.ownerEmail,
            users: users.sort(),
            total,
            hasMore: entries.length > limit,
            entries: entries.slice(0, limit).map(e => ({
                id: String(e._id),
                type: e.type,
                user: e.user,
                at: e.createdAt,
                cellAddress: e.cellAddress,
                oldValue: e.oldValue,
                newValue: e.newValue,
                reason: e.reason,
                saveMode: e.saveMode,
                savedAs: e.savedAs,
                auto: e.auto,
            })),
        });
    } catch (err) {
        console.error('❌ 讀取檔案修訂紀錄失敗:', err.message);
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
                ...getPoolEditLock(ownerDir, share.fileName, false),
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
// 🌟 擴充新增路由 0-B（已淘汰）：原本用來動態測試遠端 MSSQL 連線狀態，
// XLSX Template Setup 改綁本機 SQLite 檔案後改用
// /api/spreadsheet/sqlite/list-dbs、/api/spreadsheet/sqlite/create-db。
// ==========================================


// ==========================================
// 1. 高擬真 OPEN 路由
// ==========================================
//const fs = require('fs'); // 確保有引入 fs

// 🎨 Office 預設佈景主題色盤 (background1/text1/background2/text2/accent1~6)。
//    Excel 儲存格顏色常常不是寫死的 RGB，而是「主題色 + 索引 (theme) + 深淺 (tint)」，
//    未自訂佈景主題的活頁簿幾乎都是用這組 Office 預設值，因此用它來還原顏色，
//    比完全不處理（直接漏掉整個顏色）好得多；若活頁簿真的自訂了佈景主題色，這裡只能算近似值。
const OFFICE_THEME_COLORS = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'];

// 依 OOXML 規格套用 tint（正值往白色調亮、負值往黑色調暗）
function applyColorTint(hex, tint) {
    if (!tint) return hex;
    const num = parseInt(hex, 16);
    const adjust = (component) => {
        const value = tint < 0 ? component * (1 + tint) : component * (1 - tint) + 255 * tint;
        return Math.max(0, Math.min(255, Math.round(value)));
    };
    const r = adjust((num >> 16) & 0xFF);
    const g = adjust((num >> 8) & 0xFF);
    const b = adjust(num & 0xFF);
    return [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// 🎨 從活頁簿實際的 theme1.xml 解析出「這份檔案真正的」佈景主題色盤，取代寫死的 Office 預設值。
//    ExcelJS 讀檔時會把原始 theme XML 字串原封不動存在 workbook.model.themes 裡（不會解析成物件），
//    如果檔案本身自訂過佈景主題色（例如公司範本常見的紫色/自訂配色），先前完全沒有讀取這份 XML、
//    一律套用 Office 預設色盤，導致自訂主題色的儲存格（背景/字型顏色）開檔後顏色整個跑掉
//    （紫色橫幅變黃色、卡其色列變綠色之類），跟原檔肉眼看起來完全不同。
//    OOXML 儲存格佈景主題色索引順序是 0=背景1(lt1) 1=文字1(dk1) 2=背景2(lt2) 3=文字2(dk2) 4~9=accent1~6，
//    跟 clrScheme XML 裡 dk1/lt1 的先後順序相反，這是規格既有的錯位，解析時要對調過來。
function parseWorkbookThemeColors(workbook) {
    // 🐢 注意：這裡故意直接讀 workbook._themes，不要改成 workbook.model.themes —
    //    ExcelJS 的 `.model` 是一個「即算」getter，每次存取都會把整份活頁簿（含全部工作表
    //    每一格）重新序列化兩次（worksheets + sheets），大檔案（幾十萬格）光是為了拿主題色
    //    XML 字串就白白多花幾百毫秒。_themes 是讀檔時就已經存好的原始欄位，直接拿不會有這個代價。
    const themes = workbook._themes;
    const xml = themes && (themes.theme1 || Object.values(themes)[0]);
    if (!xml) return null;

    const extract = (tag) => {
        const block = xml.match(new RegExp(`<a:${tag}>([\\s\\S]*?)</a:${tag}>`));
        if (!block) return undefined;
        const srgb = block[1].match(/srgbClr val="([0-9A-Fa-f]{6})"/);
        if (srgb) return srgb[1].toUpperCase();
        const sys = block[1].match(/lastClr="([0-9A-Fa-f]{6})"/);
        return sys ? sys[1].toUpperCase() : undefined;
    };

    const table = [
        extract('lt1'), extract('dk1'), extract('lt2'), extract('dk2'),
        extract('accent1'), extract('accent2'), extract('accent3'),
        extract('accent4'), extract('accent5'), extract('accent6')
    ];
    // 解析不到的項目（極少見的非標準主題 XML）就退回 Office 預設值，不要讓整組變成 undefined
    return table.map((c, i) => c || OFFICE_THEME_COLORS[i]);
}

function fixColor(colorObj, themeColors) {
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

    // 主題色 (例如 { theme: 4, tint: -0.25 })：這是先前版本完全沒處理、
    // 導致大量儲存格背景/字體顏色回存後整個消失的主要原因之一
    if (typeof colorObj.theme === 'number') {
        const palette = themeColors || OFFICE_THEME_COLORS;
        const base = palette[colorObj.theme] || palette[0];
        return '#' + applyColorTint(base, colorObj.tint);
    }

    return undefined;
};

// 🖼️ 儲存格框線樣式對照表：ExcelJS 的 border.style → 對應的 CSS 線寬/線型
const BORDER_STYLE_TO_CSS = {
    hair: '1px solid',
    thin: '1px solid',
    dotted: '1px dotted',
    dashed: '1px dashed',
    dashDot: '1px dashed',
    dashDotDot: '1px dashed',
    medium: '2px solid',
    mediumDashed: '2px dashed',
    mediumDashDot: '2px dashed',
    mediumDashDotDot: '2px dashed',
    slantDashDot: '2px dashed',
    thick: '3px solid',
    double: '3px double'
};

// ExcelJS 的單邊框線物件 { style, color } → Syncfusion CellStyleModel 用的 CSS border 字串
function excelBorderSideToCss(borderSide, themeColors) {
    if (!borderSide || !borderSide.style) return undefined;
    const css = BORDER_STYLE_TO_CSS[borderSide.style] || '1px solid';
    const color = fixColor(borderSide.color, themeColors) || '#000000';
    return `${css} ${color}`;
}

// 反過來：Syncfusion 存回來的 CSS border 字串 → ExcelJS 的 { style, color }
function cssBorderToExcelBorderSide(cssBorder) {
    const match = String(cssBorder || '').match(/^(\d+(?:\.\d+)?)px\s+(\w+)(?:\s+(#[0-9a-fA-F]{3,8}))?/);
    if (!match) return { style: 'thin', color: { argb: 'FF000000' } };
    const width = parseFloat(match[1]);
    const styleWord = match[2].toLowerCase();
    const colorHex = (match[3] || '#000000').replace('#', '').toUpperCase();

    let style = 'thin';
    if (styleWord === 'double') style = 'double';
    else if (styleWord === 'dotted') style = 'dotted';
    else if (styleWord === 'dashed') style = width >= 2 ? 'mediumDashed' : 'dashed';
    else if (width >= 3) style = 'thick';
    else if (width >= 2) style = 'medium';

    return { style, color: { argb: `FF${colorHex}` } };
}

// ==========================================
// 🔄 共用轉換器：ExcelJS 活頁簿 Buffer → Syncfusion Spreadsheet JSON
//    (由 /api/spreadsheet/open 與 Excel 檔案池的 open 路由共用)
// ==========================================
// 🛡️ 把單一 ExcelJS 工作表轉成 Syncfusion Spreadsheet 的 sheet JSON（含樣式/合併儲存格）。
//    不論該工作表在原檔中是否被設為隱藏，這裡都原樣輸出——是否顯示交由呼叫端決定
//    （目前線上編輯器會把回傳的所有工作表都當成一般分頁顯示，讓使用者也看得到隱藏的工作表）。
// 📅 ExcelJS 儲存格值（或公式的快取結果）→ Syncfusion 顯示用的值字串。
//    日期轉回 Excel 序列值（搭配 numFmt 由 Syncfusion 依原格式顯示），richText 合併為純文字，
//    錯誤值（#N/A 等）原樣帶出，其餘沿用 parseCellValue()。
function excelValueToSpreadsheetValue(v) {
    if (v instanceof Date) return String(v.getTime() / 86400000 + 25569);
    if (v && typeof v === 'object') {
        if (Array.isArray(v.richText)) return v.richText.map(rt => rt.text || '').join('');
        if (v.error !== undefined) return String(v.error);
    }
    return parseCellValue(v);
}

// 🧮 Syncfusion 公式引擎算不出來的 Excel 公式：
//    - _xlfn./_xlws. 前綴的新版函數（IFNA、XLOOKUP、FILTER…），Syncfusion 不認得會顯示 #NAME?
//    - 含 [ 的結構化表格參照（T_Cpu_pc[]、Table1[@欄位]）或外部活頁簿參照（[1]Sheet!A1）
//    - 參照隱藏工作表的公式（隱藏分頁不送到編輯器，Syncfusion 找不到該分頁）
//    這類儲存格開檔時改顯示 Excel 上次計算的快取結果，回存時再把原公式保留下來
//    （見 populateWorksheetFromSpreadsheetJson）。
function isFormulaUnsupportedBySpreadsheet(formula, hiddenSheetNames) {
    if (!formula) return false;
    if (/_xl(fn|ws)\./i.test(formula) || formula.includes('[')) return true;
    return (hiddenSheetNames || []).some(name =>
        formula.includes(`'${name.replace(/'/g, "''")}'!`) || formula.includes(`${name}!`));
}

// 🐢 開檔瘦身試行名單：這些檔案開檔時略過「看起來跟一般空白格一樣」的空白儲存格（見下方
//    skipBlankCells）。例如 Quanta_NBPC 的 NBPC PJ sheet(2507) 約 40 萬格中只有約 1.3 萬格有值，
//    其餘都是只帶字型的空白格，每格都送一份完整 style，開檔 JSON 高達 69 MB。
//    覆蓋回存是就地修改原檔，JSON 裡沒有的格子原檔格式原封不動，所以略過不影響回存。
const SKIP_BLANK_CELLS_FILES = new Set([
    'Quanta_NBPC_New PJ sheet_250717.xlsm',
    'Quanta_Server_New PJ sheet_250717.xlsm', // Server PJ sheet(2507) 約 29 萬格中只有約 3.9 萬格有值
]);

// 空白格是否「看得出來」：有背景色、框線、數字格式、合併範圍的空白格仍要送出，
// 只有字型/對齊（沒有值時畫面上看不到）的空白格才略過
function isInvisibleBlankCell(cellObj) {
    if (!cellObj) return true;
    if ((cellObj.value !== undefined && cellObj.value !== null && cellObj.value !== '') || cellObj.formula) return false;
    if (cellObj.rowSpan || cellObj.colSpan || cellObj.format) return false;
    const s = cellObj.style || {};
    return !(s.backgroundColor || s.borderTop || s.borderBottom || s.borderLeft || s.borderRight);
}

function buildSpreadsheetSheetJson(worksheet, themeColors, hiddenSheetNames, options = {}) {
    // 🛡️ 決定該工作表的最大欄位數基準（至少 26 欄，或依實際最大欄位而定）
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
            const formulaUnsupported = isFormulaUnsupportedBySpreadsheet(cell.formula, hiddenSheetNames);
            if (formulaUnsupported) cellObj.formula = undefined;

            // 🎨 安全處理：將 richText 陣列合併為純文字字串，避免格式崩潰或出現 [object Object]。
            //    Syncfusion 儲存格模型每格只能有一組樣式，沒辦法保留同一格內「每個字元各自的顏色」，
            //    所以順便挑出字數最多的那個 run 的字型/顏色，當作整格的代表樣式——
            //    這樣至少整格會套用一個「有意義」的顏色，而不是（cell.font 對 richText 儲存格
            //    通常只是預設樣式）整格顏色直接消失變黑色。
            let dominantFont = null;
            if (cell.value && typeof cell.value === 'object' && Array.isArray(cell.value.richText)) {
                const runs = cell.value.richText;
                cellObj.value = runs.map(rt => rt.text || '').join('');
                let longest = null;
                runs.forEach(rt => {
                    const len = (rt.text || '').length;
                    if (rt.font && (!longest || len > longest.len)) longest = { font: rt.font, len };
                });
                dominantFont = longest ? longest.font : null;
            } else if (formulaUnsupported) {
                // Syncfusion 算不出來的公式：顯示 Excel 存檔時的快取結果，而不是 #NAME?
                cellObj.value = excelValueToSpreadsheetValue(cell.result);
            } else if (cell.value instanceof Date) {
                // 📅 日期儲存格：ExcelJS 會回傳 JS Date，parseCellValue() 會把它當成一般物件而變成空字串
                //    （開檔後日期格整格空白）。改成轉回 Excel 序列值，搭配下方帶出的 numFmt，
                //    Syncfusion 就會依原檔格式顯示日期，回存時也會以數字 + 日期格式寫回。
                cellObj.value = excelValueToSpreadsheetValue(cell.value);
            } else {
                cellObj.value = parseCellValue(cell.value);
            }

            const effectiveFont = dominantFont || cell.font;
            if (effectiveFont) {
                if (effectiveFont.bold) cellObj.style.fontWeight = 'bold';
                if (effectiveFont.italic) cellObj.style.fontStyle = 'italic';
                if (effectiveFont.size) cellObj.style.fontSize = `${effectiveFont.size}pt`;
                if (effectiveFont.name) cellObj.style.fontFamily = effectiveFont.name;
                const fColor = fixColor(effectiveFont.color, themeColors);
                if (fColor) cellObj.style.color = fColor;
            }

            if (cell.fill && cell.fill.fgColor) {
                const bColor = fixColor(cell.fill.fgColor, themeColors);
                if (bColor) cellObj.style.backgroundColor = bColor;
            }

            if (cell.border) {
                const topCss = excelBorderSideToCss(cell.border.top, themeColors);
                if (topCss) cellObj.style.borderTop = topCss;
                const bottomCss = excelBorderSideToCss(cell.border.bottom, themeColors);
                if (bottomCss) cellObj.style.borderBottom = bottomCss;
                const leftCss = excelBorderSideToCss(cell.border.left, themeColors);
                if (leftCss) cellObj.style.borderLeft = leftCss;
                const rightCss = excelBorderSideToCss(cell.border.right, themeColors);
                if (rightCss) cellObj.style.borderRight = rightCss;
            }

            if (cell.alignment) {
                if (cell.alignment.horizontal) cellObj.style.textAlign = cell.alignment.horizontal;
                if (cell.alignment.vertical) {
                    cellObj.style.verticalAlign = cell.alignment.vertical === 'middle' ? 'middle' : cell.alignment.vertical;
                }
                if (cell.alignment.wrapText) cellObj.style.wrap = true;
            }

            // 🔢 數字格式（貨幣/百分比/日期等）：先前完全沒有回傳，導致格式化後的數字
            // 回存/重新載入後全部變成純數字，這裡把 ExcelJS 的 numFmt 原樣帶出去
            if (cell.numFmt && cell.numFmt !== 'General') {
                cellObj.format = cell.numFmt;
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

                            // 🌟 這裡原本會不論原檔有無框線，一律把合併區塊四周強制蓋成黑色實線，
                            //    導致合併儲存格回存後全部多出原本沒有的框線。框線已經在上面
                            //    依 cell.border 逐格讀取過了，這裡不再額外覆蓋/補框，保持與原檔一致。

                            // 除了左上角主格保留內容外，其餘被合併涵蓋的格子清空值
                            if (r !== top || c !== left) {
                                targetCell.value = "";
                                targetCell.formula = undefined;
                                targetCell.inMerge = true;
                            }
                        }
                    }
                }
            }
        });
    }

    formattedRows.forEach(row => {
        if (!row) return;
        if (options.skipBlankCells) {
            row.cells = row.cells.map(cell => (cell && !cell.inMerge && isInvisibleBlankCell(cell)) ? null : cell);
            while (row.cells.length > 0 && row.cells[row.cells.length - 1] === null) row.cells.pop();
        }
        row.cells.forEach(cell => { if (cell) delete cell.inMerge; });
    });

    return { name: worksheet.name, rows: formattedRows, columns: columns };
}

async function excelBufferToSpreadsheetJson(fileBuffer, options = {}) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);

    // 🎨 先解析這份檔案「自己的」佈景主題色盤，而不是整份都套用 Office 預設色，
    //    否則自訂過主題色的活頁簿，主題色儲存格開檔後顏色會整個跑掉（跟原檔肉眼看起來不一樣）
    const themeColors = parseWorkbookThemeColors(workbook);

    // 🌟 只轉換「原檔本來就看得到」的工作表，隱藏/極度隱藏的工作表不轉換也不送到前端。
    //    先前這裡是不論隱藏與否，全部工作表都轉成 JSON 送到編輯器，讓使用者也能看到原本被
    //    隱藏的工作表——立意良好，但遇到隱藏分頁裡也塞了大量資料的活頁簿時，等於平白多花
    //    好幾倍的轉換/傳輸/瀏覽器端渲染成本去處理使用者根本看不到、也不會去點的分頁，
    //    是「開檔要等好幾分鐘」的主要原因之一。改回只轉換可見分頁，跟 Excel 本身的行為一致。
    const visibleWorksheets = workbook.worksheets.filter(ws => ws.state === 'visible');
    const hiddenSheetNames = workbook.worksheets.filter(ws => ws.state !== 'visible').map(ws => ws.name);
    const sheets = visibleWorksheets.map(ws => buildSpreadsheetSheetJson(ws, themeColors, hiddenSheetNames, options));

    // activeSheetIndex：盡量開在 Excel 原本打開時所在的分頁，體感上與原檔一致
    // 注意 activeTab 是相對「全部工作表」的索引，隱藏分頁不可能是作用中分頁，
    // 但索引本身仍要換算成「只算可見分頁」的位置，不能直接拿來當 sheets 陣列的索引用
    const activeTabIndex = workbook.views && workbook.views[0] ? workbook.views[0].activeTab : 0;
    const activeWorksheet = workbook.worksheets[activeTabIndex];
    const mappedActiveIndex = activeWorksheet ? visibleWorksheets.indexOf(activeWorksheet) : -1;
    const activeSheetIndex = mappedActiveIndex >= 0 ? mappedActiveIndex : 0;

    const result = { Workbook: { sheets, activeSheetIndex } };
    return {
        result,
        // 🌟 這裡回報的是「實際送去給編輯器的可見分頁」數量/名稱，不是原檔全部工作表，
        // 這樣前端顯示的分頁數才會跟編輯器裡實際看到的分頁數一致
        sheetCount: visibleWorksheets.length,
        sheetNames: visibleWorksheets.map(ws => ws.name)
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
                return res.status(400).send(msg(req, 'serverFileNotFound'));
            }
            fileBuffer = fs.readFileSync(filePath);
        } 
        else {
            return res.status(400).send(msg(req, 'noFileOrPath'));
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
app.post('/api/spreadsheet/saveX2', uploadMemory.any(), async (req, res) => {
    try {
        const rawData = req.body.JSONData;
        if (!rawData) return res.status(400).send(msg(req, 'noDataReceived'));

        const fullModel = JSON.parse(rawData);
        if (!fullModel || !fullModel.sheets || fullModel.sheets.length === 0) {
            return res.status(400).send(msg(req, 'noValidSheet'));
        }

        // 🌟 這裡原本是用 xlsx(SheetJS) 的 aoa_to_sheet 只把「值」寫成新檔，
        //    字型/背景色/框線/對齊/數字格式/合併儲存格全部都會遺失，
        //    導致從功能區「儲存/下載」匯出的檔案格式整個消失（跟上傳/開檔用的
        //    exceljs 版轉換邏輯完全不一致）。改用與 excel-pool 回存共用的
        //    spreadsheetJsonToWorkbook，讓下載跟開檔走同一套保留樣式的轉換。
        const workbook = spreadsheetJsonToWorkbook(fullModel);
        const buf = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=spreadsheet.xlsx');
        res.send(Buffer.from(buf));
    } catch (error) {
        console.error('❌ saveX2 匯出失敗:', error.message);
        res.status(500).send(msg(req, 'serverError'));
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
app.post('/api/spreadsheet/check-table', (req, res) => {
    const { targetTable, fields, dbFile } = req.body;

    if (!targetTable || !targetTable.trim()) {
        return res.status(400).json({ success: false, message: msg(req, 'tableNameRequired') });
    }

    const tableName = targetTable.trim();
    if (!isValidIdentifier(tableName)) {
        return res.status(400).json({ success: false, message: msg(req, 'tableNameInvalid', { table: tableName }) });
    }

    const dbPath = resolveSqliteDbPath(dbFile, req.user.email);
    if (!dbPath) {
        return res.status(400).json({ success: false, message: msg(req, 'sqliteDbRequired') });
    }

    try {
        const db = getSqliteDb(dbFile, req.user.email);

        const existsRow = db.prepare(`SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type = 'table' AND name = ?`).get(tableName);
        const tableExists = existsRow.cnt > 0;

        if (tableExists) {
            return res.json({
                success: true,
                exists: true,
                message: msg(req, 'tableExists', { table: tableName, file: path.basename(dbPath) })
            });
        }

        if (!fields || !Array.isArray(fields) || fields.length === 0) {
            return res.json({
                success: true,
                exists: false,
                message: msg(req, 'tableNotExists', { table: tableName })
            });
        }

        const uniqueFields = [];
        const seen = new Set();
        for (const f of fields) {
            if (f.name && isValidIdentifier(f.name) && !seen.has(f.name.toLowerCase())) {
                seen.add(f.name.toLowerCase());
                uniqueFields.push(f);
            }
        }

        if (uniqueFields.length === 0) {
            return res.status(400).json({ success: false, message: msg(req, 'columnsRequired') });
        }

        const SQLITE_TYPE_MAP = { varchar: 'TEXT', nvarchar: 'TEXT', int: 'INTEGER', decimal: 'REAL', datetime: 'TEXT', float: 'REAL' };
        const columnDefinitions = uniqueFields.map(f => {
            const typeStr = SQLITE_TYPE_MAP[f.type] || 'TEXT';
            const nullStr = f.allowNull ? '' : ' NOT NULL';
            return `"${f.name}" ${typeStr}${nullStr}`;
        });

        const createSql = `
            CREATE TABLE "${tableName}" (
                "id" INTEGER PRIMARY KEY AUTOINCREMENT,
                ${columnDefinitions.join(',\n                ')},
                "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        console.log(`🔨 執行動態客製化建表陳述句 (SQLite: ${path.basename(dbPath)}):\n${createSql}`);
        db.exec(createSql);

        return res.status(201).json({
            success: true,
            exists: true,
            created: true,
            message: msg(req, 'tableCreated', { table: tableName, file: path.basename(dbPath) })
        });

    } catch (err) {
        console.error('❌ 動態建表任務攔截失敗:', err.message);
        res.status(500).json({ success: false, error: err.message, message: msg(req, 'sqliteOpFailed') });
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
// 💾 XLSX Template Setup 範本設定 — 存於 MongoDB（excel_import_system.templates）
// ==========================================
const templateSchema = new mongoose.Schema({
    templateCode: { type: String, required: true, unique: true },
    templateName: String,
    description: String,
    targetTable: String,
    dataStartRow: Number,
    sheetMode: String,
    sheetValue: mongoose.Schema.Types.Mixed,
    filename: String,
    dbFile: String,
    rowHeaders: [{
        excelColumn: String,
        dbFieldName: String,
        isGrouped: Boolean,
        filterType: String,
        filterExpression: String,
    }],
    timeline: {
        startColumn: String,
        endColumn: String,
        yearRow: Number,
        dbYearField: String,
        itemRow: Number,
        dbItemField: String,
        dbValueField: String,
        skipSpace: Number,
    },
    skipHeaders: [String],
    macroScript: String,
}, { timestamps: true });
const Template = mongoose.connection.useDb('excel_import_system').model('Template', templateSchema, 'templates');

app.post('/api/spreadsheet/save-template', async (req, res) => {
    const templateCode = (req.body.templateCode || '').trim();
    if (!templateCode) {
        return res.status(400).json({ success: false, message: msg(req, 'templateCodeMissing') });
    }
    try {
        await Template.findOneAndUpdate(
            { templateCode },
            { $set: { ...req.body, templateCode } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        res.json({ success: true, message: msg(req, 'templateSaved') });
    } catch (err) {
        console.error('❌ 儲存範本設定失敗:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});


// ==========================================
// ⚡ 🌟 重要整合：執行實體 Excel 動態轉置匯入（整合步驟 5 巨集引擎）
// ==========================================
// 🌟 共用核心：把一份已經讀好的 worksheet，依範本的 rowHeaders/timeline 規格
// 橫向拆解（unpivot）成一筆筆明細記錄，跑過可選的巨集沙盒，最後整批寫入指定的
// SQLite 資料表（單一交易，失敗整批回滾）。/api/spreadsheet/execute-import（來源
// 是先前上傳到伺服器磁碟的 .xlsx 檔）與 /api/spreadsheet/save-excel-to-sqlite-by-template
// （來源是前端試算表元件目前畫面內容的 JSON）共用這套邏輯，差別只在 worksheet 怎麼來。
// 巨集 sheet.get() 回傳的值：公式取 Excel 快取結果、RichText 取純文字，數字/日期維持原型別
function macroCellValue(v) {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'object' || v instanceof Date) return v;
    if (v.result !== undefined) return macroCellValue(v.result);
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text || '').join('');
    if (v.text !== undefined) return v.text;
    if (v.error !== undefined) return v.error;
    return null;
}

function normalizeCellAddress(address) {
    const addr = String(address || '').trim().toUpperCase();
    if (!/^[A-Z]{1,3}[1-9]\d*$/.test(addr)) throw new Error(`Invalid cell address: ${address}`);
    return addr;
}

// 🧩 巨集沙盒內容：注入 sheet（依儲存格位址讀寫原始工作表）與 rows（展開後的待寫入紀錄）。
//    rows 延後到腳本第一次讀取時才依欄位對應展開，所以在碰 rows 之前 sheet.set() 的值
//    會進到匯入資料；rows 展開後再 sheet.set() 已影響不到匯入，直接丟錯提醒，避免誤以為有改到。
//    沒有工作表可用時（步驟 5 試跑但步驟 1 沒選檔案），sheet 仍存在但呼叫即丟出說明原因的錯誤。
function createMacroSandbox({ worksheet, buildRows, sandboxConsole, noSheetReason, onSet, db }) {
    let rows = null;
    const requireSheet = () => { if (!worksheet) throw new Error(noSheetReason || 'No worksheet available'); };
    const sheet = {
        get name() { requireSheet(); return worksheet.name; },
        get(address) {
            requireSheet();
            return macroCellValue(worksheet.getCell(normalizeCellAddress(address)).value);
        },
        set(address, value) {
            requireSheet();
            const addr = normalizeCellAddress(address);
            if (rows !== null) throw new Error(`sheet.set('${addr}') must be called before rows is used`);
            const finalValue = value === undefined ? null : value;
            const oldValue = macroCellValue(worksheet.getCell(addr).value);
            worksheet.getCell(addr).value = finalValue;
            if (onSet) onSet(addr, finalValue, oldValue);
        },
    };
    const sandbox = { sheet, console: sandboxConsole };
    if (db) sandbox.db = db;
    Object.defineProperty(sandbox, 'rows', {
        get() { if (rows === null) rows = buildRows(); return rows; },
        set(v) { rows = v; },
        enumerable: true,
        configurable: true,
    });
    return sandbox;
}

// 依步驟 3/4 的欄位對應，把工作表的固定維度欄 + 橫向時間軸展開成一筆筆扁平紀錄
function unpivotWorksheet({ worksheet, dataStartRow, rowHeaders, timeline, skipHeaders }) {
    const startColIdx = letterToColumnIndex(timeline.startColumn);
    const endColIdx = letterToColumnIndex(timeline.endColumn);

    // 1. 橫向解析時間標頭矩陣
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

    // 2. 縱向每列遍歷解析 + Grouped 遇空向下沿用快取
    const groupedCache = {};
    const recordsToInsert = [];
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

    return recordsToInsert;
}

function runUnpivotImport({ req, db, targetTable, worksheet, dataStartRow, rowHeaders, timeline, skipHeaders, macroScript, dbPath }) {
    const buildRows = () => unpivotWorksheet({ worksheet, dataStartRow, rowHeaders, timeline, skipHeaders });
    let recordsToInsert;

    // ========================================================
    // 🌟 核心新增：VBA Alternative 巨集處理安全沙盒引擎
    // ========================================================
    if (macroScript && macroScript.trim()) {
        console.log("⚡ 偵測到內嵌自訂 JavaScript 巨集，準備進入沙盒解譯執行...");
        try {
            // 建構沙盒環境上下文，注入 sheet（儲存格讀寫）、延後展開的 rows 與 console 控制
            const sandbox = createMacroSandbox({
                worksheet,
                buildRows,
                sandboxConsole: {
                    log: (...args) => console.log("[🔮 沙盒日誌]:", ...args),
                    error: (...args) => console.error("[🔮 沙盒錯誤]:", ...args)
                }
            });

            // 建立安全的 Context
            vm.createContext(sandbox);

            // 設定 2 秒逾時防呆，防使用者不小心寫出無窮迴圈 (e.g. while(true))
            const script = new vm.Script(macroScript);
            script.runInContext(sandbox, { timeout: 2000 });

            // 將沙盒執行完畢後變更的數據重新指派回待寫入陣列（腳本沒碰 rows 時這裡才展開）
            recordsToInsert = sandbox.rows;
            if (!Array.isArray(recordsToInsert)) throw new Error('rows must be an array');
            console.log("🟢 巨集沙盒處理完畢，數據清洗校正成功。");
        } catch (macroErr) {
            console.error("❌ 巨集腳本執行期間發生崩潰，阻擋寫入交易:", macroErr.message);
            const wrapped = new Error(msg(req, 'macroError', { detail: macroErr.message }));
            wrapped.isMacroError = true;
            throw wrapped;
        }
    } else {
        recordsToInsert = buildRows();
    }

    // 3. 寫入本機 SQLite 資料庫檔案（單一交易，失敗整批回滾）
    if (recordsToInsert.length === 0) {
        return { insertedCount: 0, message: msg(req, 'importNoRows') };
    }

    const stmtCache = new Map();
    function getInsertStmt(fieldNames) {
        const cacheKey = fieldNames.join(',');
        if (stmtCache.has(cacheKey)) return stmtCache.get(cacheKey);
        const columns = fieldNames.map(f => `"${f}"`).join(', ');
        const placeholders = fieldNames.map(() => '?').join(', ');
        const stmt = db.prepare(`INSERT INTO "${targetTable}" (${columns}) VALUES (${placeholders})`);
        stmtCache.set(cacheKey, stmt);
        return stmt;
    }

    db.exec('BEGIN');
    try {
        for (const record of recordsToInsert) {
            const fieldNames = Object.keys(record).filter(isValidIdentifier);
            const stmt = getInsertStmt(fieldNames);
            const values = fieldNames.map(fieldName => {
                const value = record[fieldName];
                if (fieldName === timeline.dbValueField) {
                    return value === null || value === undefined ? null : Number(value);
                }
                return value === null || value === undefined || value === '' ? null : String(value);
            });
            stmt.run(...values);
        }
        db.exec('COMMIT');

        return {
            insertedCount: recordsToInsert.length,
            message: dbPath
                ? msg(req, 'importDoneWithDb', { count: recordsToInsert.length, file: path.basename(dbPath), table: targetTable })
                : msg(req, 'importDoneNoDb', { count: recordsToInsert.length, table: targetTable })
        };

    } catch (dbErr) {
        db.exec('ROLLBACK');
        throw dbErr;
    }
}

// ========================================================
// 🧪 步驟 5 巨集開發環境：以與 runUnpivotImport 相同的 vm 沙盒試跑腳本，
// 不寫入任何資料庫，只回傳 console 輸出與執行後的 rows 供前端除錯主控台顯示。
// ========================================================
// 巨集共用小工具（步驟 5 試跑 /run-macro 與 LikeExcel 執行 /run-template-macro 共用）
// 腳本或函式名稱不合法時回傳錯誤訊息，合法則回傳 null
function validateMacroRequest(script, entry) {
    if (typeof script !== 'string' || !script.trim()) return 'Script is empty';
    // entry：前端下拉選單選的函式名稱；有指定時先載入整份腳本，再呼叫該函式
    if (entry !== undefined && entry !== '' && !/^[A-Za-z_$][\w$]*$/.test(String(entry))) return `Invalid function name: ${entry}`;
    return null;
}

// 收集腳本 console 輸出（最多 500 行）回傳給前端顯示
function createMacroConsole() {
    const logs = [];
    const MAX_LOGS = 500;
    const push = (level) => (...args) => {
        if (logs.length >= MAX_LOGS) return;
        const text = args.map(a => typeof a === 'string' ? a : util.inspect(a, { depth: 4, breakLength: 100 })).join(' ');
        logs.push({ level, text });
    };
    const sandboxConsole = {
        log: push('log'), info: push('info'), warn: push('warn'), error: push('error'), debug: push('log'),
        table: (data) => push('log')(util.inspect(data, { depth: 4, breakLength: 100 })),
    };
    return { logs, sandboxConsole };
}

// 記錄 sheet.set() 改過的儲存格：同一格被改多次時，保留第一次的舊值、最後一次的新值
function createCellChangeTracker() {
    const cellChanges = new Map();
    const onSet = (addr, value, oldValue) => cellChanges.set(addr, {
        oldValue: cellChanges.has(addr) ? cellChanges.get(addr).oldValue : oldValue,
        value,
    });
    return { cellChanges, onSet };
}

// 在已建立好的沙盒裡執行腳本（有 entry 時接著呼叫該函式），2 秒上限，async 函式也等待完成
async function executeMacroInSandbox(sandbox, script, entry) {
    vm.createContext(sandbox);
    // 呼叫附加在腳本最後一行之後，原本的行號不受影響
    const source = entry ? `${script}\n;${entry}();` : script;
    const compiled = new vm.Script(source, { filename: 'macro_script_sandbox.js' });
    let returnValue = compiled.runInContext(sandbox, { timeout: 2000 });
    if (returnValue && typeof returnValue.then === 'function') {
        let timer;
        returnValue = await Promise.race([
            returnValue,
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Script execution timed out after 2000ms')), 2000); }),
        ]).finally(() => clearTimeout(timer));
    }
    return returnValue;
}

// 從外部複製貼上時常混進來、JavaScript 看不懂的字元（彎引號、全形標點）
const MACRO_SUSPICIOUS_CHARS = {
    '\u2018': "curly quote ‘ (use ')", '\u2019': "curly quote ’ (use ')",
    '\u201C': 'curly quote “ (use ")', '\u201D': 'curly quote ” (use ")',
    '\uFF08': 'full-width （ (use ()', '\uFF09': 'full-width ） (use ))',
    '\uFF0C': 'full-width ， (use ,)', '\uFF1B': 'full-width ； (use ;)',
    '\uFF1D': 'full-width ＝ (use =)', '\u3000': 'full-width space',
};

// 只保留沙盒檔案內的堆疊行，讓使用者看得到出錯的行號。
// 語法錯誤另外附上出錯的原始碼行與 ^ 指示位置，並點名可疑字元（彎引號、全形標點）
function formatMacroError(err) {
    const stackLines = String(err && err.stack || '').split('\n');
    const where = stackLines
        .filter(line => /^\s+at .*macro_script_sandbox\.js/.test(line) || /^macro_script_sandbox\.js:\d+/.test(line))
        .map(line => line.trim());
    const headline = err && err.name ? `${err.name}: ${err.message}` : String(err);
    const detail = [];
    if (err && err.name === 'SyntaxError' && /^macro_script_sandbox\.js:\d+$/.test(stackLines[0] || '')) {
        const sourceLine = stackLines[1] || '';
        detail.push(sourceLine, stackLines[2] || '');
        const found = [...new Set([...sourceLine].filter(c => MACRO_SUSPICIOUS_CHARS[c]))];
        found.forEach(c => detail.push(`⚠ found ${MACRO_SUSPICIOUS_CHARS[c]}`));
        // 單/雙引號沒有收尾：多半是字串被換行拆成兩行
        const quotes = (sourceLine.replace(/\\./g, '').match(/'/g) || []).length;
        const dquotes = (sourceLine.replace(/\\./g, '').match(/"/g) || []).length;
        if (!found.length && (quotes % 2 === 1 || dquotes % 2 === 1)) {
            detail.push("⚠ a string is not closed on this line – quoted strings can't continue onto the next line (use `backticks` for multi-line text)");
        }
    }
    return [headline, ...new Set(where), ...detail].join('\n    ');
}

// 🗄️ 巨集裡的 db：以「唯讀」方式開啟範本綁定的本機 SQLite 檔，只能查詢、不能修改
//    （另開一條 readOnly 連線，不共用 sqliteDbPool 的讀寫連線）。第一次呼叫時才開檔，
//    執行結束由呼叫端 close()。沒有綁定 .db 時 db 仍存在，但呼叫即丟出說明原因的錯誤。
const MACRO_DB_MAX_ROWS = 1000;
function createMacroDb(dbFile, email) {
    let conn = null;
    const open = () => {
        if (conn) return conn;
        if (!dbFile) throw new Error('db is unavailable: this template has no .db file bound');
        const dbPath = resolveSqliteDbPath(dbFile, email);
        if (!dbPath || !fs.existsSync(dbPath)) throw new Error(`db file not found: ${dbFile}`);
        conn = new DatabaseSync(dbPath, { readOnly: true });
        return conn;
    };
    // node:sqlite 回傳的是 null-prototype 物件，轉成一般物件讓腳本用起來跟平常一樣
    const plain = (row) => (row ? { ...row } : null);
    const api = {
        get name() { return dbFile || null; },
        // db.query(sql, ...params)：回傳全部結果列（最多 1000 列）
        query(sql, ...params) {
            const rows = open().prepare(String(sql)).all(...params);
            if (rows.length > MACRO_DB_MAX_ROWS) throw new Error(`Query returned ${rows.length} rows (max ${MACRO_DB_MAX_ROWS}); add WHERE/LIMIT`);
            return rows.map(plain);
        },
        // db.get(sql, ...params)：回傳第一列，沒有結果時為 null
        get(sql, ...params) { return plain(open().prepare(String(sql)).get(...params)); },
        // db.value(sql, ...params)：回傳第一列第一欄的值，沒有結果時為 null
        value(sql, ...params) {
            const row = open().prepare(String(sql)).get(...params);
            return row ? Object.values(row)[0] ?? null : null;
        },
        // db.tables()：列出所有資料表名稱
        tables() {
            return open().prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
        },
    };
    return { api, close: () => { if (conn) { try { conn.close(); } catch (e) { /* ignore */ } conn = null; } } };
}

const macroValueToText = (v) => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));

app.post('/api/spreadsheet/run-macro', async (req, res) => {
    const { script, rows, entry, fileName, sheetMode, sheetValue, dataStartRow, rowHeaders, timeline, skipHeaders, saveToFile, dbFile } = req.body || {};
    const invalid = validateMacroRequest(script, entry);
    if (invalid) return res.json({ success: false, logs: [], error: invalid, durationMs: 0 });

    const { logs, sandboxConsole } = createMacroConsole();
    const macroDb = createMacroDb(dbFile, req.user.email);
    const started = Date.now();
    try {
        // 步驟 1 有選檔案池檔案時，sheet / rows 都取自該檔案的實際工作表（與 Save DB 匯入同一套展開邏輯），
        // 否則 rows 用前端依欄位對應產生的範例資料，sheet 呼叫時提示需先選檔案
        // saveToFile：試跑成功後把 sheet.set() 改過的儲存格寫回檔案池原檔（不寫 SQLite），
        //           與 /api/excel-pool/save 覆蓋回存同一套限制：只支援 .xlsx、過了編輯期限不可寫
        const { cellChanges, onSet } = createCellChangeTracker();
        let worksheet = null;
        let workbook = null;
        let access = null;
        if (saveToFile && !fileName) throw new Error('Select an Excel file in Step 1 before saving to file');
        if (fileName) {
            access = await resolvePoolFileAccess(req, fileName);
            if (!access) throw new Error(`Excel file not found: ${fileName}`);
            if (saveToFile) {
                const ext = path.extname(access.fullPath).toLowerCase();
                if (ext !== '.xlsx') throw new Error(msg(req, 'overwriteNotSupported', { ext }));
                if (getPoolEditLock(access.userDir, path.basename(access.fullPath), access.isOwner).readOnly) {
                    throw new Error(msg(req, 'deadlinePassedReadOnly'));
                }
            }
            workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(access.fullPath);
            worksheet = sheetMode === 'name' ? workbook.getWorksheet(sheetValue) : workbook.worksheets[(Number(sheetValue) || 1) - 1];
            if (!worksheet) throw new Error(`Sheet not found: ${sheetValue}`);
        }
        const sandbox = createMacroSandbox({
            worksheet,
            buildRows: worksheet && timeline
                ? () => unpivotWorksheet({ worksheet, dataStartRow, rowHeaders: Array.isArray(rowHeaders) ? rowHeaders : [], timeline, skipHeaders })
                : () => (Array.isArray(rows) ? rows : []),
            sandboxConsole,
            noSheetReason: 'sheet is unavailable: select an Excel file in Step 1 to test against a real worksheet',
            onSet,
            db: macroDb.api,
        });
        const returnValue = await executeMacroInSandbox(sandbox, script, entry);
        const finalRows = sandbox.rows;

        let savedToFile = null;
        if (saveToFile && cellChanges.size > 0) {
            // 工作表已在記憶體中被 sheet.set() 就地改好，整份寫回原檔（與覆蓋回存一樣以原檔為底稿）
            await workbook.xlsx.writeFile(access.fullPath);
            savedToFile = path.basename(access.fullPath);
            console.log(`💾 巨集已寫回檔案池: ${savedToFile} [${worksheet.name}] ${[...cellChanges.keys()].join(', ')}`);
            const user = String(req.user.email || '').toLowerCase();
            for (const [addr, change] of cellChanges) {
                recordFileRevision({
                    ownerEmail: access.ownerEmail,
                    fileName: savedToFile,
                    type: 'cell',
                    user,
                    cellAddress: `${worksheet.name}!${addr}`,
                    oldValue: macroValueToText(change.oldValue),
                    newValue: macroValueToText(change.value),
                    reason: 'Step 5 macro',
                });
            }
            recordFileRevision({
                ownerEmail: access.ownerEmail,
                fileName: savedToFile,
                type: 'save',
                user,
                saveMode: 'overwrite',
                savedAs: null,
                auto: false,
            });
        }

        res.json({
            success: true,
            logs,
            rowCount: Array.isArray(finalRows) ? finalRows.length : 0,
            savedToFile,
            changedCells: [...cellChanges.keys()],
            returnValue: returnValue === undefined ? undefined : util.inspect(returnValue, { depth: 4 }),
            durationMs: Date.now() - started,
        });
    } catch (err) {
        res.json({ success: false, logs, error: formatMacroError(err), durationMs: Date.now() - started });
    } finally {
        macroDb.close();
    }
});

// ========================================================
// ▶ LikeExcel 頁面執行範本巨集：對「編輯器目前畫面」的內容（saveAsJson 結果）跑範本存好的腳本，
// 不寫資料庫也不寫檔案，只把 sheet.set() 的修改回傳給前端，由前端套用到網格，
// 之後照一般編輯流程（協作同步、修訂紀錄、回存/自動儲存）寫進檔案池檔案。
// 工作表挑選規則與 Save DB（save-excel-to-sqlite-by-template）相同。
// ========================================================
app.post('/api/spreadsheet/run-template-macro', async (req, res) => {
    const { templateCode, entry, spreadsheetData } = req.body || {};
    if (!spreadsheetData || !Array.isArray(spreadsheetData.sheets)) {
        return res.status(400).json({ success: false, logs: [], error: msg(req, 'invalidSpreadsheetData') });
    }
    const template = templateCode ? await Template.findOne({ templateCode: String(templateCode).trim() }).lean() : null;
    if (!template) {
        return res.status(404).json({ success: false, logs: [], error: msg(req, 'templateNotFound', { code: templateCode }) });
    }
    const { macroScript, sheetMode, sheetValue, dataStartRow, rowHeaders, timeline, skipHeaders, dbFile } = template;
    const invalid = validateMacroRequest(macroScript, entry);
    if (invalid) return res.json({ success: false, logs: [], error: invalid, durationMs: 0 });

    const { logs, sandboxConsole } = createMacroConsole();
    const macroDb = createMacroDb(dbFile, req.user.email);
    const started = Date.now();
    try {
        const workbook = spreadsheetJsonToWorkbook(spreadsheetData);
        const worksheet = sheetMode === 'index'
            ? workbook.worksheets[Number(sheetValue) - 1]
            : (workbook.getWorksheet(sheetValue) || workbook.worksheets[0]);
        if (!worksheet) throw new Error(`Sheet not found: ${sheetValue}`);

        const { cellChanges, onSet } = createCellChangeTracker();
        const sandbox = createMacroSandbox({
            worksheet,
            buildRows: () => timeline
                ? unpivotWorksheet({ worksheet, dataStartRow, rowHeaders: rowHeaders || [], timeline, skipHeaders })
                : [],
            sandboxConsole,
            onSet,
            db: macroDb.api,
        });
        const returnValue = await executeMacroInSandbox(sandbox, macroScript, entry);
        res.json({
            success: true,
            logs,
            sheetName: worksheet.name,
            changes: [...cellChanges].map(([address, c]) => ({ address, value: c.value, oldValue: macroValueToText(c.oldValue) })),
            returnValue: returnValue === undefined ? undefined : util.inspect(returnValue, { depth: 4 }),
            durationMs: Date.now() - started,
        });
    } catch (err) {
        res.json({ success: false, logs, error: formatMacroError(err), durationMs: Date.now() - started });
    } finally {
        macroDb.close();
    }
});

app.post('/api/spreadsheet/execute-import', async (req, res) => {
    const config = req.body;
    const {
        uploadedFilePath, targetTable, dataStartRow, sheetMode, sheetValue,
        rowHeaders, timeline, skipHeaders, dbFile,
        macroScript // 🌟 新增：由前端傳入的自訂 JavaScript 巨集代碼字串
    } = config;

    if (!uploadedFilePath || !fs.existsSync(uploadedFilePath)) {
        return res.status(400).json({ success: false, message: msg(req, 'uploadedExcelMissing') });
    }

    if (!isValidIdentifier(targetTable)) {
        return res.status(400).json({ success: false, message: msg(req, 'targetTableInvalid', { table: targetTable }) });
    }

    const dbPath = resolveSqliteDbPath(dbFile, req.user.email);
    if (!dbPath || !fs.existsSync(dbPath)) {
        return res.status(400).json({ success: false, message: msg(req, 'boundDbMissing') });
    }

    try {
        // 1. 取得綁定的本機 SQLite 資料庫連線（沿用連線池）
        const db = getSqliteDb(dbFile, req.user.email);

        // 2. 利用 exceljs 讀取指定的 Excel 檔案
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(uploadedFilePath);

        const worksheet = sheetMode === 'index'
            ? workbook.worksheets[Number(sheetValue) - 1]
            : workbook.getWorksheet(sheetValue);

        if (!worksheet) {
            return res.status(400).json({ success: false, message: msg(req, 'sheetNotFound', { sheet: sheetValue }) });
        }

        const result = runUnpivotImport({ req, db, targetTable, worksheet, dataStartRow, rowHeaders, timeline, skipHeaders, macroScript, dbPath });
        return res.json({ success: true, ...result });

    } catch (err) {
        console.error('❌ 執行試算表解析匯入發生核心崩潰:', err);
        const status = err.isMacroError ? 400 : 500;
        return res.status(status).json({ success: false, error: err.message, message: err.isMacroError ? err.message : msg(req, 'importFailed') });
    }
});

// ==========================================
// 🌟 依範本規格，把「前端試算表元件目前畫面的 JSON 內容」直接解構寫入該範本綁定的
// 本機 SQLite 資料庫 —— 這是 likeexcel.tsx「Save DB」按鈕實際呼叫的路由，取代舊的
// save-excel-to-mssql-by-template（該路由從未存在於本檔案，只存在於已淘汰的
// src/pages/index.js，呼叫它一定會落到這裡的 404 catch-all，回傳 HTML 而不是 JSON）。
// 與 execute-import 的差異只在來源：這裡不需要先把檔案上傳到伺服器磁碟，而是直接用
// spreadsheetJsonToWorkbook() 把 saveAsJson() 的結果轉成 ExcelJS 活頁簿再解析。
// ==========================================
app.post('/api/spreadsheet/save-excel-to-sqlite-by-template', async (req, res) => {
    const { spreadsheetData, templateCode } = req.body;

    if (!spreadsheetData || !Array.isArray(spreadsheetData.sheets)) {
        return res.status(400).json({ success: false, message: msg(req, 'invalidSpreadsheetData') });
    }
    if (!templateCode) {
        return res.status(400).json({ success: false, message: msg(req, 'templateCodeMissing') });
    }

    const template = await Template.findOne({ templateCode: String(templateCode).trim() }).lean();
    if (!template) {
        return res.status(404).json({ success: false, message: msg(req, 'templateNotFound', { code: templateCode }) });
    }

    const { targetTable, dataStartRow, sheetMode, sheetValue, rowHeaders, timeline, skipHeaders, dbFile, macroScript } = template;

    if (!isValidIdentifier(targetTable)) {
        return res.status(400).json({ success: false, message: msg(req, 'templateTableInvalid', { code: templateCode, table: targetTable }) });
    }

    const dbPath = resolveSqliteDbPath(dbFile, req.user.email);
    if (!dbPath || !fs.existsSync(dbPath)) {
        return res.status(400).json({ success: false, message: msg(req, 'templateDbMissing', { code: templateCode }) });
    }

    try {
        const db = getSqliteDb(dbFile, req.user.email);
        const workbook = spreadsheetJsonToWorkbook(spreadsheetData);

        const worksheet = sheetMode === 'index'
            ? workbook.worksheets[Number(sheetValue) - 1]
            : (workbook.getWorksheet(sheetValue) || workbook.worksheets[0]);

        if (!worksheet) {
            return res.status(400).json({ success: false, message: msg(req, 'sheetNotFound', { sheet: sheetValue }) });
        }

        const result = runUnpivotImport({ req, db, targetTable, worksheet, dataStartRow, rowHeaders, timeline, skipHeaders, macroScript, dbPath });
        return res.json({ success: true, ...result });

    } catch (err) {
        console.error('❌ 依範本寫入本機 SQLite 發生核心崩潰:', err);
        const status = err.isMacroError ? 400 : 500;
        return res.status(status).json({ success: false, error: err.message, message: err.isMacroError ? err.message : msg(req, 'importFailed') });
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
            return { success: false, errorKey: 'googleTokenInvalid' };
        }
        const tokenInfo = await tokenInfoRes.json();
        if (tokenInfo.aud !== GOOGLE_CLIENT_ID) {
            return { success: false, errorKey: 'googleAudMismatch' };
        }

        // 2. 取得使用者基本資料
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!userInfoRes.ok) {
            return { success: false, errorKey: 'googleUserInfoFailed' };
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
        return res.status(400).json({ success: false, message: msg(req, 'googleTokenMissing') });
    }
    const result = await verifyGoogleAccessToken(access_token);
    if (!result.success) {
        return res.status(401).json({ success: false, message: result.errorKey ? msg(req, result.errorKey) : result.error });
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
        return res.status(400).json({ success: false, message: msg(req, 'registerFieldsMissing') });
    }
    if (password.length < 8) {
        return res.status(400).json({ success: false, message: msg(req, 'passwordTooShort') });
    }
    try {
        const normalizedEmail = email.toLowerCase().trim();
        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) {
            return res.status(409).json({ success: false, message: msg(req, 'emailTaken') });
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({ email: normalizedEmail, passwordHash, name });
        const token = jwt.sign({ email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ success: true, token, user: { email: user.email, name: user.name } });
    } catch (err) {
        console.error('❌ 註冊失敗:', err.message);
        res.status(500).json({ success: false, message: msg(req, 'registerFailed') });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: msg(req, 'loginFieldsMissing') });
    }
    try {
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        const match = user && await bcrypt.compare(password, user.passwordHash);
        if (!match) {
            return res.status(401).json({ success: false, message: msg(req, 'loginInvalid') });
        }
        const token = jwt.sign({ email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ success: true, token, user: { email: user.email, name: user.name } });
    } catch (err) {
        console.error('❌ 登入失敗:', err.message);
        res.status(500).json({ success: false, message: msg(req, 'loginFailed') });
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

// canWrite：每次收到文件更新時才判斷，這樣編輯期限在連線期間到期也會立即生效
function setupYWebsocketConnection(ws, roomName, canWrite = () => true) {
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
          // ⏰ 已過編輯期限的共同編輯者：只允許 sync step1（向伺服器索取目前文件內容），
          //    丟棄 step2/update，避免繞過前端的唯讀限制把修改推給其他人（再被擁有者的自動儲存寫回檔案）
          if (decoding.peekVarUint(decoder) !== syncProtocol.messageYjsSyncStep1 && !canWrite()) break;
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

// 與前端 likeexcel.tsx 的 sanitizeForRoom 相同規則，用來核對房號確實對應到宣稱的擁有者/檔案
const sanitizeForRoom = (value) => String(value).replace(/[^a-zA-Z0-9._-]/g, '_');

async function resolvePoolRoomAccess(roomName, query) {
  let user;
  try { user = jwt.verify(String(query.token || ''), JWT_SECRET); } catch (e) { return null; }
  const email = String(user.email || '').toLowerCase().trim();
  const ownerRaw = String(query.owner || '');
  const fileName = path.basename(String(query.file || ''));
  if (!email || !ownerRaw || !fileName) return null;
  if (roomName !== `excel-room-pool-${sanitizeForRoom(ownerRaw)}-${sanitizeForRoom(fileName)}`) return null;

  const ownerEmail = ownerRaw.toLowerCase().trim();
  const isOwner = ownerEmail === email;
  if (!isOwner && !(await FileShare.findOne({ ownerEmail, fileName, invitedEmail: email }))) return null;

  const userDir = getUserPoolDir(ownerEmail);
  const fullPath = resolvePoolFile(userDir, fileName);
  if (!fullPath || !fs.existsSync(fullPath)) return null;
  return { canWrite: () => !getPoolEditLock(userDir, fileName, isOwner).readOnly };
}

// 在 server.on('upgrade') 時，必須支援帶有 query string 的路徑比對
server.on('upgrade', (request, socket, head) => {
  const { pathname, query } = url.parse(request.url, true);

  // 🔴 注意：比對路徑時，不能直接用 request.url === '/excel-room-...'
  // 必須用 pathname 來比對，否則帶了 ?auth_token 欄位後會比對失敗而 404！
  if (pathname.startsWith('/excel-room-pool-')) {
    // 🔐 檔案池協作房：必須帶登入權杖 + 擁有者/檔名，驗證房號與存取權限後才允許連線，
    //    並依編輯期限決定這條連線能不能推送修改
    resolvePoolRoomAccess(pathname.slice(1), query)
      .then((access) => {
        if (!access) { socket.destroy(); return; }
        wss.handleUpgrade(request, socket, head, (ws) => {
          setupYWebsocketConnection(ws, pathname.slice(1), access.canWrite);
        });
      })
      .catch(() => socket.destroy());
  } else if (pathname.startsWith('/excel-room-')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      const roomName = pathname.slice(1); // 去掉開頭斜線，對應前端 roomName
      setupYWebsocketConnection(ws, roomName);
    });
  } else {
    socket.destroy();
  }
});

// ==========================================
// 📋 取得所有 XLSX Template Setup 範本（來自 MongoDB，取代舊的 MSSQL xlsx2dbsetL1/L2/L3）
// ==========================================
app.get('/api/spreadsheet/get-templates', async (req, res) => {
  try {
    const templates = await Template.find().sort({ templateCode: 1 }).lean();
    res.json(templates.map(t => ({
      ID: t.templateCode,
      name: t.templateName,
      dbname: t.targetTable,
      descriptionl: t.description,
      sheet: t.sheetValue,
      rowstart: t.dataStartRow,
      filename: t.filename,
      dbFile: t.dbFile,
      rowHeaders: t.rowHeaders,
      skipHeaders: t.skipHeaders,
      macroScript: t.macroScript,
      l3Settings: {
        startCol: t.timeline?.startColumn,
        endCol: t.timeline?.endColumn,
        yearRow: t.timeline?.yearRow,
        itemRow: t.timeline?.itemRow,
        skipSpace: t.timeline?.skipSpace,
        dbYearField: t.timeline?.dbYearField,
        dbItemField: t.timeline?.dbItemField,
        dbValueField: t.timeline?.dbValueField,
      },
    })));
  } catch (err) {
    console.error('❌ 讀取範本清單失敗:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});


// ==========================================
// 📋 取得指定資料表的所有欄位名稱 (請確認這段程式碼存在於 port 3000 的 Express 檔案中)
// ==========================================
app.get('/api/table-columns', (req, res) => {
  const tableName = req.query.table;
  const dbFile = req.query.dbFile;

  if (!tableName || !isValidIdentifier(String(tableName))) {
    return res.status(400).json({ success: false, message: msg(req, 'tableNameRequiredId') });
  }

  const dbPath = resolveSqliteDbPath(dbFile, req.user.email);
  if (!dbPath || !fs.existsSync(dbPath)) {
    return res.status(400).json({ success: false, message: msg(req, 'sqliteDbRequired') });
  }

  try {
    const db = getSqliteDb(dbFile, req.user.email);
    const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all();

    // This now sends an array of objects: [{ name: 'Col1', type: 'TEXT' }, ...]
    res.json({ success: true, columns: columns.map(c => ({ name: c.name, type: c.type })) });
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
        return res.status(400).json({ success: false, message: msg(req, 'cellAddressRequired') });
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