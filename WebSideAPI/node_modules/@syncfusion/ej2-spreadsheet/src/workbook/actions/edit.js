import { getCell, getSheet, isCustomDateTime } from '../base/index';
import { workbookEditOperation, checkDateFormat, workbookFormulaOperation, refreshChart, checkUniqueRange, getFormattedCellObject, checkNumberFormat } from '../common/event';
import { getRangeIndexes, parseIntValue, setLinkModel, getCellAddress, isNumber } from '../common/index';
import { defaultCurrencyCode, getNumberDependable, getNumericObject, Internationalization, isNullOrUndefined } from '@syncfusion/ej2-base';
import { checkIsFormula } from '../../workbook/common/index';
import { getFormatFromType, getTypeFromFormat } from '../integrations/index';
/**
 * The `WorkbookEdit` module is used to handle the editing functionalities in Workbook.
 */
var WorkbookEdit = /** @class */ (function () {
    /**
     * Constructor for edit module in Workbook.
     *
     * @private
     * @param {Workbook} workbook - Specifies the workbook.
     */
    function WorkbookEdit(workbook) {
        this.parent = workbook;
        this.addEventListener();
    }
    /**
     * To destroy the edit module.
     *
     * @returns {void} - destroy the edit module
     * @hidden
     */
    WorkbookEdit.prototype.destroy = function () {
        this.removeEventListener();
        this.parent = null;
    };
    WorkbookEdit.prototype.addEventListener = function () {
        this.parent.on(workbookEditOperation, this.performEditOperation, this);
    };
    WorkbookEdit.prototype.removeEventListener = function () {
        if (!this.parent.isDestroyed) {
            this.parent.off(workbookEditOperation, this.performEditOperation);
        }
    };
    /**
     * Get the module name.
     *
     * @returns {string} - string
     * @private
     */
    WorkbookEdit.prototype.getModuleName = function () {
        return 'workbookEdit';
    };
    WorkbookEdit.prototype.performEditOperation = function (args) {
        var action = args.action;
        switch (action) {
            case 'updateCellValue':
                args.isFormulaDependent = this.updateCellValue(args.address, args.value, args.sheetIndex, args.isValueOnly, args.skipFormatCheck, args.isRandomFormula, args.skipCellFormat, args.isDelete, args.deletedRange, args.fillType, args.cellInformation, args.isRedo, args.isDependentUpdate, args.actionName, args.isPaste);
                break;
        }
    };
    WorkbookEdit.prototype.updateCellValue = function (address, value, sheetIdx, isValueOnly, skipFormatCheck, isRandomFormula, skipCellFormat, isDelete, deletedRange, fillType, cellInformation, isRedo, isDependentUpdate, actionName, isPaste) {
        if (sheetIdx === undefined) {
            sheetIdx = this.parent.activeSheetIndex;
        }
        var range;
        var isFormulaDependent;
        if (typeof address === 'string') {
            range = getRangeIndexes(address);
        }
        else {
            range = address;
        }
        var sheet = getSheet(this.parent, sheetIdx);
        var cell = getCell(range[0], range[1], sheet, true);
        if (!cell) {
            cell = sheet.rows[range[0]].cells[range[1]] = {};
        }
        if (!isValueOnly) {
            var isFormula = checkIsFormula(value);
            isFormula = value === '#SPILL!' ? true : isFormula;
            var skipFormula = false; // for unique formula
            if (cell.formula && cell.formula.indexOf('UNIQUE') > -1 && value === '') {
                skipFormula = true;
            }
            var isNotTextFormat = getTypeFromFormat(cell.format) !== 'Text' && (!isFormula ||
                !value.toLowerCase().startsWith('=text('));
            isFormula = getTypeFromFormat(cell.format) === 'Text' ? false : isFormula;
            if (!isFormula && !skipFormula) {
                if (cell.formula) {
                    cell.formula = '';
                }
                cell.value = isNotTextFormat ? parseIntValue(value, isPaste) : value;
            }
            var eventArgs = {
                action: 'refreshCalculate',
                value: value,
                rowIndex: range[0],
                colIndex: range[1],
                sheetIndex: sheetIdx,
                isFormula: isFormula,
                isRandomFormula: isRandomFormula,
                isDelete: isDelete,
                deletedRange: deletedRange,
                fillType: fillType,
                isDependentRefresh: isDependentUpdate
            };
            if (isNotTextFormat && !skipFormatCheck) {
                var dateEventArgs = {
                    value: value,
                    rowIndex: range[0],
                    colIndex: range[1],
                    sheetIndex: sheetIdx,
                    updatedVal: '',
                    skipCellFormat: skipCellFormat
                };
                if (!isFormula) {
                    var cellType = getTypeFromFormat(cell.format);
                    var valArr = value ? value.toString().split('/') : [];
                    if ((cellType !== 'Number' && cellType !== 'Percentage' && cellType !== 'Fraction' && !(cellType === 'Scientific' && valArr.length === 2)) ||
                        (cellType === 'Fraction' && valArr.length !== 2)) {
                        this.parent.notify(checkDateFormat, dateEventArgs);
                    }
                    if (!isNullOrUndefined(dateEventArgs.updatedVal) && dateEventArgs.updatedVal.length > 0) {
                        cell.value = dateEventArgs.updatedVal;
                    }
                    else if (this.parent.isEdit && value && !isNumber(value)) {
                        var curSymbol = getNumberDependable(this.parent.locale, defaultCurrencyCode);
                        if (cell.format) {
                            if ((value.includes('%') || value.includes(curSymbol)) && isCustomDateTime(cell.format)) {
                                var formatArgs = {
                                    formattedText: value, value: value, format: 'General',
                                    cell: { value: value, format: 'General' }, isEdit: true
                                };
                                this.parent.notify(getFormattedCellObject, formatArgs);
                                if (formatArgs.format !== 'General' && ['Currency', 'Percentage'].indexOf(getTypeFromFormat(formatArgs.format)) > -1) {
                                    cell.format = formatArgs.format;
                                    cell.value = formatArgs.value;
                                }
                            }
                            else {
                                var evtArgs = {
                                    value: cell.value, format: cell.format, formattedText: cell.value,
                                    type: 'General', cell: cell, rowIndex: range[0], colIndex: range[1]
                                };
                                this.parent.notify(getFormattedCellObject, evtArgs);
                            }
                        }
                        else {
                            if (value.includes(curSymbol) || value.includes('%') ||
                                value.includes(getNumericObject(this.parent.locale).group)) {
                                var intl = new Internationalization();
                                var eventArgs_1 = {
                                    intl: intl, updateValue: true, value: '', curSymbol: curSymbol,
                                    cell: cell
                                };
                                this.parent.notify(checkNumberFormat, {
                                    args: eventArgs_1, intl: intl, fResult: value,
                                    cell: cell
                                });
                            }
                        }
                    }
                }
                else if (!isNullOrUndefined(value) && value.toLowerCase().includes('unique(') && value.length > 0) {
                    cell.value = value;
                }
            }
            if (value === '#SPILL!') {
                cell.value = value;
            }
            else {
                var args = { cellIdx: range, isUnique: false };
                this.parent.notify(checkUniqueRange, args);
                if (this.parent.calculationMode === 'Manual' && isFormula && isNullOrUndefined(isDependentUpdate) &&
                    (actionName !== 'autofill' || cell.formula !== '') && !this.parent.isEdit &&
                    isNullOrUndefined(this.parent.element.querySelector('.e-text-replaceInp'))) {
                    skipFormula = true;
                    if (!isRedo && cell.value === undefined) {
                        skipFormula = false;
                    }
                }
                if (!skipFormula && !isDelete) {
                    this.parent.notify(workbookFormulaOperation, eventArgs);
                    isFormulaDependent = eventArgs.isFormulaDependent;
                }
                else {
                    value = cell.value;
                }
                if (isFormula) {
                    cell.formula = eventArgs.value;
                    if (this.parent.calculationMode === 'Manual' && skipFormula && isRedo && !this.parent.isEdit && cellInformation &&
                        cellInformation.cellDetails && cellInformation.cellDetails.length > 0 &&
                        cellInformation.cutCellDetails.length === 0 &&
                        (!isNullOrUndefined(cellInformation.cellDetails[0].autoFillText) ||
                            !isNullOrUndefined(cellInformation.cellDetails[0].copyCellValue))) {
                        for (var i = 0; i < cellInformation.cellDetails.length; i++) {
                            if (cellInformation.cellDetails[i].rowIndex === address[0] &&
                                cellInformation.cellDetails[i].colIndex === address[1]) {
                                if (cellInformation.cellDetails[i].copyCellValue) {
                                    value = cell.value = cellInformation.cellDetails[i].copyCellValue;
                                }
                                else {
                                    value = cell.value = cellInformation.cellDetails[i].autoFillText;
                                }
                                break;
                            }
                        }
                    }
                    else {
                        value = cell.value;
                        if (this.parent.calculationMode === 'Manual' && cellInformation && isRedo && cellInformation.displayText) {
                            value = cell.value = cellInformation.displayText;
                        }
                    }
                    var formula = cell.formula.toLowerCase();
                    var isNeedFormatUpdate = getTypeFromFormat(cell.format) === 'Scientific' && !skipFormatCheck && this.parent.isEdit;
                    if (formula === '=now()' && (!cell.format || cell.format === 'General' || isNeedFormatUpdate)) {
                        cell.format = getFormatFromType('ShortDate') + " h:mm";
                    }
                    else if (formula.includes('=time(') && (!cell.format || isNeedFormatUpdate)) {
                        cell.format = 'h:mm AM/PM';
                    }
                    else if (formula.includes('=date(') && isNeedFormatUpdate) {
                        cell.format = getFormatFromType('ShortDate');
                    }
                }
                else if (cell.value && typeof cell.value === 'string' && (cell.value.indexOf('www.') === 0 ||
                    cell.value.indexOf('https://') === 0 || cell.value.indexOf('http://') === 0 || cell.value.indexOf('ftp://') === 0)) {
                    this.parent.notify(setLinkModel, { hyperlink: cell.value, cell: sheet.name + "!" + getCellAddress(range[0], range[1]) });
                }
            }
        }
        else {
            cell.value = value;
            if (cell.formattedText) {
                delete cell.formattedText;
            }
        }
        this.parent.setUsedRange(range[0], range[1], sheet);
        if (this.parent.chartColl.length && !this.parent.isEdit && !isRandomFormula) {
            this.parent.notify(refreshChart, { cell: cell, rIdx: range[0], cIdx: range[1], sheetIdx: sheetIdx, isRefreshChart: true });
        }
        return isFormulaDependent;
    };
    return WorkbookEdit;
}());
export { WorkbookEdit };
