# Quanta XLSM 實作變更紀錄

## 1. 目的

本次修改讓 WebExcelPrj 可以讀取 `Quanta_NBPC_New PJ sheet_250717.xlsm`，並完成以下功能：

- 三個 Excel 頁面皆可上傳與開啟 `.xlsm`。
- 可取得完整工作表清單、hidden 狀態、列數與欄數。
- 可切換工作表並以每批 200 列載入大型工作表。
- 公式使用 Excel 檔案內已儲存的快取結果，不在瀏覽器重新計算。
- Mapping Setup 支援完全手動的固定欄位與重複欄組匯入。
- 重複欄組支援預覽、欄位驗證及 MSSQL bulk append import。
- 強化檔案路徑與 SQL 識別字安全限制。

## 2. 修改檔案

### 後端

- `WebSideAPI/index.js`
  - 擴充上傳、開檔與資料庫匯入 API。
  - 加入工作表資訊 API。
  - 加入重複欄組預覽及正式匯入 API。
  - 強化既有 timeline import 與建表 API 的安全驗證。

- `WebSideAPI/spreadsheetSupport.js`
  - 新增共用 Excel、路徑、SQL 與重複欄組處理函式。
  - 新增最多 3 份、10 分鐘 TTL 的 ExcelJS 工作簿快取。

- `WebSideAPI/test/spreadsheetSupport.test.js`
  - 新增 Node 內建測試及 Quanta 樣本驗證。

- `WebSideAPI/package.json`
  - `npm test` 改為執行 `node --test test/*.test.js`。

### 前端

- `my-app-pt1/src/hooks/useWorkbook.ts`
  - 新增三個 Excel 頁面共用的工作簿 hook。

- `my-app-pt1/src/pages/likeexcel.tsx`
  - 整合 XLSM 上傳、工作表選擇及分批載入。

- `my-app-pt1/src/pages/likeexcelG.tsx`
  - 整合共用工作簿流程。
  - 程式載入期間不產生協作儲存格異動。

- `my-app-pt1/src/pages/likeexcelAD.tsx`
  - 整合共用工作簿流程。
  - 移除硬編碼的 `C:\Alex\...` 路徑。
  - 程式載入期間不產生儲存格異動紀錄。

- `my-app-pt1/src/pages/ExcelMappingSetup.tsx`
  - 新增 `.xlsm` 上傳、fileId、工作表清單與重複欄組設定。

- `.gitignore`
  - 忽略 `WebSideAPI/uploads/` 內的執行期上傳檔案。

## 3. 後端 Excel 功能

### 3.1 上傳 API

`POST /api/spreadsheet/upload`

支援副檔名：

- `.xlsx`
- `.xlsm`
- `.xls`

新增回傳欄位：

```json
{
  "success": true,
  "fileId": "file-xxxxxxxx.xlsm",
  "originalName": "Quanta_NBPC_New PJ sheet_250717.xlsm",
  "fileName": "file-xxxxxxxx.xlsm",
  "filePath": "相容舊程式的伺服器路徑"
}
```

限制：

- 上傳檔案大小上限為 25 MB。
- `fileId` 只包含伺服器產生的檔名，不包含目錄資訊。
- 前端後續請求使用 `fileId`，不再重複上傳同一檔案。

### 3.2 安全來源解析

新增安全路徑解析規則：

- `fileId` 只能解析到 `WebSideAPI/uploads`。
- 舊版 `filePath` 只允許位於：
  - `WebSideAPI/uploads`
  - 專案根目錄
  - `EXCEL_ALLOWED_READ_ROOTS` 指定的額外目錄
- `EXCEL_ALLOWED_READ_ROOTS` 可使用 Windows path delimiter `;` 設定多個目錄。
- `../`、絕對外部路徑及 uploads 以外的非法 `fileId` 會被拒絕。

### 3.3 工作簿快取

ExcelJS 工作簿快取設定：

