import { Spreadsheet } from '../base/index';
import { PrintOptions } from '../../workbook/index';
/**
 * This class supports the printing functionality in Spreadsheet.
 */
export declare class Print {
    private parent;
    private totalSheetCount;
    private workbookActiveSheetCount;
    private defaultCellWidth;
    private defaultCellHeight;
    private pageCounts;
    private initialRowCount;
    private chartHeight;
    private columnIndex;
    private rowIndex;
    private multipleCanvasDataURL;
    private chartElements;
    private totalCharts;
    private isChartLoaded;
    private chartLoadedCount;
    private isImageLoaded;
    private totalImages;
    private imageLoadedCount;
    private endRow;
    private isColumn;
    private startNewPageCount;
    private allowTimer;
    /**
     * Constructor for Print module
     *
     * @param {Spreadsheet} parent - Specifies the spreadsheet instance.
     */
    constructor(parent: Spreadsheet);
    /**
     * To create the print module.
     *
     * @param {Spreadsheet} spreadsheet - Specifies the spreadsheet instance.
     * @param {PrintOptions} printOptions - Specifies the print options.
     * @returns {void} - To create the print module.
     * @private
     */
    print(spreadsheet: Spreadsheet, printOptions: PrintOptions): void;
    private updateChartRowAndColumnIndices;
    private activeSheetPrint;
    private processCell;
    private setBorderStyle;
    private setToDefault;
    private handleCharts;
    private processImages;
    private textDecoration;
    private rowHeaderRect;
    private rowHeaderText;
    private canvasPrint;
    private drawBorder;
    private drawPath;
    private drawDoubleBorder;
    private calculateTextPosition;
    private calculatePageCount;
    private wrapText;
    /**
     * Get module name.
     *
     * @returns {string} - Returns the module name.
     */
    protected getModuleName(): string;
    /**
     * To destroy the print.
     *
     * @returns {void}
     * @private
     */
    destroy(): void;
}
