const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ExcelJS = require('exceljs');
const {
    WorkbookCache,
    assertIdentifier,
    buildRepeatedGroupRecords,
    parseCellValue,
    parseTargetTable,
    resolveFileId,
    resolveSafePath,
    sanitizeColumnName,
    serializeWorksheetChunk
} = require('../spreadsheetSupport');

const sampleWorkbook = path.resolve(__dirname, '..', '..', 'Quanta_NBPC_New PJ sheet_250717.xlsm');

test('SQL identifiers and workbook paths are constrained', () => {
    assert.deepEqual(parseTargetTable('dbo.quanta_parts'), {
        schemaName: 'dbo', tableName: 'quanta_parts', qualifiedName: '[dbo].[quanta_parts]'
    });
    assert.throws(() => assertIdentifier('bad-name', 'column'), /Invalid SQL column/);
    const uploads = path.resolve(__dirname, '..', 'uploads');
    assert.equal(resolveFileId('file-123.xlsm', uploads), path.join(uploads, 'file-123.xlsm'));
    assert.throws(() => resolveFileId('../secret.xlsm', uploads), /Invalid workbook fileId/);
    assert.throws(() => resolveSafePath('C:\\Windows\\win.ini', [uploads]), /outside the allowed directories/);
});

test('generated column names are legal and unique suggestions', () => {
    const used = new Set();
    assert.equal(sanitizeColumnName('Part Number / Spec', used), 'Part_Number_Spec');
    assert.equal(sanitizeColumnName('Part Number / Spec', used), 'Part_Number_Spec_2');
});

test('formula objects use their cached result', () => {
    assert.equal(parseCellValue({ formula: 'A1', result: 'cached' }), 'cached');
});

test('Quanta workbook metadata and cached page values are readable', {
    skip: !fs.existsSync(sampleWorkbook) && 'Quanta sample workbook is not included in the repository'
}, async () => {
    const cache = new WorkbookCache();
    const workbook = await cache.load(sampleWorkbook);
    assert.equal(workbook.worksheets.length, 10);
    assert.equal(workbook.worksheets.filter(sheet => sheet.state !== 'visible').length, 6);

    const worksheet = workbook.getWorksheet('NBPC PJ sheet(2507)');
    assert.ok(worksheet);
    assert.equal(worksheet.rowCount, 7672);

    const firstPage = serializeWorksheetChunk(worksheet, { startRow: 1, rowCount: 200, formulaMode: 'cached' });
    assert.equal(firstPage.startRow, 1);
    assert.equal(firstPage.endRow, 200);
    assert.equal(firstPage.nextStartRow, 201);
    assert.equal(firstPage.hasMore, true);
    assert.equal(firstPage.rows[7].cells[0].value, '-');
    assert.equal(firstPage.rows[7].cells[2].value, 'For you1');
    assert.match(String(firstPage.rows[8].cells[19].value), /IMVP9\.1/);
    assert.equal(firstPage.rows[8].cells[37].value, 'EEFSX0D331YR');
    assert.equal(firstPage.rows[8].cells[19].formula, undefined);

    const secondPage = serializeWorksheetChunk(worksheet, { startRow: 201, rowCount: 200, formulaMode: 'cached' });
    assert.equal(secondPage.startRow, 201);
    assert.equal(secondPage.endRow, 400);

    const cappedPage = serializeWorksheetChunk(worksheet, { startRow: 1, rowCount: 5000, formulaMode: 'cached' });
    assert.equal(cappedPage.rows.length, 1000);
    const pastEnd = serializeWorksheetChunk(worksheet, { startRow: 8000, rowCount: 200, formulaMode: 'cached' });
    assert.equal(pastEnd.rows.length, 0);
    assert.equal(pastEnd.hasMore, false);

    const currentGroup = buildRepeatedGroupRecords(worksheet, {
        dataStartRow: 9,
        sourceGroupField: 'source_group',
        fixedMappings: [],
        repeatGroups: [{
            label: 'Current',
            mappings: [
                { excelColumn: 'AL', dbFieldName: 'part_number' },
                { excelColumn: 'AM', dbFieldName: 'pcs' },
                { excelColumn: 'AN', dbFieldName: 'total_usage' }
            ]
        }]
    });
    assert.deepEqual(currentGroup.records[0].values, {
        source_group: 'Current', part_number: 'EEFSX0D331YR', pcs: 2, total_usage: 2
    });
});

test('unstyled blank cells are compressed to null-free empty row models', () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Blank');
    worksheet.getCell('A2').value = 'value';
    const page = serializeWorksheetChunk(worksheet, { startRow: 1, rowCount: 1, formulaMode: 'cached' });
    assert.deepEqual(page.rows[0].cells, []);
});

test('repeated groups expand records and skip empty groups', () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Input');
    worksheet.getCell('A2').value = 'Quanta';
    worksheet.getCell('B2').value = 'EEFSX0D331YR';
    worksheet.getCell('C2').value = 2;
    worksheet.getCell('D2').value = '';

    const parsed = buildRepeatedGroupRecords(worksheet, {
        dataStartRow: 2,
        sourceGroupField: 'source_group',
        fixedMappings: [{ excelColumn: 'A', dbFieldName: 'customer', isGrouped: false, filterType: 'not_empty' }],
        repeatGroups: [
            { label: 'Current', mappings: [{ excelColumn: 'B', dbFieldName: 'part_number' }, { excelColumn: 'C', dbFieldName: 'pcs' }] },
            { label: 'Empty', mappings: [{ excelColumn: 'D', dbFieldName: 'part_number' }] }
        ]
    });

    assert.equal(parsed.records.length, 1);
    assert.deepEqual(parsed.records[0].values, {
        customer: 'Quanta', source_group: 'Current', part_number: 'EEFSX0D331YR', pcs: 2
    });
    assert.equal(parsed.skippedGroupCount, 1);
});
