// ==========================================
// 🌐 API 回應訊息多語系 (en / ja / zh-TW)
//    前端 apiFetch 會在每個請求帶上 Accept-Language（見 my-app-pt1/src/config/apiBase.ts），
//    這裡依該標頭挑選語言；沒帶或無法辨識時維持原本的繁體中文，
//    讓非瀏覽器的呼叫端（curl、腳本）行為不變。
//    用法：msg(req, 'fileNotFound')、msg(req, 'invited', { email })
// ==========================================

const MESSAGES = {
    'zh-TW': {
        // 🔐 Auth middleware
        authMissingToken: '未登入或缺少驗證權杖',
        authInvalidToken: '權杖無效或已過期',

        // 🗄️ 本機 SQLite 資料庫檔案 / DB Console
        dbFileRequired: '請輸入資料庫檔名',
        dbFileInvalid: '無效的資料庫檔名',
        dbBoundExisting: '已綁定既有的本機 SQLite 資料庫檔案：{file}',
        dbCreated: '已成功建立本機 SQLite 資料庫檔案：{file}',
        sqlRequired: '請輸入要執行的 SQL 指令',
        sqlSelectDb: '請先選擇一個已存在的本機 SQLite 資料庫檔案',
        sqlQueryDone: '查詢完成，共 {count} 筆結果。',
        sqlRunDone: '執行完成，共影響 {count} 列。',
        sqlExecDone: '執行完成（多語句或 DDL 腳本，無回傳資料）。',

        // 📂 Excel 檔案池
        noFileUploaded: '未偵測到上傳檔案',
        uploadedCount: '成功上傳 {count} 個檔案',
        fileNotFound: '找不到指定檔案',
        nameEmpty: '名稱不可空白',
        nameTooLong: '名稱長度不可超過 120 個字元',
        nameUpdated: '名稱已更新',
        deadlineInvalid: '無效的期限時間',
        deadlineSet: '編輯期限已設定',
        deadlineCleared: '編輯期限已清除',
        fileNotFoundOrNoAccess: '找不到指定檔案，或您沒有此檔案的存取權限',
        formatNotEditable: '.{ext} 格式無法於線上編輯器開啟，請先下載並另存為 .xlsx 後再上傳',
        sourceNotFoundOrNoAccess: '找不到來源檔案，或您沒有此檔案的存取權限',
        deadlinePassedReadOnly: '已超過編輯期限，此檔案目前為唯讀，無法回存',
        invalidSpreadsheetData: '無效的試算表資料結構',
        overwriteNotSupported: '{ext} 檔案不支援覆蓋回存 (會遺失巨集或原始格式)，請改用另存新檔',
        overwritten: '已覆蓋原檔',
        savedAs: '已另存為「{name}」',
        fileDeleted: '檔案已刪除',
        inviteEmailInvalid: '請提供有效的 email',
        inviteSelf: '不能邀請自己',
        invited: '已邀請 {email} 共同編輯',
        inviteRevoked: '已取消 {email} 的共同編輯權限',

        // 📄 Spreadsheet 開檔 / Syncfusion 存檔
        serverFileNotFound: '伺服器路徑上找不到檔案',
        noFileOrPath: '未上傳檔案，也未提供檔案路徑',
        noDataReceived: '未收到任何資料',
        noValidSheet: '找不到有效的工作表',
        serverError: '伺服器錯誤',

        // 🧱 目標資料表檢查 / 建立
        tableNameRequired: '請先輸入目標資料庫 Table Name',
        tableNameInvalid: '無效的 Table Name：{table}（僅允許英數字與底線）',
        sqliteDbRequired: '請先建立或選擇本機 SQLite 資料庫檔案',
        tableExists: '資料表 [{table}] 已經存在於 {file} 中。',
        tableNotExists: '資料表 [{table}] 目前不存在。',
        columnsRequired: '請至少提供一個有效的資料行名稱（僅允許英數字與底線）',
        tableCreated: '資料表 [{table}] 已成功建立於 {file}！',
        sqliteOpFailed: '操作本機 SQLite 執行核心指令時失敗',
        tableNameRequiredId: '必須提供有效的資料表名稱',

        // 📋 範本 / 匯入
        templateCodeMissing: '缺少範本識別碼 (templateCode)',
        templateSaved: '同步配置成功！',
        importNoRows: '解析完成（或被巨集過濾空），未發現合規數據列。',
        importDoneWithDb: '成功解構並對應範本欄位，已將 {count} 筆明細數據寫入本機 SQLite 資料庫 [{file}]的資料表 [{table}]。',
        importDoneNoDb: '成功解構並對應範本欄位，已將 {count} 筆明細數據寫入本機 SQLite 資料庫的資料表 [{table}]。',
        macroError: '巨集指令執行錯誤，已攔截阻擋寫入。錯誤詳情: {detail}',
        uploadedExcelMissing: '伺服器找不到先前上傳的 Excel 檔案實體，請重新上傳。',
        targetTableInvalid: '無效的目標資料表名稱：{table}',
        boundDbMissing: '找不到已綁定的本機 SQLite 資料庫檔案，請先於步驟中建立/選擇資料庫檔案。',
        sheetNotFound: '找不到指定的 Sheet 工作表: {sheet}',
        importFailed: '解析或寫入本機 SQLite 資料庫時失敗',
        templateNotFound: '找不到範本 [{code}]，請確認是否已於 Setup 頁面建立並儲存',
        templateTableInvalid: '範本 [{code}] 的目標資料表名稱無效：{table}',
        templateDbMissing: '找不到範本 [{code}] 綁定的本機 SQLite 資料庫檔案，請先於 Setup 頁面重新綁定。',

        // 📝 儲存格修改紀錄
        cellAddressRequired: '必須提供儲存格位址',

        // 🔑 登入 (Google / email+password)
        googleTokenInvalid: 'Google access token 無效或已過期',
        googleAudMismatch: 'Access token 並非核發給本應用程式',
        googleUserInfoFailed: '讀取 Google 使用者資料失敗',
        googleTokenMissing: '缺少 Google access token',
        registerFieldsMissing: '缺少 email、password 或 name',
        passwordTooShort: '密碼至少需要 8 個字元',
        emailTaken: '此 email 已被註冊',
        registerFailed: '註冊失敗',
        loginFieldsMissing: '缺少 email 或 password',
        loginInvalid: 'Email 或密碼錯誤',
        loginFailed: '登入失敗',
    },

    en: {
        authMissingToken: 'Not signed in, or the authentication token is missing',
        authInvalidToken: 'The token is invalid or has expired',

        dbFileRequired: 'Please enter a database file name',
        dbFileInvalid: 'Invalid database file name',
        dbBoundExisting: 'Bound to existing local SQLite database file: {file}',
        dbCreated: 'Created local SQLite database file: {file}',
        sqlRequired: 'Please enter an SQL statement to run',
        sqlSelectDb: 'Please select an existing local SQLite database file first',
        sqlQueryDone: 'Query finished: {count} row(s).',
        sqlRunDone: 'Done: {count} row(s) affected.',
        sqlExecDone: 'Done (multi-statement or DDL script, no rows returned).',

        noFileUploaded: 'No uploaded file was detected',
        uploadedCount: 'Uploaded {count} file(s)',
        fileNotFound: 'File not found',
        nameEmpty: 'Name cannot be empty',
        nameTooLong: 'Name cannot be longer than 120 characters',
        nameUpdated: 'Name updated',
        deadlineInvalid: 'Invalid deadline',
        deadlineSet: 'Edit deadline set',
        deadlineCleared: 'Edit deadline cleared',
        fileNotFoundOrNoAccess: 'File not found, or you do not have access to it',
        formatNotEditable: '.{ext} files cannot be opened in the online editor. Download it, save it as .xlsx, and upload it again',
        sourceNotFoundOrNoAccess: 'Source file not found, or you do not have access to it',
        deadlinePassedReadOnly: 'The edit deadline has passed. This file is read-only and cannot be saved',
        invalidSpreadsheetData: 'Invalid spreadsheet data',
        overwriteNotSupported: '{ext} files cannot be overwritten (macros or original formatting would be lost). Use Save as new file instead',
        overwritten: 'Original file overwritten',
        savedAs: 'Saved as "{name}"',
        fileDeleted: 'File deleted',
        inviteEmailInvalid: 'Please enter a valid email',
        inviteSelf: 'You cannot invite yourself',
        invited: 'Invited {email} to co-edit',
        inviteRevoked: 'Removed co-editing access for {email}',

        serverFileNotFound: 'File not found on server path',
        noFileOrPath: 'No file uploaded or file path provided',
        noDataReceived: 'No data received',
        noValidSheet: 'No valid sheet found',
        serverError: 'Server Error',

        tableNameRequired: 'Please enter the target table name first',
        tableNameInvalid: 'Invalid table name: {table} (letters, digits and underscores only)',
        sqliteDbRequired: 'Please create or select a local SQLite database file first',
        tableExists: 'Table [{table}] already exists in {file}.',
        tableNotExists: 'Table [{table}] does not exist yet.',
        columnsRequired: 'Please provide at least one valid column name (letters, digits and underscores only)',
        tableCreated: 'Table [{table}] created in {file}!',
        sqliteOpFailed: 'The local SQLite operation failed',
        tableNameRequiredId: 'Table name is required and must be a valid identifier',

        templateCodeMissing: 'Missing template code (templateCode)',
        templateSaved: 'Configuration saved!',
        importNoRows: 'Parsing finished (or everything was filtered out by the macro); no valid data rows found.',
        importDoneWithDb: 'Mapped the template fields and wrote {count} detail row(s) to table [{table}] in local SQLite database [{file}].',
        importDoneNoDb: 'Mapped the template fields and wrote {count} detail row(s) to table [{table}] in the local SQLite database.',
        macroError: 'The macro script failed, so nothing was written. Details: {detail}',
        uploadedExcelMissing: 'The server cannot find the previously uploaded Excel file. Please upload it again.',
        targetTableInvalid: 'Invalid target table name: {table}',
        boundDbMissing: 'The bound local SQLite database file cannot be found. Please create or select a database file first.',
        sheetNotFound: 'Worksheet not found: {sheet}',
        importFailed: 'Failed to parse or write to the local SQLite database',
        templateNotFound: 'Template [{code}] not found. Make sure it was created and saved on the Setup page',
        templateTableInvalid: 'Template [{code}] has an invalid target table name: {table}',
        templateDbMissing: 'The local SQLite database file bound to template [{code}] cannot be found. Please re-bind it on the Setup page.',

        cellAddressRequired: 'Cell address is required',

        googleTokenInvalid: 'The Google access token is invalid or has expired',
        googleAudMismatch: 'The access token was not issued for this application',
        googleUserInfoFailed: 'Failed to read the Google user profile',
        googleTokenMissing: 'Missing Google access token',
        registerFieldsMissing: 'Email, password and name are required',
        passwordTooShort: 'Password must be at least 8 characters',
        emailTaken: 'This email is already registered',
        registerFailed: 'Registration failed',
        loginFieldsMissing: 'Email and password are required',
        loginInvalid: 'Incorrect email or password',
        loginFailed: 'Sign-in failed',
    },

    ja: {
        authMissingToken: 'ログインしていないか、認証トークンがありません',
        authInvalidToken: 'トークンが無効か、有効期限が切れています',

        dbFileRequired: 'データベースファイル名を入力してください',
        dbFileInvalid: 'データベースファイル名が無効です',
        dbBoundExisting: '既存のローカル SQLite データベースファイルに接続しました：{file}',
        dbCreated: 'ローカル SQLite データベースファイルを作成しました：{file}',
        sqlRequired: '実行する SQL 文を入力してください',
        sqlSelectDb: '先に既存のローカル SQLite データベースファイルを選択してください',
        sqlQueryDone: 'クエリ完了：{count} 件。',
        sqlRunDone: '実行完了：{count} 行に影響しました。',
        sqlExecDone: '実行完了（複数文または DDL スクリプトのため、結果行はありません）。',

        noFileUploaded: 'アップロードされたファイルが見つかりません',
        uploadedCount: '{count} 件のファイルをアップロードしました',
        fileNotFound: 'ファイルが見つかりません',
        nameEmpty: '名前を空にすることはできません',
        nameTooLong: '名前は 120 文字以内で入力してください',
        nameUpdated: '名前を更新しました',
        deadlineInvalid: '期限の日時が無効です',
        deadlineSet: '編集期限を設定しました',
        deadlineCleared: '編集期限を解除しました',
        fileNotFoundOrNoAccess: 'ファイルが見つからないか、アクセス権限がありません',
        formatNotEditable: '.{ext} 形式はオンラインエディターで開けません。ダウンロードして .xlsx で保存し、再度アップロードしてください',
        sourceNotFoundOrNoAccess: '元のファイルが見つからないか、アクセス権限がありません',
        deadlinePassedReadOnly: '編集期限を過ぎているため、このファイルは読み取り専用で保存できません',
        invalidSpreadsheetData: 'スプレッドシートのデータ構造が無効です',
        overwriteNotSupported: '{ext} ファイルは上書き保存できません（マクロや元の書式が失われるため）。新規ファイルとして保存してください',
        overwritten: '元のファイルを上書きしました',
        savedAs: '「{name}」として保存しました',
        fileDeleted: 'ファイルを削除しました',
        inviteEmailInvalid: '有効なメールアドレスを入力してください',
        inviteSelf: '自分自身を招待することはできません',
        invited: '{email} を共同編集に招待しました',
        inviteRevoked: '{email} の共同編集権限を取り消しました',

        serverFileNotFound: 'サーバー上のパスにファイルが見つかりません',
        noFileOrPath: 'ファイルがアップロードされておらず、ファイルパスも指定されていません',
        noDataReceived: 'データを受信していません',
        noValidSheet: '有効なシートが見つかりません',
        serverError: 'サーバーエラー',

        tableNameRequired: '先に対象のテーブル名を入力してください',
        tableNameInvalid: 'テーブル名が無効です：{table}（英数字とアンダースコアのみ使用できます）',
        sqliteDbRequired: '先にローカル SQLite データベースファイルを作成または選択してください',
        tableExists: 'テーブル [{table}] は {file} に既に存在します。',
        tableNotExists: 'テーブル [{table}] はまだ存在しません。',
        columnsRequired: '有効な列名を 1 つ以上指定してください（英数字とアンダースコアのみ使用できます）',
        tableCreated: 'テーブル [{table}] を {file} に作成しました！',
        sqliteOpFailed: 'ローカル SQLite の操作に失敗しました',
        tableNameRequiredId: '有効なテーブル名を指定してください',

        templateCodeMissing: 'テンプレートコード (templateCode) がありません',
        templateSaved: '設定を保存しました！',
        importNoRows: '解析が完了しました（またはマクロですべて除外されました）。有効なデータ行はありません。',
        importDoneWithDb: 'テンプレートの項目を対応付け、{count} 件の明細をローカル SQLite データベース [{file}] のテーブル [{table}] に書き込みました。',
        importDoneNoDb: 'テンプレートの項目を対応付け、{count} 件の明細をローカル SQLite データベースのテーブル [{table}] に書き込みました。',
        macroError: 'マクロの実行でエラーが発生したため、書き込みを中止しました。詳細: {detail}',
        uploadedExcelMissing: '以前アップロードされた Excel ファイルがサーバーに見つかりません。もう一度アップロードしてください。',
        targetTableInvalid: '対象テーブル名が無効です：{table}',
        boundDbMissing: '紐付けられたローカル SQLite データベースファイルが見つかりません。先にデータベースファイルを作成または選択してください。',
        sheetNotFound: '指定されたワークシートが見つかりません: {sheet}',
        importFailed: 'ローカル SQLite データベースへの解析または書き込みに失敗しました',
        templateNotFound: 'テンプレート [{code}] が見つかりません。Setup ページで作成・保存されているか確認してください',
        templateTableInvalid: 'テンプレート [{code}] の対象テーブル名が無効です：{table}',
        templateDbMissing: 'テンプレート [{code}] に紐付けられたローカル SQLite データベースファイルが見つかりません。Setup ページで再度紐付けてください。',

        cellAddressRequired: 'セル番地を指定してください',

        googleTokenInvalid: 'Google アクセストークンが無効か、有効期限が切れています',
        googleAudMismatch: 'このアクセストークンは本アプリケーション向けに発行されたものではありません',
        googleUserInfoFailed: 'Google ユーザー情報の取得に失敗しました',
        googleTokenMissing: 'Google アクセストークンがありません',
        registerFieldsMissing: 'メールアドレス、パスワード、名前は必須です',
        passwordTooShort: 'パスワードは 8 文字以上にしてください',
        emailTaken: 'このメールアドレスは既に登録されています',
        registerFailed: '登録に失敗しました',
        loginFieldsMissing: 'メールアドレスとパスワードは必須です',
        loginInvalid: 'メールアドレスまたはパスワードが正しくありません',
        loginFailed: 'ログインに失敗しました',
    },
};

