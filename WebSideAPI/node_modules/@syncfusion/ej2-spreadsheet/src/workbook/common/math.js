import { isNullOrUndefined, IntlBase, cldrData } from '@syncfusion/ej2-base';
/**
 * @hidden
 * @param {number} val - Specifies the val.
 * @returns {string} - To get Fraction.
 */
export function toFraction(val) {
    var strVal = val.toString();
    if (val === parseInt(strVal, 10)) {
        return parseInt(strVal, 10) + '  ';
    }
    else {
        var top_1 = strVal.indexOf('.') > -1 ? strVal.split('.')[1] : 0;
        var bottom = Math.pow(10, top_1.toString().replace('-', '').length);
        var abs = Math.abs(getGcd(top_1, bottom));
        return (top_1 / abs) + '/' + (bottom / abs);
    }
}
/**
 * @hidden
 * @param {string | number} a - Specifies the a.
 * @param {string | number} b - Specifies the b.
 * @returns {number} - To get Gcd.
 */
export function getGcd(a, b) {
    a = Number(a);
    b = Number(b);
    return (b) ? getGcd(b, a % b) : a;
}
/**
 * @hidden
 * @param {number} val - Specifies the value.
 * @returns {Date} - Returns Date.
 */
export function intToDate(val) {
    val = Number(val);
    val = (val > 0 && val < 1) ? (1 + val) : (val === 0) ? 1 : val;
    if (val > 60) {
        val -= 1; // Due to leap year issue of 1900 in MSExcel.
    }
    var startDate = new Date('01/01/1900');
    var startDateUTC = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), startDate.getHours(), startDate.getMinutes(), startDate.getSeconds(), startDate.getMilliseconds());
    return new Date(new Date(((val - 1) * (1000 * 3600 * 24)) + startDateUTC).toUTCString().replace(' GMT', ''));
}
/* eslint-disable  @typescript-eslint/no-explicit-any */
/**
 * @hidden
 * @param {number} val - Specifies the value.
 * @param {boolean} isTime - Specifies the boolean value.
 * @param {boolean} isTimeOnly - Specifies the value is only a time without date.
 * @returns {number} - Returns number.
 */
export function dateToInt(val, isTime, isTimeOnly) {
    var startDate = new Date('01/01/1900');
    var date = isDateTime(val) ? val : new Date(val);
    var startDateUTC = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), startDate.getHours(), startDate.getMinutes(), startDate.getSeconds(), startDate.getMilliseconds());
    var dateUTC = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
    var diffDays = ((dateUTC - startDateUTC) / (1000 * 3600 * 24));
    return (isTime ? diffDays : parseInt(diffDays.toString(), 10)) + (isTimeOnly ? 0 : (diffDays > 60 ? 2 : 1));
}
/**
 * @hidden
 * @param {any} date - Specifies the date.
 * @returns {boolean} - Returns boolean value.
 */
export function isDateTime(date) {
    return Object.prototype.toString.call(date) === '[object Date]' && !isNaN(date.valueOf());
}
/**
 * @hidden
 * @param {string} val - Specifies the value.
 * @returns {boolean} - Returns boolean value.
 */
export function isNumber(val) {
    return val - parseFloat(val) >= 0;
}
/**
 * @hidden
 * @param {string | number} val - Specifies the value.
 * @returns {string} - Returns converted value.
 */
