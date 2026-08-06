import { Internationalization } from '@syncfusion/ej2-base';
import { CellModel } from '../base';
/**
 * @hidden
 * @param {number} val - Specifies the val.
 * @returns {string} - To get Fraction.
 */
export declare function toFraction(val: number): string;
/**
 * @hidden
 * @param {string | number} a - Specifies the a.
 * @param {string | number} b - Specifies the b.
 * @returns {number} - To get Gcd.
 */
export declare function getGcd(a: string | number, b: string | number): number;
/**
 * @hidden
 * @param {number} val - Specifies the value.
 * @returns {Date} - Returns Date.
 */
export declare function intToDate(val: number | string): Date;
/**
 * @hidden
 * @param {number} val - Specifies the value.
 * @param {boolean} isTime - Specifies the boolean value.
 * @param {boolean} isTimeOnly - Specifies the value is only a time without date.
 * @returns {number} - Returns number.
 */
export declare function dateToInt(val: any, isTime?: boolean, isTimeOnly?: boolean): number;
/**
 * @hidden
 * @param {any} date - Specifies the date.
 * @returns {boolean} - Returns boolean value.
 */
export declare function isDateTime(date: any): boolean;
/**
 * @hidden
 * @param {string} val - Specifies the value.
 * @returns {boolean} - Returns boolean value.
 */
export declare function isNumber(val: string | number): boolean;
/**
 * @hidden
 * @param {string | number} val - Specifies the value.
 * @returns {string} - Returns converted value.
 */
export declare function evaluate(val: string | number): string;
/**
 * @hidden
 * @param {Date | string | number} text - Specifies the text.
 * @param {Internationalization} intl - Specifies the Internationalization.
 * @param {string} locale - Specifies the locale.
 * @param {string} format - Specifies the string.
 * @param {CellModel} cell - Specify the cell.
 * @param {boolean} isDateTime -Specify is DateTime value or not.
 * @returns {ToDateArgs} - Returns Date format.
 */
export declare function toDate(text: Date | string | number, intl: Internationalization, locale: string, format?: string, cell?: CellModel, isDateTime?: boolean): ToDateArgs;
/**
 * @hidden
 * @param {string} value - Specifies the value.
 * @param {boolean} isPaste - Optional flag indicating whether the value came from a paste action.
 * @param {boolean} isFromExternalPaste - Optional flag indicating whether the value came from a getExternalCells method.
 * @returns { string | number} - ReturnsparseIntValue.
 */
export declare function parseIntValue(value: string, isPaste?: boolean, isFromExternalPaste?: boolean): string | number;
export interface ToDateArgs {
    dateObj: Date;
    type: string;
    isCustom: boolean;
}
