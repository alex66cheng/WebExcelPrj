const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const EXCEL_EXTENSIONS = new Set(['.xlsx', '.xlsm', '.xls']);

function isPathInside(root, target) {
    const relative = path.relative(path.resolve(root), path.resolve(target));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveSafePath(inputPath, allowedRoots) {
    if (!inputPath || typeof inputPath !== 'string') {
        throw new Error('A workbook path is required');
    }
    const absolute = path.resolve(inputPath);
    if (!allowedRoots.some(root => isPathInside(root, absolute))) {
        throw new Error('File path is outside the allowed directories');
    }
    return absolute;
}

function resolveFileId(fileId, uploadDirectory) {
    if (!fileId || typeof fileId !== 'string' || path.basename(fileId) !== fileId) {
        throw new Error('Invalid workbook fileId');
    }
    return resolveSafePath(path.join(uploadDirectory, fileId), [uploadDirectory]);
}

function isAllowedExcelFile(fileName) {
    return EXCEL_EXTENSIONS.has(path.extname(fileName || '').toLowerCase());
}

function assertIdentifier(value, label = 'identifier') {
    if (!SQL_IDENTIFIER.test(String(value || ''))) {
        throw new Error(`Invalid SQL ${label}: ${value || ''}`);
    }
    return value;
}

function parseTargetTable(targetTable) {
    const parts = String(targetTable || '').trim().split('.');
    if (parts.length < 1 || parts.length > 2 || parts.some(part => !part)) {
        throw new Error('targetTable must be table or schema.table');
    }
    const schemaName = parts.length === 2 ? parts[0] : 'dbo';
    const tableName = parts.length === 2 ? parts[1] : parts[0];
    assertIdentifier(schemaName, 'schema');
    assertIdentifier(tableName, 'table');
    return { schemaName, tableName, qualifiedName: `[${schemaName}].[${tableName}]` };
}

function sanitizeColumnName(raw, used = new Set()) {
    let name = String(raw ?? '').trim()
        .replace(/[^A-Za-z0-9_\u4e00-\u9fff]+/g, '_')
        .replace(/^_+|_+$/g, '');
    if (!name) name = 'column';
    if (/^\d/.test(name)) name = `col_${name}`;
    name = name.slice(0, 100);
    let candidate = name;
    let suffix = 2;
    while (used.has(candidate.toLowerCase())) {
        candidate = `${name.slice(0, 96)}_${suffix++}`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
}

function parseCellValue(value) {
    if (value === undefined || value === null) return '';
    if (value instanceof Date) return value;
    if (typeof value !== 'object') return value;
    if (value.result !== undefined) return parseCellValue(value.result);
    if (Array.isArray(value.richText)) {
        return value.richText.map(part => part.text || '').join('');
    }
    if (value.text !== undefined) return value.text;
    if (value.hyperlink !== undefined) return value.text || value.hyperlink;
    if (value.value !== undefined) return parseCellValue(value.value);
    return '';
}

function fixColor(color) {
    if (!color) return undefined;
    const raw = color.argb || color.rgb || color.hex;
    if (!raw) return undefined;
    const normalized = String(raw).replace(/^#/, '');
    return `#${normalized.length === 8 ? normalized.slice(2) : normalized}`;
}

function serializeCell(cell, formulaMode) {
    const style = {};
    if (cell.font) {
        if (cell.font.bold) style.fontWeight = 'bold';
        if (cell.font.italic) style.fontStyle = 'italic';
        if (cell.font.size) style.fontSize = `${cell.font.size}pt`;
        const color = fixColor(cell.font.color);
        if (color) style.color = color;
    }
    if (cell.fill?.fgColor) {
        const color = fixColor(cell.fill.fgColor);
        if (color) style.backgroundColor = color;
    }
    if (cell.border) {
        if (cell.border.top?.style) style.borderTop = '1px solid #000000';
        if (cell.border.bottom?.style) style.borderBottom = '1px solid #000000';
        if (cell.border.left?.style) style.borderLeft = '1px solid #000000';
        if (cell.border.right?.style) style.borderRight = '1px solid #000000';
    }
    if (cell.alignment) {
        if (cell.alignment.horizontal) style.textAlign = cell.alignment.horizontal;
        if (cell.alignment.vertical) style.verticalAlign = cell.alignment.vertical === 'middle' ? 'middle' : cell.alignment.vertical;
        if (cell.alignment.wrapText) style.wrap = true;
    }

    const value = parseCellValue(cell.value);
    const formula = formulaMode === 'cached' || !cell.formula ? undefined : `=${cell.formula}`;
    if ((value === '' || value === null) && !formula && Object.keys(style).length === 0) return null;

    const result = { value };
    if (formula) result.formula = formula;
    if (Object.keys(style).length > 0) result.style = style;
    return result;
}

function serializeWorksheetChunk(worksheet, options = {}) {
    const requestedStart = Math.max(Number.parseInt(options.startRow, 10) || 1, 1);
    const requestedCount = Math.min(Math.max(Number.parseInt(options.rowCount, 10) || 200, 1), 1000);
    const totalRows = worksheet.rowCount;
    const startRow = requestedStart;
    const endRow = totalRows === 0 || startRow > totalRows
        ? totalRows
        : Math.min(startRow + requestedCount - 1, totalRows);
    const maxColumns = Math.max(worksheet.columnCount || 0, 26);
    const rows = [];

    for (let rowNumber = startRow; rowNumber <= endRow; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        const cells = new Array(maxColumns).fill(null);
        for (let columnNumber = 1; columnNumber <= maxColumns; columnNumber++) {
            cells[columnNumber - 1] = serializeCell(row.getCell(columnNumber), options.formulaMode || 'formula');
        }
        let lastCell = cells.length - 1;
        while (lastCell >= 0 && cells[lastCell] === null) lastCell--;
        rows.push({
            cells: lastCell >= 0 ? cells.slice(0, lastCell + 1) : [],
            height: row.height ? row.height * 1.33 : 20
        });
    }

    if (worksheet._merges) {
        Object.values(worksheet._merges).forEach(rawMerge => {
            const merge = rawMerge.model || rawMerge;
            const { top, left, bottom, right } = merge;
            if (top < startRow || top > endRow) return;
            const row = rows[top - startRow];
            if (!row) return;
            while (row.cells.length < left) row.cells.push(null);
            const master = row.cells[left - 1] || { value: '' };
            master.rowSpan = bottom - top + 1;
            master.colSpan = right - left + 1;
            row.cells[left - 1] = master;
        });
    }

    const columns = [];
    for (let columnNumber = 1; columnNumber <= maxColumns; columnNumber++) {
        const column = worksheet.getColumn(columnNumber);
        columns.push({ width: column.width ? column.width * 7 : 64 });
    }

    return {
        rows,
        columns,
        startRow,
        endRow,
        totalRows,
        nextStartRow: endRow < totalRows ? endRow + 1 : null,
        hasMore: startRow <= totalRows && endRow < totalRows
    };
}

function isEmpty(value) {
    return value === undefined || value === null || value === '';
}

function passesFilter(value, mapping) {
    if (mapping.filterType === 'not_empty') return !isEmpty(value);
    if (mapping.filterType === 'numeric') return isEmpty(value) || Number.isFinite(Number(String(value).replace(/,/g, '')));
    if (mapping.filterType === 'regex' && mapping.filterExpression) {
        return new RegExp(mapping.filterExpression).test(String(value ?? ''));
    }
    return true;
}

function buildRepeatedGroupRecords(worksheet, config) {
    const fixedMappings = Array.isArray(config.fixedMappings) ? config.fixedMappings : [];
    const repeatGroups = Array.isArray(config.repeatGroups) ? config.repeatGroups : [];
    const sourceGroupField = assertIdentifier(config.sourceGroupField || 'source_group', 'column');
    const dataStartRow = Math.max(Number.parseInt(config.dataStartRow, 10) || 1, 1);
    const groupedCache = {};
    const records = [];
    let skippedRowCount = 0;
    let skippedGroupCount = 0;

    fixedMappings.forEach(mapping => assertIdentifier(mapping.dbFieldName, 'column'));
    repeatGroups.forEach(group => {
        if (!String(group.label || '').trim()) throw new Error('Every repeated group requires a label');
        if (!Array.isArray(group.mappings) || group.mappings.length === 0) throw new Error(`Repeated group ${group.label} has no mappings`);
        group.mappings.forEach(mapping => assertIdentifier(mapping.dbFieldName, 'column'));
    });

    for (let rowNumber = dataStartRow; rowNumber <= worksheet.rowCount; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        const fixedValues = {};
        let valid = true;
        for (const mapping of fixedMappings) {
            let value = parseCellValue(row.getCell(mapping.excelColumn).value);
            if (mapping.isGrouped) {
                if (!isEmpty(value)) groupedCache[mapping.dbFieldName] = value;
                else value = groupedCache[mapping.dbFieldName] ?? '';
            }
            if (!passesFilter(value, mapping)) {
                valid = false;
                break;
            }
            fixedValues[mapping.dbFieldName] = value;
        }
        if (!valid) {
            skippedRowCount++;
            continue;
        }

        for (const group of repeatGroups) {
            const groupValues = {};
            let hasValue = false;
            for (const mapping of group.mappings) {
                const value = parseCellValue(row.getCell(mapping.excelColumn).value);
                groupValues[mapping.dbFieldName] = value;
                if (!isEmpty(value)) hasValue = true;
            }
            if (!hasValue && group.skipWhenAllEmpty !== false) {
                skippedGroupCount++;
                continue;
            }
            records.push({
                sourceRow: rowNumber,
                groupLabel: String(group.label),
                values: { ...fixedValues, [sourceGroupField]: String(group.label), ...groupValues }
            });
        }
    }

    return { records, skippedRowCount, skippedGroupCount };
}

class WorkbookCache {
    constructor({ maxEntries = 3, ttlMs = 10 * 60 * 1000 } = {}) {
        this.maxEntries = maxEntries;
        this.ttlMs = ttlMs;
        this.entries = new Map();
    }

    async load(filePath) {
        const absolute = path.resolve(filePath);
        const stat = fs.statSync(absolute);
        const now = Date.now();
        const cached = this.entries.get(absolute);
        if (cached && cached.mtimeMs === stat.mtimeMs && now - cached.lastAccess < this.ttlMs) {
            cached.lastAccess = now;
            return cached.workbook;
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(absolute);
        this.entries.set(absolute, { workbook, mtimeMs: stat.mtimeMs, lastAccess: now });
        this.evict();
        return workbook;
    }

    async loadBuffer(buffer) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        return workbook;
    }

    evict() {
        const now = Date.now();
        for (const [key, entry] of this.entries) {
            if (now - entry.lastAccess >= this.ttlMs) this.entries.delete(key);
        }
        while (this.entries.size > this.maxEntries) {
            const oldest = [...this.entries.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess)[0];
            this.entries.delete(oldest[0]);
        }
    }
}

module.exports = {
    WorkbookCache,
    assertIdentifier,
    buildRepeatedGroupRecords,
    fixColor,
    isAllowedExcelFile,
    parseCellValue,
    parseTargetTable,
    resolveFileId,
    resolveSafePath,
    sanitizeColumnName,
    serializeWorksheetChunk
};
