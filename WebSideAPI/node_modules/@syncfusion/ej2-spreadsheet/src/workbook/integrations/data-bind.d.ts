import { Workbook } from '../base/index';
/**
 * Data binding module
 */
export declare class DataBind {
    private parent;
    private requestedInfo;
    constructor(parent: Workbook);
    private addEventListener;
    private removeEventListener;
    /**
     * Update given data source to sheet.
     *
     * @param {Object} args - Specify the args.
     * @param {ExtendedSheet} args.sheet - Specify the sheet.
     * @param {number[]} args.indexes - Specify the indexes.
     * @param {Promise<CellModel>} args.promise - Specify the promise.
     * @param {number} args.rangeSettingCount - Specify the rangeSettingCount.
     * @param {string} args.formulaCellRef - Specify the formulaCellRef.
     * @param {number} args.sheetIndex - Specify the sheetIndex.
     * @param {boolean} args.loadFullData - Specify whether to load full data or not.
     * @param {boolean} args.resolveAfterFullDataLoaded - Specify the resolveAfterFullDataLoaded.
     * @param {Function} args.loadComplete - Specify the callback function that will be invoked once all the data are updated.
     * @param {boolean} args.loadFromStartCell - Specify the whether to load the data from the range startCell address.
     * @param {boolean} args.autoDetectFormat - Specify whether to auto detect format based on the cell value.
     * @param {Function} args.updateDependentCellsCallback - Specify a callback function to update the dependent cells address to refresh
     * after the data binding.
     * @returns {void} - Update given data source to sheet.
     */
    private updateSheetFromDataSourceHandler;
    private notfyFormulaCellRefresh;
    private checkResolve;
    private getCellDataFromProp;
    private getLoadedInfo;
    private getMaxCount;
    private initRangeInfo;
    /**
     * Remove old data from sheet.
     *
     * @param {Object} args - Specify the args.
     * @param {number} args.sheetIdx - Specify the sheetIdx.
     * @param {number} args.rangeIdx - Specify the rangeIdx.
     * @param {Object[]} args.changedData - Specify the changedData.
     * @returns {void} - Remove old data from sheet.
     */
    private dataSourceChangedHandler;
    private checkRangeHasChanges;
    /**
     * Triggers dataSourceChange event when cell data changes
     *
     * @param {Object} args - Specify the args.
     * @param {number} args.sheetIdx - Specify the sheetIdx.
     * @param {number} args.activeSheetIndex - Specify the activeSheetIndex.
     * @param {string} args.address - Specify the address.
     * @param {number} args.startIndex - Specify the startIndex.
     * @param {number} args.endIndex - Specify the endIndex.
     * @param {string} args.modelType - Specify the modelType.
     * @param {RowModel[]} args.deletedModel - Specify the deletedModel.
     * @param {RowModel[]} args.model - Specify the model.
     * @param {string} args.insertType - Specify the insertType.
     * @param {number} args.index - Specify the index.
     * @param {string} args.type - Specify the type.
     * @param {boolean} args.isMethod - Specify the isMethod.
     * @param {string} args.fillRange - Specify the fill range.
     * @param {string} args.range - Specify the range.
     * @param {string} args.requestType - Specify the requestType.
     * @param {Object[]} args.data - Specify the data.
     * @param {boolean}  args.isDataRequest - Specify the isDataRequest.
     * @param {string} args.pastedRange - Specify the pasted range.
     * @param {boolean} args.skipFilterCheck - Specify the skip filter check.
     * @returns {void} - Triggers dataSourceChange event when cell data changes
     */
    private dataChangedHandler;
    private getFormattedValue;
    private triggerDataChangeHandler;
    /**
     * For internal use only - Get the module name.
     *
     * @returns {string} - Get the module name.
     * @private
     */
    protected getModuleName(): string;
    /**
     * Destroys the Data binding module.
     *
     * @returns {void} - Destroys the Data binding module.
     */
    destroy(): void;
}
