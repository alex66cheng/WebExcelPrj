const express = require('express');
const path = require('path');
const multer = require('multer');
const cors = require('cors');
//const XLSX = require('xlsx');

// Ensure you have: npm install xlsx-js-style
const XLSX = require('xlsx-js-style');
const ExcelJS = require('exceljs');

const mongoose = require('mongoose');
const Customer = require('./models/Customer'); // Import the model above

const app = express();
const upload = multer();

app.use(cors());
// 1. Serve the static files from the Vite build
app.use(express.static(path.join(__dirname, 'dist')));

//app.use(express.json());
//app.use(express.urlencoded({ extended: true }));

// Increase the limit to 50mb to handle large spreadsheet JSON
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));

// Database Connection
mongoose.connect('mongodb://localhost:27017/faqdb')
  .then(() => console.log("Connected to faqdb"))
  .catch(err => console.error("Could not connect to MongoDB", err));

const storage = multer.memoryStorage();

//const upload = multer({ storage: multer.memoryStorage() });

const fixColor = (colorObj) => {
    if (!colorObj) return null;
    let argb = colorObj.argb; // ExcelJS provides ARGB directly
    if (argb && argb.length === 8) return `#${argb.slice(2)}`;
    if (argb && argb.length === 6) return `#${argb}`;
    return null;
};

// Helper to convert Excel ARGB (FFRRGGBB) to CSS Hex (#RRGGBB)
const fixColor2 = (colorObj) => {
    if (!colorObj) return null;
    
    // Priority 1: Direct RGB string (most common for 'Standard' colors)
    if (colorObj.rgb) {
        return `#${colorObj.rgb.length === 8 ? colorObj.rgb.slice(2) : colorObj.rgb}`;
    }
    
    // Priority 2: Theme colors often have the RGB nested inside
    if (typeof colorObj === 'object' && colorObj.rgb) {
        return `#${colorObj.rgb.slice(-6)}`;
    }

    return null;
};



// 2. Handle API routes here
app.get('/api/hello', (req, res) => {
  res.json({ message: "Hello from Express!" });
});

// The Customer API for your Spreadsheet Select Control
app.get('/api/customers', async (req, res) => {
  try {
    // Querying only enabled customers and only returning the 'short' field
    const customers = await Customer.find({ enable: 1 }, 'short _id').sort({ short: 1 });
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: "Database query failed" });
  }
});

