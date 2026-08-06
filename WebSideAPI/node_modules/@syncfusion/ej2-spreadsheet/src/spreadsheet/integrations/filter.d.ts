import { Spreadsheet } from '../index';
/**
 * `Filter` module is used to handle the filter action in Spreadsheet.
 */
export declare class Filter {
    private parent;
    private filterRange;
    private filterCollection;
    private filterBtn;
    private treeViewObj;
    private treeViewEle;
    private cBox;
    /**
     * Constructor for filter module.
     *
     * @param {Spreadsheet} parent - Specifies the Spreadsheet.
     */
    constructor(parent: Spreadsheet);
    /**
     * To destroy the filter module.
     *
     * @returns {void} - To destroy the filter module.
     */
    protected destroy(): void;
    private addEventListener;
    private removeEventListener;
    /**
     * Gets the module name.
     *
     * @returns {string} - Gets the module name.
     */
    protected getModuleName(): string;
    /**
     * Validates the range and returns false when invalid.
     *
     * @param {SheetModel} sheet - Specify the sheet.
     * @param {string} range - Specify the range.
     * @returns {void} - Validates the range and returns false when invalid.
     */
    private isInValidFilterRange;
    /**
     * Shows the range error alert dialog.
     *
     * @param {any} args - Specifies the args
     * @param {string} args.error - range error string.
     * @returns {void} - Shows the range error alert dialog.
     */
    private filterRangeAlertHandler;
    /**
     * Triggers before filter context menu opened and used to add sorting items.
     *
     * @param {any} args - Specifies the args
     * @param {HTMLElement} args.element - Specify the element
     * @returns {void} - Triggers before filter context menu opened and used to add sorting items.
     */
    private beforeFilterMenuOpenHandler;
    /**
     * Creates new menu item element
     *
     * @param {Element} ul - Specify the element.
     * @param {string} text - Specify the text.
     * @param {string} className - Specify the className
     * @param {string} iconCss - Specify the iconCss
     * @returns {void} - Creates new menu item element
     */
    private addMenuItem;
    /**
     * Initiates the filter UI for the selected range.
     *
     * @param {any} args - Specifies the args
     * @param {PredicateModel[]} args.predicates - Specify the predicates.
     * @param {number} args.range - Specify the range.
     * @param {Promise<FilterEventArgs>} args.promise - Spefify the promise.
     * @param {number} args.sIdx - Specify the sIdx
     * @param {boolean} args.isCut - Specify the bool value
     * @param {boolean} args.isUndoRedo - Specify the bool value
     * @param {boolean} args.isInternal - Specify the isInternal.
     * @param {boolean} args.useFilterRange - Specify the use Filter Range.
     * @param {boolean} args.isOpen - Specify the isOpen.
     * @param {boolean} args.allowHeaderFilter - Specify the allow header filter.
     * @returns {void} - Initiates the filter UI for the selected range.
     */
    private initiateFilterUIHandler;
    /**
     * Processes the range if no filter applied.
     *
     * @param {SheetModel} sheet - Specify the sheet.
     * @param {number} sheetIdx - Specify the sheet index.
     * @param {string} filterRange - Specify the filterRange.
     * @param {boolean} preventRefresh - To prevent refreshing the filter buttons.
     * @param {boolean} useFilterRange - Specifies whether to consider filtering range or used range during filering.
     * @param {boolean} allowHeaderFilter - Specifies whether to consider first row during filtering.
     * @returns {void} - Processes the range if no filter applied.
     */
    private processRange;
    /**
     * Removes all the filter related collections for the active sheet.
     *
     * @param {number} sheetIdx - Specify the sheet index.
     * @param {boolean} isCut - Specify the bool value.
     * @param {boolean} preventRefresh - Specify the preventRefresh.
     * @param {boolean} clearAction - Specify the current action is clear or not.
     * @returns {void} - Removes all the filter related collections for the active sheet.
     */
    private removeFilter;
    /**
     * Handles filtering cell value based on context menu.
     *
     * @returns {void} - Handles filtering cell value based on context menu.
     */
    private filterByCellValueHandler;
    /**
     * Creates filter buttons and renders the filter applied cells.
     *
     * @param { any} args - Specifies the args
     * @param { HTMLElement} args.td - specify the element
     * @param { number} args.rowIndex - specify the rowIndex
     * @param { number} args.colIndex - specify the colIndex
     * @param { number} args.sIdx - specify the sIdx
     * @param { boolean} args.isAction - specify the apply filter action.
     * @returns {void} - Creates filter buttons and renders the filter applied cells.
     */
    private renderFilterCellHandler;
    /**
     * Refreshes the filter header range.
     *
     * @param {number[]} filterRange - Specify the filterRange.
     * @param {boolean} remove - Specify the bool value
     * @param {number} sIdx - Specify the index.
     * @param {boolean} allowHeaderFilter - Specifies whether to consider first row during filtering.
     * @returns {void} - Refreshes the filter header range.
     */
    private refreshFilterRange;
    /**
     * Checks whether the provided cell is a filter cell.
     *
     * @param {number} sheetIdx - Specify the sheet index.
     * @param {number} rowIndex - Specify the row index
     * @param {number} colIndex - Specify the col index.
     * @returns {boolean} - Checks whether the provided cell is a filter cell.
     */
    private isFilterCell;
    /**
     * Checks whether the provided cell is in a filter range
     *
     * @param {number} sheetIdx - Specify the sheet index.
     * @param {number} rowIndex - Specify the row index
     * @param {number} colIndex - Specify the col index.
     * @returns {boolean} - Checks whether the provided cell is in a filter range
     */
    private isFilterRange;
    /**
     * Gets the filter information from active cell
     *
     * @param {any} args - Specifies the args
     * @param {string} args.field - Specify the field
     * @param {string} args.clearFilterText - Specify the clearFilterText
     * @param {boolean} args.isFiltered - Specify the isFiltered
     * @param {boolean} args.isClearAll - Specify the isClearAll
     * @param {number} args.sheetIndex - Specify the sheet index value.
     * @returns {void} - Triggers before context menu created to enable or disable items.
     */
    private getFilteredColumnHandler;
    /**
     * Triggers before context menu created to enable or disable items.
     *
     * @param {any} e - Specifies the args
     * @param {HTMLElement} e.element - Specify the element
     * @param {MenuItemModel[]} e.items - Specify the items
     * @param {MenuItemModel} e.parentItem - Specify the parentItem
     * @param {string} e.target - Specify the target
     * @returns {void} - Triggers before context menu created to enable or disable items.
     */
    private cMenuBeforeOpenHandler;
    /**
     * Closes the filter popup.
     *
     * @returns {void} - Closes the filter popup.
     */
    private closeDialog;
    private removeFilterClass;
    /**
     * Returns true if the filter popup is opened.
     *
     * @returns {boolean} - Returns true if the filter popup is opened.
     */
    private isPopupOpened;
    private filterCellKeyDownHandler;
    private filterMouseDownHandler;
    private cboxListSelected;
    private initCboxList;
    private createSelectAll;
    private updateState;
    private beforeFilteringHandler;
    private customFilterOpen;
    private wireFilterEvents;
    private initTreeView;
    private generatePredicate;
    private refreshCheckbox;
    private openDialog;
    private getPredicateRange;
    private filterDialogCreatedHandler;
    /**
     * Formats cell value for listing it in filter popup.
     *
     * @param {any} args - Specifies the args
     * @param {string | number} args.value - Specify the value
     * @param {object} args.column - Specify the column
     * @param {object} args.data - Specify the data
     * @returns {void} - Formats cell value for listing it in filter popup.
     */
    private filterCboxValueHandler;
    /**
     * Triggers when sorting items are chosen on context menu of filter popup.
     *
     * @param {HTMLElement} target - Specify the element.
     * @returns {void} - Triggers when sorting items are chosen on context menu of filter popup.
     */
    private selectSortItemHandler;
    /**
     * Triggers when OK button or clear filter item is selected
     *
     * @param {DataManager} dataSource - Specify the data source
     * @param {Object} args - Specify the data source
     * @param {string} args.action - Specify the action
     * @param {PredicateModel[]} args.filterCollection - Specify the filter collection.
     * @param {string} args.field - Specify the field.
     * @param {number} args.sIdx - Specify the index.
     * @param {boolean} args.isInternal - Specify the isInternal.
     * @param {boolean} args.isFilterByValue - Specify the isFilterByValue.
     * @param {PredicateModel[]} args.prevPredicates - Specify the prevPredicates.
     * @param {boolean} args.isOpen - Specify the filtering action is after importing.
     * @returns {void} - Triggers when OK button or clear filter item is selected
     */
    private filterSuccessHandler;
    private isCustomNumFilter;
    private getClonedPredicates;
    private updatePredicate;
    /**
     * Triggers events for filtering and applies filter.
     *
     * @param {FilterOptions} filterOptions - Specify the filteroptions.
     * @param {string} range - Specify the range.
     * @param {number} sheetIdx - Specify the sheet index.
     * @param {PredicateModel[]} prevPredicates - Specify the predicates.
     * @param {boolean} refresh - Spefify the refresh.
     * @param {boolean} isInternal - Specify the isInternal.
     * @param {boolean} isFilterByValue - Specify the it is filter by value or not.
     * @returns {void} - Triggers events for filtering and applies filter.
     */
    private applyFilter;
    /**
     * Gets the predicates for the sheet
     *
     * @param {PredicateModel[]} predicateModel - Specifies the predicate collection.
     * @returns {Predicate[]} - Gets the predicates for the sheet
     */
    private getPredicates;
    /**
     * Gets the column type to pass it into the excel filter options.
     *
     * @param {SheetModel} sheet - Specify the sheet.
     * @param {number} colIndex - Specify the colindex
     * @param {number[]} range - Specify the range.
     * @param {boolean} isFilterDialog - Indicates whether the filter dialog UI is open.
     * @returns {string} - Gets the column type to pass it into the excel filter options.
     */
    private getColumnType;
    /**
     * Clear filter from the field.
     *
     * @param {any} args - Specifies the args
     * @param {{ field: string }} args.field - Specify the args
     * @param {boolean} args.isAction - Specify the isAction.
     * @param {boolean} args.preventRefresh - Specify the preventRefresh.
     * @param {number} args.sheetIndex - Specify the sheet index value.
     * @returns {void} - Clear filter from the field.
     */
    private clearFilterHandler;
    /**
     * Reapplies the filter.
     *
     * @param {boolean} isInternal - Specifies the isInternal.
     * @param {boolean} refresh - Specifies the refresh.
     * @returns {void} - Reapplies the filter.
     */
    private reapplyFilterHandler;
    /**
     * Gets the filter information of the sheet.
     *
     * @param {FilterInfoArgs} args - Specify the args
     * @returns {void} - Gets the filter information of the sheet.
     */
    private getFilterRangeHandler;
    /**
     * Returns the custom operators for filter items.
     *
     * @returns {Object} - Returns the custom operators for filter items.
     */
    private getLocalizedCustomOperators;
    /**
     * To set the filtered range and predicates collections in the save JSON object.
     *
     * @param {any} args - Specifies the args
     * @param {number} args.sheetIdx - Specifies the sheet index value.
     * @param {boolean} args.isSaveAction - Specifies the Save action.
     * @param {any} args.saveJson - Specifies save as Json.
     * @param {FilterCollectionModel[]} args.saveJson.filterCollection - Specifies the filter collection values.
     * @returns {void}
     */
    private setFilteredCollection;
    private updateFilter;
    private getColData;
    private getFilterOperator;
    private beforeInsertHandler;
    private beforeDeleteHandler;
    private deleteSheetHandler;
    private clearHandler;
    private duplicateSheetFilterHandler;
    private updateSortCollectionHandler;
    private moveSheetHandler;
    private refreshFilterCellsOnResize;
}
