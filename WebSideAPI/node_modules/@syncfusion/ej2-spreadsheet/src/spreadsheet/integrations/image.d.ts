/**
 * Open properties.
 */
import { Spreadsheet } from '../base/index';
import { SheetModel } from '../../workbook/index';
export declare class SpreadsheetImage {
    private parent;
    constructor(parent: Spreadsheet);
    /**
     * Adding event listener for success and failure
     *
     * @returns {void} - Adding event listener for success and failure
     */
    private addEventListener;
    /**
     * Rendering upload component for importing images.
     *
     * @returns {void} - Rendering upload component for importing images.
     */
    private renderImageUpload;
    /**
     * Process after select the excel and image file.
     *
     * @param {Event} args - File select native event.
     * @returns {void} - Process after select the excel and image file.
     */
    private imageSelect;
    /**
     * Removing event listener for success and failure
     *
     * @returns {void} - Removing event listener for success and failure
     */
    private removeEventListener;
    private insertImage;
    private binaryStringVal;
    private createImageElement;
    private refreshInsDelImagePosition;
    private refreshImgCellObj;
    deleteImage(args: {
        id: string;
        range?: string;
        preventEventTrigger?: boolean;
        sheet?: SheetModel;
        rowIdx?: number;
        colIdx?: number;
        isUndoRedo?: boolean;
        clearAction?: boolean;
    }): void;
    /**
     * To Remove the event listeners.
     *
     * @returns {void} - To Remove the event listeners.
     */
    destroy(): void;
    /**
     * Get the sheet picture module name.
     *
     * @returns {string} - Get the sheet picture module name.
     */
    getModuleName(): string;
}
