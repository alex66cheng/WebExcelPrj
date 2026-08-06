import { Spreadsheet } from '../index';
/**
 * The `Protect-sheet` module is used to handle the Protecting functionalities in Spreadsheet.
 */
export declare class ProtectSheet {
    private parent;
    private optionList;
    /**
     * Constructor for protectSheet module in Spreadsheet.
     *
     * @param {Spreadsheet} parent - Specify the spreadsheet.
     * @private
     */
    constructor(parent: Spreadsheet);
    private init;
    /**
     * To destroy the protectSheet module.
     *
     * @returns {void} - To destroy the protectSheet module.
     * @hidden
     */
    destroy(): void;
    private addEventListener;
    private removeEventListener;
    private protect;
    private createDialogue;
    private dialogOpen;
    private selectOption;
    private applySheetPwd;
    private updateProtectSheet;
    private protectSheetHandler;
    private editProtectedAlert;
    private protectWorkbook;
    private passwordProtectContent;
    private KeyUpHandler;
    private alertMessage;
    private dlgClickHandler;
    private protectWorkbookHandler;
    private unProtectWorkbook;
    private unProtectsheet;
    private reEnterSheetPassword;
    private unProtectPasswordContent;
    private unProtectSheetPasswordContent;
    private unprotectdlgOkClick;
    private removeWorkbookProtection;
    private unprotectSheetdlgOkClick;
    private unProtectSheetPassword;
    private importProtectWorkbook;
    private importProtectPasswordContent;
    private importOkClick;
    private toggleProtect;
    /**
     * Get the module name.
     *
     * @returns {string} - Get the module name.
     *
     * @private
     */
    getModuleName(): string;
}
