import { IGrid, IFilterMUI, IFilterCreate, IFilterWrite } from '../base/interface';
import { Column } from '../models/column';
import { FilterSettings } from '../base/grid';
import { AutoComplete } from '@syncfusion/ej2-dropdowns';
import { ServiceLocator } from '../services/service-locator';
import { Filter } from '../actions/filter';
/**
 * `string filterui` render string column.
 *
 * @hidden
 */
export declare class StringFilterUI implements IFilterMUI {
    private parent;
    protected serLocator: ServiceLocator;
    private instance;
    private multiSelectCheckBoxInstance;
    private value;
    actObj: AutoComplete;
    private multiSelectObj;
    private filterSettings;
    private filter;
    private dialogObj;
    private dropdownOpen;
    private dropdownComplete;
    private acOpen;
    private acFocus;
    private acComplete;
    constructor(parent?: IGrid, serviceLocator?: ServiceLocator, filterSettings?: FilterSettings);
    create(args: IFilterCreate): void;
    private processDataOperation;
    private getAutoCompleteOptions;
    write(args: IFilterWrite): void;
    read(element: Element, column: Column, filterOptr: string, filterObj: Filter): void;
    private getAutoCompleteInstance;
    private getMultiSelectInstance;
    private createMultiSelectDropDown;
    private openPopup;
    private focus;
    private actionComplete;
    private actionCompleteMultiCheckBox;
    destroy(): void;
}