const DEFAULT_LANG = 'zh-TW';

// Accept-Language: "ja", "zh-TW", "en-US,en;q=0.9" … → 'ja' | 'zh-TW' | 'en'
// 沒帶或無法辨識 → 繁體中文（原本的行為）
function resolveLang(req) {
    const header = String((req && req.headers && req.headers['accept-language']) || '');
    const tags = header.split(',').map(part => part.split(';')[0].trim().toLowerCase()).filter(Boolean);
    for (const tag of tags) {
        if (tag.startsWith('ja')) return 'ja';
        if (tag.startsWith('zh')) return 'zh-TW';
        if (tag.startsWith('en')) return 'en';
    }
    return DEFAULT_LANG;
}

function interpolate(template, params) {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match));
}

// 缺漏的翻譯：退回英文（英文也沒有就退回繁中、再不行回傳 key 本身），且每個 key 只記一次 log
const warnedMissing = new Set();
function lookup(lang, key) {
    const text = MESSAGES[lang] && MESSAGES[lang][key];
    if (text !== undefined) return text;
    const warnKey = `${lang}:${key}`;
    if (!warnedMissing.has(warnKey)) {
        warnedMissing.add(warnKey);
        console.warn(`⚠️ [i18n] 缺少 ${lang} 翻譯: ${key}`);
    }
    return MESSAGES.en[key] ?? MESSAGES[DEFAULT_LANG][key] ?? key;
}

function msg(req, key, params) {
    return interpolate(lookup(resolveLang(req), key), params);
}

module.exports = { msg, resolveLang, MESSAGES };