- 最多保留 3 份工作簿。
- TTL 為 10 分鐘。
- 以檔案完整路徑及修改時間判斷快取是否有效。
- 超過數量時移除最久未使用的工作簿。

### 3.4 工作表資訊 API

新增：

`POST /api/spreadsheet/workbook-info`

請求：

```json
{
  "fileId": "file-xxxxxxxx.xlsm"
}
```

回應內容：

```json
{
  "success": true,
  "sheets": [
    {
      "index": 1,
      "name": "NBPC PJ sheet(2507)",
      "sheetId": 2,
      "hidden": false,
      "rowCount": 7672,
      "columnCount": 50
    }
  ]
}
```

### 3.5 分批開檔 API

修改：

`POST /api/spreadsheet/open`

支援參數：

```json
{
  "fileId": "file-xxxxxxxx.xlsm",
  "sheetName": "NBPC PJ sheet(2507)",
  "startRow": 1,
  "rowCount": 200,
  "formulaMode": "cached"
}
```

行為：

- `startRow` 使用 1-based。
- `rowCount` 預設 200，上限 1000。
- 沒有指定 `sheetName` 時維持讀取第一張實體工作表的舊行為。
- `formulaMode: "cached"` 只回傳公式儲存的結果。
- 舊呼叫未指定 `formulaMode` 時仍保留公式內容。
- 空白且沒有格式的儲存格回傳 `null`，不建立空 style。
- 超過最後一列的請求回傳空資料，不會重複最後一列。

新增分頁 metadata：

```json
{
  "sheetName": "NBPC PJ sheet(2507)",
  "startRow": 1,
  "nextStartRow": 201,
  "totalRows": 7672,
  "hasMore": true
}
```

### 3.6 儲存格值解析

`parseCellValue` 現在統一處理：

- 公式快取 `result`
- Rich text
- JavaScript `Date`
- Hyperlink 顯示文字
- 一般字串、數字及布林值
- 空值

公式快取範例：

```json
{
  "formula": "IF(...) ",
  "result": 2
}
```

在 `cached` 模式下前端收到的值為 `2`，不會在 Syncfusion 內重新計算公式。

## 4. 前端工作簿流程

三個頁面使用相同的 `useWorkbook` 流程：

1. 使用者選擇 Excel 檔案。
2. 上傳一次並取得 `fileId`。
3. 呼叫 `workbook-info` 取得所有工作表。
4. 自動選擇第一張可見工作表。
5. 呼叫 `open` 載入前 200 列。
6. 捲動接近底部 300px 時載入下一批。
7. 使用 Syncfusion `insertRow` 追加 RowModel。

### 4.1 工作表下拉選單

`likeexcel.tsx`、`likeexcelG.tsx`、`likeexcelAD.tsx` 的工具列都新增：

- 工作表名稱下拉選單。
- hidden 工作表顯示 `(hidden)`。
- 工作簿總列數。
- 載入狀態。
- 錯誤訊息。

### 4.2 分批捲動修正

Syncfusion 整合包含以下修正：

- 第一筆追加 RowModel 使用正確的 0-based `index`。
- 插入前對齊 `usedRange.rowIndex`，避免空白列造成重複補列。
- 啟用 `scrollSettings.isFinite`，關閉 Syncfusion 自動擴增空白列。
- scroll listener 掛在穩定的 Spreadsheet 根元素。
- 透過 capture 監聽重建後的 `.e-main-panel` 垂直捲動。

實際驗證可定位到 `A7672`，且不存在額外的 `A7673`。

### 4.3 程式載入事件隔離

hook 公開：

- `isWorkbookLoading`
- `isProgrammaticLoad()`

G 與 AD 頁面的儲存格異動處理器會忽略：

- 初次開檔事件
- 工作表切換事件
- 分批 `insertRow` 事件

避免程式載入被誤記為使用者編輯或協作異動。

## 5. Mapping Setup 修改

### 5.1 檔案與工作表

- 檔案選擇器接受 `.xlsx,.xlsm,.xls`。
- 上傳後保存伺服器 `fileId`。
- 顯示 File ID。
- 自動讀取完整工作表清單。
- hidden 工作表會明確標示。

