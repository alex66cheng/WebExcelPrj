import { Spreadsheet } from '../base/index';
/**
 * `FindAndReplace` module is used to handle the search action in Spreadsheet.
 */
export declare class FindAndReplace {
    private parent;
    private shortValue;
    private findDialog;
    private findValue;
    /**
     * Constructor for FindAndReplace module.
     *
     * @param {Spreadsheet} parent - Constructor for FindAndReplace module.
     */
    constructor(parent: Spreadsheet);
    private addEventListener;
    private removeEventListener;
    private findToolDlg;
    private refreshFindDlg;
    private updateCount;
    private closeDialog;
    private renderFindDlg;
    private dialogBeforeClose;
    private dialogMessage;
    private renderGotoDlg;
    private textFocus;
    private findHandler;
    private replaceHandler;
    private gotoHandler;
    private gotoAlert;
    private showFindAlert;
    private replaceAllDialog;
    private findKeyUp;
    private divElements;
    private paraElements;
    private inputElements;
    private textBoxElements;
    private dropDownListElements;
    private checkBoxElements;
    private findandreplaceContent;
    private GotoContent;
    /**
     * To destroy the find-and-replace module.
     *
     * @returns {void} - To destroy the find-and-replace module.
     */
    protected destroy(): void;
    /**
     * Gets the module name.
     *
     * @returns {string} - Gets the module name.
     */
    protected getModuleName(): string;
}
