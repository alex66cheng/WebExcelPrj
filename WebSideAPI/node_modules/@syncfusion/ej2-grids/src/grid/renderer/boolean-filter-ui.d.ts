import { IGrid, IFilterMUI, IFilterCreate, IFilterWrite } from '../base/interface';
import { Column } from '../models/column';
import { FilterSettings } from '../base/grid';
import { ServiceLocator } from '../services/service-locator';
import { Filter } from '../actions/filter';
/**
 * `boolfilterui` render boolean column.
 *
 * @hidden
 */
export declare class BooleanFilterUI implements IFilterMUI {
    private parent;
    protected serviceLocator: ServiceLocator;
    private elem;
    private multiSelectElement;
    private value;
    private filterSettings;
    private dropInstance;
    private multiSelectCheckBoxInstance;
    private dialogObj;
    private dropdownOpen;
    private dropdownComplete;
    private multiSelectDropdownOpen;
    private multiSelectDropdownComplete;
    constructor(parent?: IGrid, serviceLocator?: ServiceLocator, filterSettings?: FilterSettings);
    create(args: IFilterCreate): void;
    write(args: IFilterWrite): void;
    read(element: Element, column: Column, filterOptr: string, filterObj: Filter): void;
    private createDropDownList;
    private createMultiSelectDropDown;
    private getBooleanInstance;
    private getMultiSelectInstance;
    private openPopup;
    private actionComplete;
    destroy(): void;
}
