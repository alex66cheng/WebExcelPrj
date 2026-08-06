import { Spreadsheet } from '../base/index';
/**
 * Represents SheetTabs for Spreadsheet.
 */
export declare class SheetTabs {
    private parent;
    private tabInstance;
    private dropDownInstance;
    private addBtnRipple;
    private aggregateDropDown;
    private aggregateContent;
    private selaggregateCnt;
    constructor(parent: Spreadsheet);
    getModuleName(): string;
    private createSheetTabs;
    private goToSheet;
    private updateDropDownItems;
    private beforeOpenHandler;
    private openHandler;
    private getSheetTabItems;
    private refreshSheetTab;
    private addSheetTab;
    private insertSheetTab;
    private updateSheetTab;
    private showSheet;
    private switchSheetTab;
    private skipHiddenSheets;
    private renameSheetTab;
    private updateWidth;
    private renameKeyDown;
    private renameInputFocusOut;
    private focusTab;
    private updateSheetName;
    private hideSheet;
    private removeRenameInput;
    private showRenameDialog;
    private focusRenameInput;
    private removeSheetTab;
    private forceDelete;
    private destroySheet;
    private showAggregate;
    private getAggregateItems;
    private updateAggregateContent;
    private removeAggregate;
    private addEventListener;
    destroy(): void;
    private removeEventListener;
}
