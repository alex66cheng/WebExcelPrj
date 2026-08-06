import { Workbook } from '../base/index';
/**
 * WorkbookAutoFill module allows to perform auto fill functionalities.
 */
export declare class WorkbookAutoFill {
    private parent;
    private fillInfo;
    /**
     * Constructor for the workbook AutoFill module.
     *
     * @param {Workbook} parent - Specifies the workbook.
     * @private
     */
    constructor(parent: Workbook);
    private getFillInfo;
    private isRange;
    private autoFill;
    private fillSeries;
    private copyCells;
    private applyWrapToOuterCells;
    private updateFillValues;
    private getDataPattern;
    private getPredictionValue;
    private getPattern;
    private getNextFormattedValue;
    private isCellReference;
    private round;
    private getRangeData;
    private getFormulaPattern;
    private generateColCount;
    private getCellRefPrediction;
    private isInPattern;
    private ensurePattern;
    private getSelectedRange;
    private getFillType;
    private addEventListener;
    /**
     * Destroy workbook AutoFill module.
     *
     * @returns {void} - destroy the workbook AutoFill module.
     */
    destroy(): void;
    private removeEventListener;
    /**
     * Get the workbook AutoFill module name.
     *
     * @returns {string} - Return the string.
     */
    getModuleName(): string;
}