### 5.2 匯入模式

新增模式切換：

- `Timeline Matrix`
  - 保留原有年度時間軸設定。
  - 保留 `/execute-import` 流程。

- `Repeated Groups`
  - 使用全手動固定欄位與重複欄組設定。
  - 不硬編碼 Quanta 的 AJ-AX 欄位。

### 5.3 固定欄位設定

每個固定欄位可設定：

- Excel 欄位。
- DB 欄位。
- 遇空向下沿用。
- 不檢查。
- 排除空值。
- 數字檢查。
- Regex 規則與測試值。

### 5.4 重複欄組設定

每個群組可設定：

- 群組標籤，例如 `Current`。
- 整組空白時是否跳過。
- 多組 Excel 欄位與 DB 欄位對應。

共用設定：

- `sheetName`
- `headerRow`
- `dataStartRow`
- `sourceGroupField`
- `fixedMappings[]`
- `repeatGroups[]`

### 5.5 預覽與正式匯入

新增按鈕：

- `預覽匯入`
- `執行追加匯入`

預覽結果顯示：

- 預估輸出筆數。
- 跳過來源列數。
- 跳過空群組數。
- 警告。
- 前 10 筆樣本資料。

正式匯入按鈕只有在預覽成功後才啟用。

預覽完成後若修改下列任一設定，正式匯入會要求重新預覽：

- fileId
- 工作表
- 起始列
- 固定欄位
- 重複欄組
- DB 欄位
- targetTable
- DB 連線設定

### 5.6 建表 Modal

重複欄組模式下，欄位預覽來源包含：

- 所有固定映射 DB 欄位。
- `sourceGroupField`。
- 所有群組輸出 DB 欄位。

重複名稱會合併，只顯示一次。

## 6. 重複欄組匯入 API

新增：

`POST /api/spreadsheet/import-sheet`

### 6.1 Dry-run

請求重點：

```json
{
  "fileId": "file-xxxxxxxx.xlsm",
  "sheetName": "NBPC PJ sheet(2507)",
  "headerRow": 8,
  "dataStartRow": 9,
  "sourceGroupField": "source_group",
  "fixedMappings": [],
  "repeatGroups": [
    {
      "label": "Current",
      "skipWhenAllEmpty": true,
      "mappings": [
        { "excelColumn": "AL", "dbFieldName": "part_number" },
        { "excelColumn": "AM", "dbFieldName": "pcs" },
        { "excelColumn": "AN", "dbFieldName": "total_usage" }
      ]
    }
  ],
  "targetTable": "dbo.quanta_import",
  "dryRun": true
}
```

Quanta 實際預覽結果：

- 輸出：788 筆。
- 跳過空群組：6876 個。
- 第一筆來源列：9。
- 第一筆資料：`Current / EEFSX0D331YR / 2 / 2`。

### 6.2 正式匯入

`dryRun: false` 時：

- 驗證 `targetTable` 格式。
- 讀取目標 SQL table schema。
- 驗證所有映射欄位存在。
- 驗證未映射的必要欄位是否有 default、identity 或允許 null。
- 依目標欄位型別轉換資料。
- 每批最多 1000 筆，使用 `request.bulk()`。
- 所有批次位於同一個 transaction。
- 任一批次失敗時全部 rollback。
- 每次執行皆為 append，不執行刪除、replace 或去重。

支援的目標資料型別：

- `varchar`、`nvarchar`
- `char`、`nchar`
- `int`、`bigint`、`smallint`、`tinyint`
- `decimal`、`numeric`
- `float`、`real`
- `bit`
- `date`、`datetime`、`datetime2`、`smalldatetime`

型別轉換失敗時，錯誤包含來源 Excel 列號與目標 DB 欄名。

## 7. SQL 安全防護

schema、table 及 column 名稱限制為：

```text
^[A-Za-z_][A-Za-z0-9_]*$
```

`targetTable` 只接受：

