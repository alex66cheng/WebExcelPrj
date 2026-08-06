import { Spreadsheet } from '../base/index';
/**
 * Represents keyboard shortcut support for Spreadsheet.
 */
export declare class KeyboardShortcut {
    private parent;
    /**
     * Constructor for the Spreadsheet Keyboard Shortcut module.
     *
     * @param {Spreadsheet} parent - Specify the spreadsheet.
     * @private
     */
    constructor(parent: Spreadsheet);
    private addEventListener;
    private removeEventListener;
    private isTrgtNotInput;
    private ribbonShortCuts;
    private keyUpHandler;
    private keyDownHandler;
    private focusTarget;
    private getModuleName;
    destroy(): void;
}
