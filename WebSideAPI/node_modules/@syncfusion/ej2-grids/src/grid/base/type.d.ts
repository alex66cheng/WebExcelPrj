import { ColumnModel, AggregateColumnModel } from '../models/models';
/**
 * Exports types used by Grid.
 * ```props
 * * number :- Sets value type as number.
 * * string :- Sets value type as string.
 * * Date :- Sets value type as date.
 * * boolean :- Sets value type as boolean.
 * ```
 */
export declare type ValueType = number | string | Date | boolean;
export declare type ValueAccessor = (field: string, data: Object, column: ColumnModel) => Object;
export declare type HeaderValueAccessor = (field: string, column: ColumnModel) => Object;
export declare type SortComparer = (x: ValueType, y: ValueType) => number;
export declare type CustomSummaryType = (data: Object[] | Object, column: AggregateColumnModel) => Object;
export declare type ReturnType = {
    result: Object[];
    count: number;
    aggregates?: Object;
    foreignColumnsData?: Object;
};
export declare type SentinelType = {
    check?: (rect: ClientRect, info: SentinelType) => boolean;
    top?: number;
    entered?: boolean;
    axis?: string;
};
export declare type SentinelInfo = {
    up?: SentinelType;
    down?: SentinelType;
    right?: SentinelType;
    left?: SentinelType;
};
export declare type Offsets = {
    top?: number;
    left?: number;
};
/** @hidden */
export declare type BatchChanges = {
    addedRecords?: Object[];
    changedRecords?: Object[];
    deletedRecords?: Object[];
};
/**
 * A function that determines whether a given data row is selectable.
 * @param data - The data object for the row being evaluated.
 * @param columns - The column definitions of the Grid.
 * @returns Returns true to allow selecting the row; false to disable selection.
 */
export declare type RowSelectable = (data: Object, columns: ColumnModel[]) => boolean;
/**
 * A function that determines whether a given data row is pinned to the top.
 * @param data - The data object for the row being evaluated.
 * @param columns - The column definitions of the Grid.
 * @returns Returns true to pin the row to the top; false otherwise.
 */
export declare type PinRow = (data: Object, columns: ColumnModel[]) => boolean;