- `table`
- `schema.table`

建表 API 只接受以下 UI 支援型別：

- `varchar`
- `nvarchar`
- `int`
- `decimal`
- `datetime`
- `float`

額外驗證：

- varchar/nvarchar 長度必須為合法正整數或 `MAX`。
- 字串長度最大為 4000。
- decimal precision 必須為 1-38。
- decimal scale 不可大於 precision。
- timeline `/execute-import` 的 table 與動態 column 同樣通過識別字驗證。

## 8. 測試結果

### 8.1 後端測試

執行：

```powershell
cd WebSideAPI
npm test
```

結果：6/6 通過。

測試內容：

- SQL 識別字限制。
- 安全 workbook path 與 fileId。
- 唯一欄位名稱 sanitizer。
- 公式 cached result。
- Quanta 工作表數量與 hidden 狀態。
- 主表列數 7672。
- 分頁上限與越界空頁。
- 空白儲存格壓縮。
- 重複欄組展開與空群組跳過。
- Quanta 第 9 列 `EEFSX0D331YR / 2 / 2`。

### 8.2 HTTP 驗證

實際呼叫結果：

- 上傳 `.xlsm` 成功。
- `workbook-info` 回傳 10 張表。
- hidden 工作表共 6 張。
- 主表共 7672 列。
- 要求 5000 列時只回傳 1000 列。
- 下一批從 1001 開始。
- 外部 `C:\Windows\win.ini` 路徑以 HTTP 400 拒絕。
- dry-run 回傳 788 筆。

### 8.3 前端瀏覽器驗證

已驗證頁面：

- `/like-excel`
- `/like-excel-g`
- `/like-excel-ad`
- `/excel-mapping-setup`

結果：

- 三個 Excel 頁面都能實際上傳 Quanta XLSM。
- 都顯示 10 張工作表與 hidden 標記。
- 預設選中 `NBPC PJ sheet(2507)`。
- 顯示總列數 7672。
- 可切換到其他工作表並顯示正確列數。
- 可找到 `IMVP9.1` 公式快取結果。
- 可找到 `EEFSX0D331YR`。
- 分批載入後可定位 `A7672`。
- 不會產生額外的 `A7673`。
- Mapping Setup 可顯示 788 筆預覽及前 10 筆資料。

### 8.4 Build

以下檢查通過：

```powershell
node --check WebSideAPI/index.js
node --check WebSideAPI/spreadsheetSupport.js
npx tsc --noEmit --noUnusedLocals false --noUnusedParameters false
npx vite build
git diff --check
```

`npx vite build` production bundle 成功。

完整 `npm run build` 仍被專案原有的 TS6133 未使用 import/state 擋住，位置位於：

- `src/main.tsx`
- `src/pages/Dashboard*.tsx`
- `src/pages/ExcelList.tsx`
- `src/pages/Home.tsx`

本次修改的檔案沒有新增 TypeScript 型別錯誤。

## 9. 尚未完成或不在本次範圍

- 本機 `127.0.0.1:1433` 沒有可用 MSSQL，因此尚未實際執行正式 bulk append、transaction commit 與 rollback 整合測試。
- VBA 不會在瀏覽器執行。
- 不實作 U 欄的 VBA 連動行為。
- 匯出仍使用既有 `.xlsx` 值資料流程。
- 不保證編輯後完整保留 VBA、圖片及原始 `.xlsm` 結構。
- 正式匯入不做檔案雜湊、去重或 replace。
- 重複欄組不會自動硬編碼或套用 Quanta AJ-AX。

## 10. 啟動方式

後端：

```powershell
cd WebSideAPI
node index.js
```

前端：

```powershell
cd my-app-pt1
npm run dev -- --host 127.0.0.1
```

網址：

- `http://127.0.0.1:5173/like-excel`
- `http://127.0.0.1:5173/like-excel-g`
- `http://127.0.0.1:5173/like-excel-ad`
- `http://127.0.0.1:5173/excel-mapping-setup`