export function evaluate(val) {
    return Function('"use strict";return (' + val + ')')();
}
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
export function toDate(text, intl, locale, format, cell, isDateTime) {
    var defaultDateFormats = IntlBase.getDependables(cldrData, locale, null).dateObject;
    var availabelDateTimeFormat = defaultDateFormats.dateTimeFormats.availableFormats;
    var dObj = { dateObj: null, isCustom: false, type: '' };
    var dateVal;
    var updateTime = function () {
        if (dObj.type === 'time') {
            dObj.dateObj = new Date((dateVal ? dateVal.toDateString() : '01/01/1900') + ' ' + dObj.dateObj.toLocaleTimeString());
        }
    };
    if (format) {
        dObj.dateObj = intl.parseDate(text, { format: format });
        if (dObj.dateObj) {
            dObj.type = text.toString().indexOf(':') > -1 ? 'time' : 'datetime';
            updateTime();
            dObj.isCustom = true;
        }
    }
    if (isNullOrUndefined(dObj.dateObj)) {
        text = text.toString();
        if (text && text.indexOf('/') > -1 || text.indexOf('-') > 0) {
            var cFormat = (cell && cell.format) || format;
            if (cFormat) {
                var hyphenDate = cFormat.toLowerCase().includes('dd-mm-yy');
                if (hyphenDate || cFormat.toLowerCase().includes('dd/mm/yy')) {
                    cFormat = hyphenDate ? 'd-M-y' : 'd/M/y';
                    dObj.dateObj = intl.parseDate(text, { format: cFormat, skeleton: 'yMd' });
                    if (dObj.dateObj) {
                        dObj.type = 'date';
                        return dObj;
                    }
                }
            }
        }
        var parseDateTimeValue = function (text) {
            if (text.indexOf(':') < 0) {
                for (var _i = 0, _a = Object.keys(defaultDateFormats.dateFormats); _i < _a.length; _i++) {
                    var key = _a[_i];
                    dObj.dateObj = intl.parseDate(text, { format: defaultDateFormats.dateFormats["" + key], skeleton: key });
                    if (dObj.dateObj) {
                        dObj.type = 'date';
                        dObj.isCustom = false;
                        break;
                    }
                }
            }
            if (isNullOrUndefined(dObj.dateObj)) {
                var dateTimeFormat = void 0;
                for (var _b = 0, _c = Object.keys(availabelDateTimeFormat); _b < _c.length; _b++) {
                    var key = _c[_b];
                    dateTimeFormat = availabelDateTimeFormat["" + key];
                    dObj.dateObj = intl.parseDate(text, { format: dateTimeFormat, skeleton: key });
                    if (!dObj.dateObj && text.indexOf(':') > -1 && dateTimeFormat.indexOf(':') > -1) { // parsing time format without am or pm
                        dObj.dateObj = intl.parseDate(text, { format: dateTimeFormat.split(' ')[0] });
                    }
                    if (dObj.dateObj) {
                        dObj.type = text.toString().indexOf(':') > -1 ? 'time' : 'datetime';
                        updateTime();
                        dObj.isCustom = true;
                        break;
                    }
                }
            }
            if (isNullOrUndefined(dObj.dateObj)) {
                for (var _d = 0, _e = Object.keys(defaultDateFormats.timeFormats); _d < _e.length; _d++) {
                    var key = _e[_d];
                    dObj.dateObj = intl.parseDate(text, { format: defaultDateFormats.timeFormats["" + key], skeleton: key });
                    if (dObj.dateObj) {
                        dObj.type = 'time';
                        updateTime();
                        dObj.isCustom = false;
                        break;
                    }
                }
            }
        };
        if (isDateTime) {
            var dateTimeArr = text.split(' ');
            if (dateTimeArr.length >= 2) {
                parseDateTimeValue(dateTimeArr.shift());
                if (dObj.dateObj) {
                    dateVal = dObj.dateObj;
                    dObj.dateObj = null;
                    parseDateTimeValue(dateTimeArr.join(' '));
                    if (dObj.dateObj) {
                        dObj.type = 'datetime';
                    }
                }
            }
        }
        else {
            parseDateTimeValue(text);
        }
    }
    if (text !== '#DIV/0!' && !dObj.dateObj && new Date(text).toString() !== 'Invalid Date') {
        dObj.dateObj = new Date(text);
        dObj.type = 'date';
    }
    return dObj;
}
/**
 * @hidden
 * @param {string} value - Specifies the value.
 * @param {boolean} isPaste - Optional flag indicating whether the value came from a paste action.
 * @param {boolean} isFromExternalPaste - Optional flag indicating whether the value came from a getExternalCells method.
 * @returns { string | number} - ReturnsparseIntValue.
 */
export function parseIntValue(value, isPaste, isFromExternalPaste) {
    if (value && value !== '.' && value !== '-') {
        var val = value.toString();
        var maxSafeIntegerLength = Number.MAX_SAFE_INTEGER.toString().length;
        if (val.startsWith('-')) {
            val = val.slice(1);
            val = val.includes('-') ? value : val;
        }
        if (/^\d*\.?\d*$/.test(val)) {
            // If the number is longer than the safe integer length.
            if (isPaste && (val.length > maxSafeIntegerLength || (isFromExternalPaste && (val.startsWith('0') || val.endsWith('0'))))) {
                return value; //skip parsefloat to get the precise value while pasting.
            }
            else {
                return parseFloat(value);
            }
        }
    }
    return value;
}
