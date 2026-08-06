import { setColumn, getSheet, setCell } from '../base/index';
import { protectsheetHandler, protectSheetWorkBook, updateToggle, setLockCells } from '../common/index';
import { unprotectsheetHandler } from '../common/index';
import { getSwapRange } from '../common/index';
import { isNullOrUndefined, isUndefined } from '@syncfusion/ej2-base';
/**
 * The `WorkbookSpreadSheet` module is used to handle the Protecting functionalities in Workbook.
 */
var WorkbookProtectSheet = /** @class */ (function () {
    /**
     * Constructor for edit module in Workbook.
     *
     * @param {Workbook} workbook - Specifies the workbook.
     * @private
     */
    function WorkbookProtectSheet(workbook) {
        this.parent = workbook;
        this.addEventListener();
    }
    WorkbookProtectSheet.prototype.protectsheetHandler = function (args) {
        var sheetIndex = isNullOrUndefined(args.sheetIndex) ? this.parent.activeSheetIndex : args.sheetIndex;
        var sheet = getSheet(this.parent, sheetIndex);
        this.parent.setSheetPropertyOnMute(sheet, 'isProtected', true);
        this.parent.setSheetPropertyOnMute(sheet, 'protectSettings', {
            selectCells: args.protectSettings.selectCells, formatCells: args.protectSettings.formatCells,
            formatColumns: args.protectSettings.formatColumns, formatRows: args.protectSettings.formatRows,
            insertLink: args.protectSettings.insertLink, selectUnLockedCells: args.protectSettings.selectUnLockedCells
        });
        this.parent.notify(protectSheetWorkBook, { sheetIndex: sheetIndex, triggerEvent: args.triggerEvent });
        this.parent.notify(updateToggle, { props: 'Protect' });
        sheet.password = args.password ? args.password : '';
        sheet.columns.forEach(function (column) {
            if (column && isUndefined(column.isLocked)) {
                column.isLocked = true;
            }
        });
    };
    WorkbookProtectSheet.prototype.unprotectsheetHandler = function (args) {
        var sheet = this.parent.getActiveSheet();
        if (!isNullOrUndefined(args.sheet)) {
            sheet = this.parent.sheets[args.sheet];
        }
        if (sheet.isImportProtected) {
            sheet.isImportProtected = false;
        }
        sheet.protectSettings.formatCells = sheet.protectSettings.formatColumns = false;
        sheet.protectSettings.formatRows = sheet.protectSettings.selectCells = false;
        this.parent.setSheetPropertyOnMute(sheet, 'isProtected', false);
        this.parent.notify(protectSheetWorkBook, sheet.protectSettings);
        this.parent.notify(updateToggle, { props: 'Protect' });
    };
    /**
     * To destroy the edit module.
     *
     * @returns {void} - To destroy the edit module.
     * @hidden
     */
    WorkbookProtectSheet.prototype.destroy = function () {
        this.removeEventListener();
        this.parent = null;
    };
    WorkbookProtectSheet.prototype.addEventListener = function () {
        this.parent.on(protectsheetHandler, this.protectsheetHandler, this);
        this.parent.on(unprotectsheetHandler, this.unprotectsheetHandler, this);
        this.parent.on(setLockCells, this.lockCells, this);
    };
    WorkbookProtectSheet.prototype.removeEventListener = function () {
        if (!this.parent.isDestroyed) {
            this.parent.off(protectsheetHandler, this.protectsheetHandler);
            this.parent.off(setLockCells, this.lockCells);
            this.parent.off(protectsheetHandler, this.unprotectsheetHandler);
        }
    };
    WorkbookProtectSheet.prototype.lockCells = function (args) {
        var addressInfo = this.parent.getAddressInfo(args.range);
        var indexes = getSwapRange(addressInfo.indices);
        var sheet = getSheet(this.parent, addressInfo.sheetIndex);
        var isLocked = args.isLocked ? args.isLocked : false;
        if (indexes[0] === 0 && indexes[2] === sheet.rowCount - 1) {
            for (var i = indexes[1]; i <= indexes[3]; i++) {
                setColumn(sheet, i, { isLocked: args.isLocked });
            }
        }
        for (var i = indexes[0]; i <= indexes[2]; i++) {
            for (var j = indexes[1]; j <= indexes[3]; j++) {
                setCell(i, j, sheet, { isLocked: isLocked }, true);
            }
        }
        if (args.triggerEvent) {
            this.parent.notify('actionComplete', { action: 'lockCells', eventArgs: args });
        }
    };
    /**
     * Get the module name.
     *
     * @returns {string} - Return the string.
     * @private
     */
    WorkbookProtectSheet.prototype.getModuleName = function () {
        return 'workbookProtectSheet';
    };
    return WorkbookProtectSheet;
}());
export { WorkbookProtectSheet };
