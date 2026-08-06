import { CellModel } from '../base/index';
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
export declare function checkIsNumberAndGetNumber(cell: CellModel, locale: string, groupSep?: string, decimalSep?: string, currencySym?: string, isFractionalType?: boolean, checkCurrency?: boolean): {
    isNumber: boolean;
    value: string;
};
/**
 * @param {string} value - Specifies the value.
 * @param {string} locale - Specifies the locale.
 * @param {string} groupSep - Specifies the group separator.
 * @param {string} decimalSep - Specifies the decimal separator.
 * @returns {boolean} - Returns parsed thousand separator.
 * @hidden
 */
export declare function parseThousandSeparator(value: string, locale: string, groupSep: string, decimalSep: string): boolean;
