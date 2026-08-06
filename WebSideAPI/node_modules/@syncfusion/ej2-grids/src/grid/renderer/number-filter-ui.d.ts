import { IGrid, IFilterMUI, IFilterCreate, IFilterWrite } from '../base/interface';
import { Column } from '../models/column';
import { FilterSettings } from '../base/grid';
import { ServiceLocator } from '../services/service-locator';
import { Filter } from '../actions/filter';
/**
 * `numberfilterui` render number column.
 *
 * @hidden
 */
export declare class NumberFilterUI implements IFilterMUI {
    private parent;
    protected serviceLocator: ServiceLocator;
    private numericInstance;
    private value;
    private numericTxtObj;
    private multiSelectObj;
    private filterSettings;
    private filter;
    private multiSelectCheckBoxInstance;
    private dialogObj;
    private dropdownOpen;
    private dropdownComplete;
    constructor(parent?: IGrid, serviceLocator?: ServiceLocator, filterSettings?: FilterSettings);
    private keyEventHandler;
    create(args: IFilterCreate): void;
    write(args: IFilterWrite): void;
    read(element: Element, column: Column, filterOptr: string, filterObj: Filter): void;
    private createNumericTextBox;
    private createMultiSelectDropDown;
    private getNumericInstance;
    private getMultiSelectInstance;
    private openPopup;
    private actionComplete;
    destroy(): void;
}
