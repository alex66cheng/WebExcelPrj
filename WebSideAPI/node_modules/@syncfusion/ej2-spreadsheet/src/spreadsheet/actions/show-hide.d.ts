import { Spreadsheet } from '../base/index';
/**
 * The `ShowHide` module is used to perform hide/show the rows and columns.
 *
 * @hidden
 */
export declare class ShowHide {
    private parent;
    /**
     * Constructor for the Spreadsheet show hide module.
     *
     * @param {Spreadsheet} parent - Specify the spreadsheet instance.
     * @private
     */
    constructor(parent: Spreadsheet);
    private hideShow;
    private updateIndexOnlyForHiddenColumnsAndRows;
    private hideRow;
    private hideCol;
    private removeCell;
    private appendCell;
    private refreshChart;
    private refreshChartCellModel;
    private addEventListener;
    private destroy;
    private removeEventListener;
}