// server.js
app.get('/api/general-query1', async (req, res) => {
  const { dbName, collectionName, fieldName } = req.query;

  try {
    // Switch to the specific database
    const dynamicDb = mongoose.connection.useDb(dbName);
    const collection = dynamicDb.collection(collectionName);

    // Find all documents and only return the ID and the requested field
    const data = await collection.find({}, { projection: { [fieldName]: 1, _id: 1 } }).toArray();
    
    // Map data so the frontend always sees a standard "value" property
    const formattedData = data.map(doc => ({
      _id: doc._id,
      displayValue: doc[fieldName] || "N/A"
    }));

    res.json(formattedData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/general-query3', async (req, res) => {
  const { dbName, collectionName, fieldName, filterStr } = req.query;

  try {
    // Switch to the specific database
    const dynamicDb = mongoose.connection.useDb(dbName);
    const collection = dynamicDb.collection(collectionName);

     // Parse the string filter into an object
    let queryObj = {};
    if (filterStr && filterStr.trim() !== "") {
      try {
        console.log(filterStr);
        queryObj = JSON.parse(filterStr);
      } catch (e) {
        return res.status(400).json({ error: "Invalid JSON filter format" });
      }
    }

    // Find all documents and only return the ID and the requested field
    const data = await collection.find(queryObj, { projection: { [fieldName]: 1, _id: 1 } }).toArray();
    
    // Map data so the frontend always sees a standard "value" property
    const formattedData = data.map(doc => ({
      _id: doc._id,
      displayValue: doc[fieldName] || "N/A"
    }));

    res.json(formattedData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/general-query', async (req, res) => {
  const { dbName, collectionName, fieldName, filterStr } = req.query;
  const fields = fieldName.split(',').map(f => f.trim());

  try {
    const dynamicDb = mongoose.connection.useDb(dbName);
    const collection = dynamicDb.collection(collectionName);

    // Parse the string filter into an object
    let queryObj = {};
    if (filterStr && filterStr.trim() !== "") {
      try {
        queryObj = JSON.parse(filterStr);
      } catch (e) {
        return res.status(400).json({ error: "Invalid JSON filter format" });
      }
    }

    const data = await collection.find(queryObj).limit(100).toArray();
    
    // Map data to a 2D array for the Spreadsheet
    const gridData = data.map(doc => {
      return fields.map(f => doc[f] !== undefined ? String(doc[f]) : "");
    });

    res.json(gridData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});
*/
// Express 5.0+ Catch-all
// Express 5.0+ absolute catch-all syntax
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// --- OPEN ROUTE ---
app.post('/api/spreadsheet/open', upload.single('file'), async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.getWorksheet(1); // Get first sheet

        let formattedRows = [];

        // Walk through every row and cell
        worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
            let cells = [];
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                
                const cellObj = {
                    value: cell.value && cell.value.result ? cell.value.result : cell.value,
                    formula: cell.formula ? `=${cell.formula}` : undefined,
                    style: {}
                };

                // 1. FONT COLOR & BOLD (This will NOT be undefined now)
                if (cell.font) {
                    if (cell.font.bold) cellObj.style.fontWeight = 'bold';
                    if (cell.font.italic) cellObj.style.fontStyle = 'italic';
                    if (cell.font.size) cellObj.style.fontSize = `${cell.font.size}pt`;
                    const fColor = fixColor(cell.font.color);
                    if (fColor) cellObj.style.color = fColor;
                }

                // 2. BACKGROUND COLOR
                if (cell.fill && cell.fill.fgColor) {
                    const bColor = fixColor(cell.fill.fgColor);
                    if (bColor) cellObj.style.backgroundColor = bColor;
                }

                // 3. BORDERS
                if (cell.border) {
                    if (cell.border.top) cellObj.style.borderTop = "1px solid #000000";
                    if (cell.border.bottom) cellObj.style.borderBottom = "1px solid #000000";
                    if (cell.border.left) cellObj.style.borderLeft = "1px solid #000000";
                    if (cell.border.right) cellObj.style.borderRight = "1px solid #000000";
                }

                // 4. TEXT ALIGNMENT
if (cell.alignment) {
    // Horizontal Mapping: Excel (left/center/right) -> Syncfusion (textAlign)
    if (cell.alignment.horizontal) {
        cellObj.style.textAlign = cell.alignment.horizontal;
    }

    // Vertical Mapping: Excel (top/middle/bottom) -> Syncfusion (verticalAlign)
    if (cell.alignment.vertical) {
        // Excel calls it 'middle', but CSS/Syncfusion usually prefers 'middle' 
        // Syncfusion property is verticalAlign
        cellObj.style.verticalAlign = cell.alignment.vertical === 'middle' ? 'middle' : cell.alignment.vertical;
    }

    // Text Wrap
    if (cell.alignment.wrapText) {
        cellObj.style.wrap = true; // Syncfusion uses 'wrap' boolean
    }
}

                cells[colNumber - 1] = cellObj;
            });
            
            formattedRows[rowNumber - 1] = { 
                cells: cells, 
                height: row.height ? row.height * 1.33 : 20 
            };
        });

        // 4. COLUMN WIDTHS
        const columns = worksheet.columns.map(col => ({
            width: col.width ? col.width * 7 : 64
        }));

        // 5. HANDLE CELL MERGING
if (worksheet._merges) {
    Object.values(worksheet._merges).forEach(merge => {
        const { top, left, bottom, right } = merge;
        
        // Find the "Master Cell" (Top-Left)
        const masterRow = formattedRows[top - 1];
        if (masterRow && masterRow.cells[left - 1]) {
            const masterCell = masterRow.cells[left - 1];
            
            // Calculate how many rows/cols it spans
            masterCell.rowSpan = (bottom - top) + 1;
            masterCell.colSpan = (right - left) + 1;
            
            // Breakthrough: We must clear the values of the "hidden" cells
            // otherwise Syncfusion might try to render text behind the merge
            for (let r = top; r <= bottom; r++) {
                for (let c = left; c <= right; c++) {
                    if (r === top && c === left) continue; // Skip master
                    if (formattedRows[r - 1] && formattedRows[r - 1].cells[c - 1]) {
                        formattedRows[r - 1].cells[c - 1] = { value: "" }; 
                    }
                }
            }
        }
    });
}



        const result = {
            Workbook: {
                sheets: [{
                    name: worksheet.name,
                    rows: formattedRows,
                    columns: columns
                }]
            }
        };

        res.json({ jsonObject: JSON.stringify(result) });
        console.log("✅ High-Fidelity processing complete with ExcelJS");

    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

app.post('/api/spreadsheet/open5', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).send("No file uploaded");

        const workbook = XLSX.read(req.file.buffer, {
            type: 'buffer',
            cellStyles: true,  // Required for font/color
            cellFormula: true, // Required for formulas
            cellDates: true,   // Required for dates
            cellNF: true,      // Required for number formats
            sheetStubs: true   // Helps with empty styled cells
        });

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const range = XLSX.utils.decode_range(sheet['!ref']);

        let formattedRows = [];

        for (let r = 0; r <= range.e.r; r++) {
            let cells = [];
            for (let c = 0; c <= range.e.c; c++) {
                const ref = XLSX.utils.encode_cell({ r, c });
                const cell = sheet[ref];

                if (!cell) {
                    cells.push({});
                    continue;
                }

                // Initialize cell object
                const cellObj = {
                    // Use .w (formatted text) for dates, .v (raw value) for others
                    value: (cell.t === 'd' || cell.z) ? cell.w : cell.v,
                    formula: cell.f ? `=${cell.f}` : undefined,
                    style: {}
                };

                if (cell.r) {
                    // This is Rich Text (multiple styles in one cell)
                    // For now, let's grab the color of the first segment
                    const firstSegment = cell.r[0];
                    if (firstSegment && firstSegment.s && firstSegment.s.font) {
                        const rColor = fixColor(firstSegment.s.font.color);
                        if (rColor) cellObj.style.color = rColor;
                    }
                }

                if (cell.s) {
                    //console.log(`--- Style found for ${ref} ---`);
                    //console.log("Full Style Object:", JSON.stringify(cell.s, null, 2));
    
                    // Check if font exists specifically
                    if (cell.s.font) {
                        console.log("Font detected:", cell.s.font);
                    } else {
                        console.log("Warning: Font object is missing from style!");
                        console.log(`--- DEBUG ${ref} ---`);
                        console.log("Keys found in style:", Object.keys(cell.s)); 
                        console.log("Full Object:", JSON.stringify(cell.s))
                    }

                    const fill = cell.s.fill || cell.s; // Some versions put patternType at root
                    if (fill && fill.fgColor) {
                        const bgColor = fixColor(fill.fgColor);
                        if (bgColor) cellObj.style.backgroundColor = bgColor;
                    }

                    
                }

                // --- MAPPING FONT COLOR & BOLD ---
                if (cell.s && cell.s.font) {
                    if (cell.s.font.bold) cellObj.style.fontWeight = 'bold';
                    if (cell.s.font.italic) cellObj.style.fontStyle = 'italic';
                    
                    const textColor = fixColor(cell.s.font.color);
                    if (textColor) cellObj.style.color = textColor;
                }

                // --- MAPPING CELL BACKGROUND (FILL) ---
                if (cell.s && cell.s.fill && cell.s.fill.fgColor) {
                    const bgColor = fixColor(cell.s.fill.fgColor);
                    if (bgColor) cellObj.style.backgroundColor = bgColor;
                }

                // --- MAPPING BORDERS ---
                if (cell.s && cell.s.border) {
                    const b = cell.s.border;
                    const borderStyle = "1px solid #000000"; // Default border
                    if (b.top) cellObj.style.borderTop = borderStyle;
                    if (b.bottom) cellObj.style.borderBottom = borderStyle;
                    if (b.left) cellObj.style.borderLeft = borderStyle;
                    if (b.right) cellObj.style.borderRight = borderStyle;
                }

                cells.push(cellObj);
            }

            // Get row height (hpx is pixels)
            const rowHeight = (sheet['!rows'] && sheet['!rows'][r]?.hpx) || 20;
            formattedRows.push({ cells, height: rowHeight });
        }

        // --- MAPPING MERGED CELLS ---
        if (sheet['!merges']) {
            sheet['!merges'].forEach(m => {
                const firstCell = formattedRows[m.s.r].cells[m.s.c];
                if (firstCell) {
                    firstCell.rowSpan = (m.e.r - m.s.r) + 1;
                    firstCell.colSpan = (m.e.c - m.s.c) + 1;
                }
            });
        }

        // --- MAPPING COLUMN WIDTHS ---
        const columnsMetadata = (sheet['!cols'] || []).map(col => ({
            width: col.wpx || 64
        }));

        // Final Syncfusion-compatible JSON
        const result = {
            Workbook: {
                sheets: [{
                    name: sheetName,
                    rows: formattedRows,
                    columns: columnsMetadata,
                    selectedRange: "A1"
                }]
            }
        };

        res.json({ jsonObject: JSON.stringify(result) });
        console.log(`✅ Successfully processed: ${req.file.originalname}`);

    } catch (err) {
        console.error("❌ Error processing file:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post('/api/spreadsheet/open3', upload.single('file'), (req, res) => {
    try {
        const workbook = XLSX.read(req.file.buffer, { 
            type: 'buffer', 
            cellStyles: true, 
            cellNF: true, 
            cellFormula: true 
        });
        
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const range = XLSX.utils.decode_range(sheet['!ref']);
        
        // 1. Extract Row Heights
        const rowsMetadata = (sheet['!rows'] || []).map(row => ({
            height: row.hpx || 20 // Convert Excel height to pixels
        }));

        // 2. Extract Column Widths
        const columnsMetadata = (sheet['!cols'] || []).map(col => ({
            width: col.wpx || 64 
        }));

        let formattedRows = [];
        for (let r = 0; r <= range.e.r; r++) {
            let cells = [];
            for (let c = 0; c <= range.e.c; c++) {
                const ref = XLSX.utils.encode_cell({ r, c });
                const cell = sheet[ref];

                if (!cell) {
                    cells.push({});
                    continue;
                }

                // THE FIX FOR DATES: cell.w is the "Formatted" string
                const cellObj = {
                    value: cell.t === 'd' || cell.z ? cell.w : cell.v,
                    formula: cell.f ? `=${cell.f}` : undefined,
                    style: {}
                };

                // BORDER MAPPING
                if (cell.s && cell.s.border) {
                    const b = cell.s.border;
                    if (b.top) cellObj.style.borderTop = `1px solid black`;
                    if (b.bottom) cellObj.style.borderBottom = `1px solid black`;
                    if (b.left) cellObj.style.borderLeft = `1px solid black`;
                    if (b.right) cellObj.style.borderRight = `1px solid black`;
                }

                // FONT & ALIGNMENT
                if (cell.s && cell.s.font && cell.s.font.bold) cellObj.style.fontWeight = 'bold';
                
                cells.push(cellObj);
            }
            // Add height to the row object
            formattedRows.push({ 
                cells: cells, 
                height: rowsMetadata[r] ? rowsMetadata[r].height : 20 
            });
        }

        const result = {
            Workbook: {
                sheets: [{
                    name: "Sheet1",
                    rows: formattedRows,
                    columns: columnsMetadata // Add columns metadata here
                }]
            }
        };

        res.json({ jsonObject: JSON.stringify(result) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/spreadsheet/open2', upload.single('file'), (req, res) => {
    try {
        const workbook = XLSX.read(req.file.buffer, { 
            type: 'buffer',
            cellStyles: true, // IMPORTANT: Tells the library to parse styles
            cellNF: true,     // Number formats (e.g., $ or %)
            cellFormula: true // Formulas
        });

        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const range = XLSX.utils.decode_range(sheet['!ref']);
        const rows = [];

        for (let r = 0; r <= range.e.r; r++) {
            const cells = [];
            for (let c = 0; c <= range.e.c; c++) {
                const address = XLSX.utils.encode_cell({ r, c });
                const cell = sheet[address];

                if (!cell) {
                    cells.push({});
                    continue;
                }

                // 1. Map Value and Formula
                const cellData = {
                    value: cell.t === 'n' ? cell.v : (cell.w || cell.v), // 'w' is the formatted text
                    formula: cell.f ? `=${cell.f}` : undefined
                };

                // 2. Map Style (The Translation Layer)
                if (cell.s) {
                    cellData.style = {};
                    
                    // Font Styles
                    if (cell.s.font) {
                        if (cell.s.font.bold) cellData.style.fontWeight = 'bold';
                        if (cell.s.font.italic) cellData.style.fontStyle = 'italic';
                        if (cell.s.font.name) cellData.style.fontFamily = cell.s.font.name;
                        if (cell.s.font.sz) cellData.style.fontSize = `${cell.s.font.sz}pt`;
                        if (cell.s.font.color?.rgb) cellData.style.color = `#${cell.s.font.color.rgb.slice(-6)}`;
                    }

                    // Background Color
                    if (cell.s.fill?.fgColor?.rgb) {
                        cellData.style.backgroundColor = `#${cell.s.fill.fgColor.rgb.slice(-6)}`;
                    }

                    // Alignment
                    if (cell.s.alignment) {
                        if (cell.s.alignment.horizontal) cellData.style.textAlign = cell.s.alignment.horizontal;
                        if (cell.s.alignment.vertical) cellData.style.verticalAlign = cell.s.alignment.vertical;
                    }
                }

                cells.push(cellData);
            }
            rows.push({ cells });
        }

        res.json({ 
            jsonObject: JSON.stringify({ Workbook: { sheets: [{ rows }] } }) 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper to bridge the gap between Excel styles and Syncfusion styles
function mapExcelStyleToSyncfusion(s) {
    let style = {};
    if (s.font) {
        if (s.font.bold) style.fontWeight = 'bold';
        if (s.font.italic) style.fontStyle = 'italic';
        if (s.font.color) style.color = s.font.color.rgb ? `#${s.font.color.rgb.slice(2)}` : 'black';
    }
    if (s.fill && s.fill.fgColor) {
        style.backgroundColor = `#${s.fill.fgColor.rgb.slice(2)}`;
    }
    return style;
}

app.post('/api/spreadsheet/open1', upload.single('file'), (req, res) => {
    try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

        const formattedRows = rows.map((row) => ({
            cells: row.map((val) => ({ value: val }))
        }));

        // THE CRITICAL CHANGE: Wrap everything in a 'Workbook' key
        const responseData = {
            Workbook: {
                sheets: [{
                    name: sheetName || "Sheet1",
                    rows: formattedRows,
                    selectedRange: "A1"
                }]
            }
        };

        // We return the stringified Workbook object
        res.json({ 
            jsonObject: JSON.stringify(responseData) 
        });
        
        console.log("✅ Sent Workbook structure to client.");
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to parse file" });
    }
});

// --- SAVE ROUTE (Supports XLSX, XLS, CSV) ---
app.post('/api/spreadsheet/save2', upload.any(), (req, res) => {
    try {
        const rawData = req.body.JSONData;
        const fileName = req.body.fileName || "Download";
        
        // SYNCFUSION SECRET: It sends the format in 'saveType'
        const saveType = req.body.saveType || "Xlsx"; 

        if (!rawData) return res.status(400).send("No Data");

        const fullModel = JSON.parse(rawData);
        const sheet = fullModel.sheets[0];

        // Clean row data (skipping nulls)
        const rowsData = sheet.rows.map(row => {
            if (!row || !row.cells) return []; 
            return row.cells.map(cell => (cell && cell.value !== undefined) ? cell.value : (cell?.text || ""));
        });

        const worksheet = XLSX.utils.aoa_to_sheet(rowsData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

        // Set the file settings based on what the user picked in the dialog
        let bookType = 'xlsx';
        let contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        let ext = '.xlsx';

        if (saveType === 'Csv') {
            bookType = 'csv';
            contentType = 'text/csv';
            ext = '.csv';
        } else if (saveType === 'Xls') {
            bookType = 'biff8'; 
            contentType = 'application/vnd.ms-excel';
            ext = '.xls';
        }

        const buf = XLSX.write(workbook, { type: 'buffer', bookType: bookType });

        // These headers trigger the Chrome download bar
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}${ext}"`);
        
        res.send(buf);
        console.log(`✅ User chose ${saveType}. Sent ${fileName}${ext}`);

    } catch (error) {
        console.error("Save Error:", error);
        res.status(500).send("Server Error");
    }
});

// --- SAVE ROUTE (Supports XLSX, XLS, CSV with Correct Alignment) ---
app.post('/api/spreadsheet/save', upload.any(), (req, res) => {
    try {
        const rawData = req.body.JSONData;
        const saveType = req.body.saveType || "Xlsx"; 
        const fileName = req.body.fileName || "Download";

        if (!rawData) return res.status(400).send("No Data");

        const fullModel = JSON.parse(rawData);
        const sheet = fullModel.sheets[0];

        // NEW LOGIC: Calculate max columns to prevent data shifting
        const maxCols = sheet.rows.reduce((max, row) => {
            return (row && row.cells) ? Math.max(max, row.cells.length) : max;
        }, 0);

        const rowsData = sheet.rows.map(row => {
            const rowArray = [];
            for (let i = 0; i < maxCols; i++) {
                // If cell exists, get value; otherwise, use empty string ""
                const cell = (row && row.cells) ? row.cells[i] : null;
                const val = (cell && cell.value !== undefined) ? cell.value : (cell?.text || "");
                rowArray.push(val);
            }
            return rowArray;
        });

        const worksheet = XLSX.utils.aoa_to_sheet(rowsData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

        let bookType = 'xlsx';
        let contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        let ext = '.xlsx';

        if (saveType === 'Csv') {
            bookType = 'csv';
            contentType = 'text/csv';
            ext = '.csv';
            // Force UTF-8 for CSV to handle special characters
        } else if (saveType === 'Xls') {
            bookType = 'biff8'; 
            contentType = 'application/vnd.ms-excel';
            ext = '.xls';
        }

        const buf = XLSX.write(workbook, { type: 'buffer', bookType: bookType });

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}${ext}"`);
        res.send(buf);

        console.log(`✅ Exported ${saveType} with correct column alignment`);

    } catch (error) {
        console.error("Save Error:", error);
        res.status(500).send("Server Error");
    }
});

app.post('/api/spreadsheet/saveX2', async (req, res) => {
   try {
        console.log("📥 Received save request...");

        // 1. SAFELY EXTRACT DATA
        // Check for common Syncfusion wrappers
        let incoming = req.body.spreadsheetData || req.body;
        let spreadsheetData;

        // Prevent "SyntaxError: [object Object] is not valid JSON"
        if (typeof incoming === 'string') {
            try {
                spreadsheetData = JSON.parse(incoming);
            } catch (e) {
                spreadsheetData = incoming; 
            }
        } else {
            spreadsheetData = incoming; // Already an object, skip parsing
        }

        // 2. DRILL DOWN TO SHEETS
        const sheets = spreadsheetData?.jsonObject?.Workbook?.sheets || 
                       spreadsheetData?.Workbook?.sheets || 
                       spreadsheetData?.sheets;

        if (!sheets || !sheets[0]) {
            throw new Error("Structure Error: Could not find 'sheets' array.");
        }

        // 3. INITIALIZE EXCELJS
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(sheets[0].name || 'Sheet1');

        // 4. ITERATE THROUGH ROWS AND CELLS
        sheets[0].rows.forEach((rowData, rowIndex) => {
            if (!rowData || !rowData.cells) return;
            
            const row = worksheet.getRow(rowIndex + 1);
            if (rowData.height) row.height = row.height / 1.33;

            rowData.cells.forEach((cellData, colIndex) => {
                if (!cellData) return;

                const cell = row.getCell(colIndex + 1);

                // --- CORRECT VALUE PICKER (Do not overwrite this later!) ---
                /*
                let displayValue = "";
                if (cellData.formula) {
                    displayValue = { formula: cellData.formula.replace('=', '') };
                } else if (cellData.value !== undefined && cellData.value !== null && cellData.value !== "") {
                    displayValue = cellData.value;
                } else if (cellData.text !== undefined && cellData.text !== null && cellData.text !== "") {
                    displayValue = cellData.text;
                } else if (cellData.displayedText) {
                    displayValue = cellData.displayedText;
                }
*/
                let displayValue = cellData.formula ? { formula: cellData.formula.replace('=', '') } : (cellData.value || cellData.text || "");

                cell.value = displayValue;

                // --- APPLY STYLES ---
                if (cellData.style) {
                    const s = cellData.style;
                    cell.font = {
                        bold: s.fontWeight === 'bold',
                        italic: s.fontStyle === 'italic',
                        underline: s.textDecoration === 'underline',
                        size: s.fontSize ? parseInt(s.fontSize) : 11,
                        color: s.color ? { argb: 'FF' + s.color.replace('#', '') } : { argb: 'FF000000' }
                    };

                    if (s.backgroundColor) {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FF' + s.backgroundColor.replace('#', '') }
                        };
                    }

                    cell.border = {
                        top: (s.borderTop || s.border) ? { style: 'thin', color: { argb: 'FF000000' } } : undefined,
                        left: (s.borderLeft || s.border) ? { style: 'thin', color: { argb: 'FF000000' } } : undefined,
                        bottom: (s.borderBottom || s.border) ? { style: 'thin', color: { argb: 'FF000000' } } : undefined,
                        right: (s.borderRight || s.border) ? { style: 'thin', color: { argb: 'FF000000' } } : undefined
                    };

                    cell.alignment = {
                        horizontal: s.textAlign || 'left',
                        vertical: s.verticalAlign || 'middle',
                        wrapText: true // Force wrap text for multi-line support
                    };
                }

                // --- 3. MERGE EXECUTION ---
                if (cellData.rowSpan > 1 || cellData.colSpan > 1) {
                    const startR = rowIndex + 1;
                    const startC = colIndex + 1;
                    const endR = rowIndex + (cellData.rowSpan || 1);
                    const endC = colIndex + (cellData.colSpan || 1);

                    try {
                        worksheet.mergeCells(startR, startC, endR, endC);
                        
                        // After merging, we must re-apply the border to the whole range
                        // ExcelJS requires this or only the top-left corner will have a border
                        const mergedRange = worksheet.getCell(startR, startC);
                        mergedRange.border = cell.border; 
                        mergedRange.alignment = cell.alignment;
                    } catch (e) {
                        // Cell already part of a merge
                    }
                }
            });
        });

        // 5. SEND FILE BACK TO BROWSER (Using Buffer for stability)
        const buffer = await workbook.xlsx.writeBuffer();
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Exported_Styled_File.xlsx');
        
        console.log(`✅ Sending file. Buffer size: ${buffer.length} bytes`);
        res.send(buffer);


    } catch (err) {
        console.error("❌ BACKEND SAVE ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/spreadsheet/saveX', async (req, res) => {
    try {
        console.log("📥 Received save request...");

        let incoming = req.body.spreadsheetData || req.body;
        let spreadsheetData = (typeof incoming === 'string') ? JSON.parse(incoming) : incoming;

        const sheets = spreadsheetData?.jsonObject?.Workbook?.sheets || spreadsheetData?.Workbook?.sheets || spreadsheetData?.sheets;
        if (!sheets || !sheets[0]) throw new Error("Structure Error: No sheets found.");

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(sheets[0].name || 'Sheet1');

        // 1. PRE-PROCESS MERGES
        // We do this first so ExcelJS knows the layout before we style cells
        sheets[0].rows.forEach((rowData, rowIndex) => {
            if (!rowData || !rowData.cells) return;
            rowData.cells.forEach((cellData, colIndex) => {
                if (cellData && (cellData.rowSpan > 1 || cellData.colSpan > 1)) {
                    try {
                        worksheet.mergeCells(
                            rowIndex + 1, 
                            colIndex + 1, 
                            rowIndex + (cellData.rowSpan || 1), 
                            colIndex + (cellData.colSpan || 1)
                        );
                    } catch (e) { /* Already merged */ }
                }
            });
        });

        // 2. APPLY VALUES AND STYLES
        sheets[0].rows.forEach((rowData, rowIndex) => {
            if (!rowData || !rowData.cells) return;
            const row = worksheet.getRow(rowIndex + 1);
            if (rowData.height) row.height = row.height * 0.75;

            rowData.cells.forEach((cellData, colIndex) => {
                if (!cellData) return;
                const cell = row.getCell(colIndex + 1);

                // VALUE PICKER
                let val = cellData.formula ? { formula: cellData.formula.replace('=', '') } : (cellData.value || cellData.text || "");
                if (val !== "") cell.value = val;

                // STYLE SHIELD
                if (cellData.style) {
                    const s = cellData.style;
                    
                    // Font
                    cell.font = {
                        bold: s.fontWeight === 'bold',
                        size: s.fontSize ? parseInt(s.fontSize) : 11,
                        color: { argb: s.color ? 'FF' + s.color.replace('#', '') : 'FF000000' }
                    };

                    // Fill
                    if (s.backgroundColor && s.backgroundColor !== '#ffffff') {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FF' + s.backgroundColor.replace('#', '') }
                        };
                    }

                    // Alignment
                    cell.alignment = { 
                        horizontal: s.textAlign || 'left', 
                        vertical: s.verticalAlign || 'middle',
                        wrapText: false 
                    };

                    // BORDERS (Fixed syntax)
                    const borderStyle = { style: 'thin', color: { argb: 'FF000000' } };
                    cell.border = {
                        top: (s.borderTop || s.border) ? borderStyle : undefined,
                        left: (s.borderLeft || s.border) ? borderStyle : undefined,
                        bottom: (s.borderBottom || s.border) ? borderStyle : undefined,
                        right: (s.borderRight || s.border) ? borderStyle : undefined
                    };

                    // If it's a merge, we must apply borders to the edges of the whole area
if (cellData.rowSpan > 1 || cellData.colSpan > 1) {
    const endR = rowIndex + (cellData.rowSpan || 1);
    const endC = colIndex + (cellData.colSpan || 1);
    
    for (let r = rowIndex + 1; r <= endR; r++) {
        for (let c = colIndex + 1; c <= endC; c++) {
            const targetCell = worksheet.getCell(r, c);
            targetCell.border = cell.border; // Mirror the master cell's border
        }
    }
}
                }
            });
        });

        // 3. GENERATE BUFFER
        const buffer = await workbook.xlsx.writeBuffer();
        
        // 4. FINAL SINGLE RESPONSE
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Exported_File.xlsx');
        
        console.log(`✅ Sending file. Buffer size: ${buffer.length} bytes`);
        return res.send(buffer); // 'return' ensures no other code runs after this

    } catch (err) {
        console.error("❌ BACKEND SAVE ERROR:", err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
});

app.listen(3000, () => console.log("🚀 Server running at http://localhost:3000"));