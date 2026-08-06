import { evaluate, isNumber } from '../common/index';
import { getNumericObject, isUndefined } from '@syncfusion/ej2-base';
/**
 * Check the value of the cell is number with thousand separator and currency symbol and returns the parsed value.
 *
 * @param {CellModel} cell - Specifies the cell.
 * @param {string} locale - Specifies the locale.
 * @param {string} groupSep - Specifies the group separator.
 * @param {string} decimalSep - Specifies the decimal separator.
 * @param {string} currencySym - Specifies the currency Symbol.
 * @param {boolean} isFractionalType - Defines whether the value is a fractional type or not.
 * @param {boolean} checkCurrency - Specifies the currency check.
 * @returns {Object} - returns the parsed value.
 * @hidden
 */
export function checkIsNumberAndGetNumber(cell, locale, groupSep, decimalSep, currencySym, isFractionalType, checkCurrency) {
    var cellValue = cell.value;
    if (cellValue && typeof cellValue === 'string') {
        if (cellValue.includes('\n')) {
            return { isNumber: false, value: cellValue };
        }
        if (isNumber(cellValue)) {
            return { isNumber: true, value: cellValue };
        }
        if (currencySym && cellValue.includes(currencySym) && (checkCurrency || cell.format.includes(currencySym) || cell.format.includes('$'))) {
            cellValue = cellValue.replace(currencySym, '').trim();
        }
        if (groupSep && cellValue.includes(groupSep) && parseThousandSeparator(cellValue, locale, groupSep, decimalSep)) {
            cellValue = cellValue.split(groupSep).join('').trim();
        }
        if (!decimalSep) {
            decimalSep = getNumericObject(locale).decimal;
        }
        if (decimalSep !== '.' && cellValue.includes(decimalSep)) {
            cellValue = cellValue.replace(decimalSep, '.').trim();
        }
        if (isNumber(cellValue)) {
            return { isNumber: true, value: cellValue };
        }
        if (isFractionalType && cellValue.split('/').length === 2) {
            try {
                var splittedVal = cellValue.split(' ');
                if (splittedVal.length === 2 && splittedVal[0].split('/').length === 1) {
                    var result = evaluate(splittedVal[0]);
                    var result1 = evaluate(splittedVal[1]);
                    cellValue = result + result1;
                }
                else {
                    cellValue = evaluate(cellValue);
                }
                return { isNumber: true, value: cellValue };
            }
            catch (error) {
                return { isNumber: false, value: cellValue };
            }
        }
    }
    else if (isNumber(cellValue)) {
        return { isNumber: true, value: cellValue };
    }
    return { isNumber: false, value: cellValue };
}
/**
 * @param {string} value - Specifies the value.
 * @param {string} locale - Specifies the locale.
 * @param {string} groupSep - Specifies the group separator.
 * @param {string} decimalSep - Specifies the decimal separator.
 * @returns {boolean} - Returns parsed thousand separator.
 * @hidden
 */
export function parseThousandSeparator(value, locale, groupSep, decimalSep) {
    var isParsed = false;
    var number = 123456;
    var parsedNum = number.toLocaleString(locale);
    var splitedNum = parsedNum.split(groupSep).reverse();
    var splitedValue = value.split(decimalSep)[0].split(groupSep);
    for (var i = 0; i < splitedValue.length; i++) {
        if (i === splitedValue.length - 1) {
            isParsed = splitedValue[i].length === splitedNum[0].length;
        }
        else {
            isParsed = !isUndefined(splitedNum[1]) && (i === 0 ? splitedValue[i].length <= splitedNum[1].length :
                splitedValue[i].length === splitedNum[1].length);
        }
        if (!isParsed) {
            break;
        }
    }
    return isParsed;
}
