import { NumberFormatType } from '../common/index';
import { Workbook } from '../base/index';
import { DateFormatCheckArgs } from '../common/index';
import { NumberFormatArgs } from './../index';
/**
 * Specifies number format.
 */
export declare class WorkbookNumberFormat {
    private parent;
    private localeObj;
    private customFormats;
    private localizedFormats;
    constructor(parent: Workbook);
    private numberFormatting;
    private isDigitPlaceHolder;
    private parseToLocalizedFormat;
    private updateLocalizedFormats;
    private localizedFormatAction;
    private parseToDefaultFormat;
    /**
     * @hidden
     *
     * @param {Object} args - Specifies the args.
     * @returns {string} - to get formatted cell.
     */
    getFormattedCell(args: NumberFormatArgs): string;
    private isCustomType;
    private processCustomFill;
    private processCustomDateTime;
    private processCustomConditions;
    private processCustomAccounting;
    private processCustomText;
    private thousandSeparator;
    private getSeparatorCount;
    private processDigits;
    private processFormatWithSpace;
    private removeFormatColor;
    private processCustomNumberFormat;
    private processText;
    private processFormats;
    private autoDetectGeneralFormat;
    private parseDecimalNumber;
    private updateAutoDetectNumberFormat;
    private isPercentageValue;
    private findSuffix;
    private applyNumberFormat;
    private isCustomFormat;
    private currencyFormat;
    private applyColor;
    private setCell;
    private percentageFormat;
    private accountingFormat;
    private getFormatForOtherCurrency;
    private checkAndProcessNegativeValue;
    private shortDateFormat;
    private longDateFormat;
    private checkForDateFormat;
    private timeFormat;
    private scientificHashFormat;
    private scientificFormat;
    private fractionFormat;
    private checkAndSetColor;
    private findDecimalPlaces;
    checkDateFormat(args: DateFormatCheckArgs): void;
    private checkCustomTimeFormat;
    private checkCustomDateFormat;
    private formattedBarText;
    private getFormattedNumber;
    private getMatchingCustomFormat;
    /**
     * Adding event listener for number format.
     *
     * @returns {void} - Adding event listener for number format.
     */
    private addEventListener;
    /**
     * Removing event listener for number format.
     *
     * @returns {void} -  Removing event listener for number format.
     */
    private removeEventListener;
    /**
     * To Remove the event listeners.
     *
     * @returns {void} - To Remove the event listeners.
     */
    destroy(): void;
    /**
     * Get the workbook number format module name.
     *
     * @returns {string} - Get the module name.
     */
    getModuleName(): string;
}
/**
 * Retrieves the built-in format code based on the specified number format type in either localized or non-localized format.
 *
 * @param {string} type - Specifies the type of number formatting.
 * @returns {string} - The built-in format code for the specified number format type.
 */
export declare function getFormatFromType(type: NumberFormatType): string;
/**
 * @hidden
 * @param {string} format -  Specidfies the format.
 * @param {boolean} isRibbonUpdate - Specifies where we are updating the type in the number format button.
 * @returns {string} - To get type from format.
 */
export declare function getTypeFromFormat(format: string, isRibbonUpdate?: boolean): string;
/**
 * This method converts a culture-specific format code, which may include localized decimal separators, group separators, and
 * currency symbols, to a default culture (en-US) format code. The default format uses a default decimal separator (.),
 * group separators (,), and a currency symbol.
 *
 * @param {Workbook} context - Specifies the workbook instance containing the format code to be converted.
 * @param {string} format - The culture-specific format code, with localized decimal separators, group separators, and currency symbols,
 * that needs to be converted to the default format.
 * @returns {string} - Returns the default culture (en-US) format code, using the default decimal separator (.), group separators (,), and
 * currency symbol.
 */
export declare function convertToDefaultFormat(context: Workbook, format: string): string;
/**
 * Specifies the number format ID and their number format code.
 */
export interface FormatOption {
    /** The Excel default number format ID. */
    id: number;
    /** The number format code associated with the ID. */
    code: string;
}
/**
 * Populates culture-based number formats in the custom format dialog. By default, the decimal separator, group separator, and
 * currency symbol are updated based on the current culture. Currency and date formats can vary across cultures.
 * Excel maintains a default number format ID for each format code in the custom format dialog. This method maps these culture-based
 * format codes to their corresponding number format IDs, and the mapped formats will be populated in the custom format dialog.
 *
 * @param {Workbook} context - Specifies the workbook instance. If the component is not initialized, pass null for this parameter.
 * @param {FormatOption[]} formatOptions - Specifies the collection of number format IDs and their corresponding format codes.
 * @param {boolean} [clearMappedFormats] - Specifies whether to clear existing mapped formats or not. By default, this is set to true.
 * @returns {void}
 */
export declare function configureLocalizedFormat(context: Workbook, formatOptions: FormatOption[], clearMappedFormats?: boolean): void;
