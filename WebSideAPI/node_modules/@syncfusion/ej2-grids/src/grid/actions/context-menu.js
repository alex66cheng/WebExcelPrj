import { closest, isNullOrUndefined, EventHandler } from '@syncfusion/ej2-base';
import { remove } from '@syncfusion/ej2-base';
import { ContextMenu as Menu } from '@syncfusion/ej2-navigations';
import * as events from '../base/constant';
import { Resize } from '../actions/resize';
import { Page } from '../actions/page';
import { parentsUntil, applyBiggerTheme } from '../base/util';
import { Group } from '../actions/group';
import { Sort } from '../actions/sort';
import { PdfExport } from '../actions/pdf-export';
import { ExcelExport } from '../actions/excel-export';
import * as literals from '../base/string-literals';
export var menuClass = {
    header: '.' + literals.gridHeader,
    content: '.' + literals.gridContent,
    edit: '.e-inline-edit',
    batchEdit: '.e-editedbatchcell',
    editIcon: 'e-edit',
    pager: '.e-gridpager',
    delete: 'e-delete',
    save: 'e-save',
    cancel: 'e-cancel',
    copy: 'e-copy',
    pdf: 'e-pdfexport',
    group: 'e-icon-group',
    ungroup: 'e-icon-ungroup',
    csv: 'e-csvexport',
    excel: 'e-excelexport',
    fPage: 'e-icon-first',
    nPage: 'e-icon-next',
    lPage: 'e-icon-last',
    pPage: 'e-icon-prev',
    ascending: 'e-icon-ascending',
    descending: 'e-icon-descending',
    groupHeader: 'e-groupdroparea',
    touchPop: 'e-gridpopup',
    autofit: 'e-icon-autofit',
    autofitall: 'e-icon-autofitall',
    chart: 'e-grid-chart-icon',
    barChart: 'e-grid-bar-chart-icon',
    bar: 'e-grid-bar-icon',
    stackingBar: 'e-grid-stacking-bar-icon',
    stackingBar100: 'e-grid-stacking-bar-100-icon',
    pie: 'e-grid-pie-icon',
    columnChart: 'e-grid-column-chart-icon',
    column: 'e-grid-column-icon',
    stackingColumn: 'e-grid-stacking-column-icon',
    stackingColumn100: 'e-grid-stacking-column-100-icon',
    lineChart: 'e-grid-line-chart-icon',
    line: 'e-grid-line-icon',
    stackingLine: 'e-grid-stacking-line-icon',
    stackingLine100: 'e-grid-stacking-line-100-icon',
    areaChart: 'e-grid-area-chart-icon',
    area: 'e-grid-area-icon',
    stackingArea: 'e-grid-stacking-area-icon',
    stackingArea100: 'e-grid-stacking-area-100-icon',
    scatter: 'e-grid-scatter-icon',
    pin: 'e-grid-icon-pin',
    unpin: 'e-grid-icon-unpin'
};
/**
 * The `ContextMenu` module is used to handle context menu actions.
 */
var ContextMenu = /** @class */ (function () {
    function ContextMenu(parent, serviceLocator) {
        this.defaultItems = {};
        this.disableItems = [];
        this.hiddenItems = [];
        this.barChartList = ['Bar', 'StackingBar', 'StackingBar100'];
        this.pieChartList = ['Pie'];
        this.columnChartList = ['Column', 'StackingColumn', 'StackingColumn100'];
        this.lineChartList = ['Line', 'StackingLine', 'StackingLine100'];
        this.areaChartList = ['Area', 'StackingArea', 'StackingArea100'];
        this.scatterChartList = ['Scatter'];
        this.chartList = this.barChartList.concat(this.pieChartList, this.columnChartList, this.lineChartList, this.areaChartList, this.scatterChartList);
        this.localeText = this.setLocaleKey();
        this.parent = parent;
        this.gridID = parent.element.id;
        this.serviceLocator = serviceLocator;
        this.addEventListener();
    }
    /**
     * @returns {void}
     * @hidden
     */
    ContextMenu.prototype.addEventListener = function () {
        if (this.parent.isDestroyed) {
            return;
        }
        this.parent.on(events.uiUpdate, this.enableAfterRenderMenu, this);
        this.parent.on(events.initialLoad, this.render, this);
        this.parent.on(events.destroy, this.destroy, this);
    };
    /**
     * @returns {void}
     * @hidden
     */
    ContextMenu.prototype.removeEventListener = function () {
        if (this.parent.isDestroyed) {
            return;
        }
        this.parent.off(events.initialLoad, this.render);
        this.parent.off(events.uiUpdate, this.enableAfterRenderMenu);
        this.parent.off(events.destroy, this.destroy);
        EventHandler.remove(this.element, 'keydown', this.keyDownHandler.bind(this));
    };
    ContextMenu.prototype.keyDownHandler = function (e) {
        if (e.code === 'Tab' || e.which === 9) {
            this.contextMenu.close();
        }
        if (e.code === 'Escape') {
            this.contextMenu.close();
            this.parent.notify(events.restoreFocus, {});
        }
    };
    ContextMenu.prototype.render = function () {
        this.parent.element.classList.add('e-noselect');
        this.l10n = this.serviceLocator.getService('localization');
        this.element = this.parent.createElement('ul', { id: this.gridID + '_cmenu' });
        EventHandler.add(this.element, 'keydown', this.keyDownHandler.bind(this));
        this.parent.element.appendChild(this.element);
        var target = '#' + this.gridID;
        this.contextMenu = new Menu({
            items: this.getMenuItems(),
            enableRtl: this.parent.enableRtl,
            enablePersistence: this.parent.enablePersistence,
            locale: this.parent.locale,
            target: target,
            select: this.contextMenuItemClick.bind(this),
            beforeOpen: this.contextMenuBeforeOpen.bind(this),
            onOpen: this.contextMenuOpen.bind(this),
            onClose: this.contextMenuOnClose.bind(this),
            beforeClose: this.contextMenuBeforeClose.bind(this),
            cssClass: this.parent.cssClass ? 'e-grid-menu' + ' ' + this.parent.cssClass : 'e-grid-menu'
        });
        this.contextMenu.appendTo(this.element);
    };
    ContextMenu.prototype.enableAfterRenderMenu = function (e) {
        if (e.module === this.getModuleName() && e.enable) {
            if (this.contextMenu) {
                this.contextMenu.destroy();
                remove(this.element);
                this.parent.element.classList.remove('e-noselect');
            }
            this.render();
        }
    };
    ContextMenu.prototype.getMenuItems = function () {
        var menuItems = [];
        var exportItems = [];
        var chartItems = [];
        var barChartItems = [];
        var pieChart;
        var columnChartItems = [];
        var lineChartItems = [];
        var areaChartItems = [];
        var scatterChart;
        for (var _i = 0, _a = this.parent.contextMenuItems; _i < _a.length; _i++) {
            var item = _a[_i];
            if (typeof item === 'string' && this.getDefaultItems().indexOf(item) !== -1) {
                if (this.barChartList.indexOf(item) !== -1) {
                    barChartItems.push(this.buildDefaultItems(item));
                }
                else if (this.pieChartList.indexOf(item) !== -1) {
                    pieChart = this.buildDefaultItems(item);
                }
                else if (this.columnChartList.indexOf(item) !== -1) {
                    columnChartItems.push(this.buildDefaultItems(item));
                }
                else if (this.lineChartList.indexOf(item) !== -1) {
                    lineChartItems.push(this.buildDefaultItems(item));
                }
                else if (this.areaChartList.indexOf(item) !== -1) {
                    areaChartItems.push(this.buildDefaultItems(item));
                }
                else if (this.scatterChartList.indexOf(item) !== -1) {
                    scatterChart = this.buildDefaultItems(item);
                }
                else if (item.toLocaleLowerCase().indexOf('export') !== -1) {
                    exportItems.push(this.buildDefaultItems(item));
                }
                else {
                    menuItems.push(this.buildDefaultItems(item));
                }
            }
            else if (typeof item !== 'string') {
                menuItems.push(item);
            }
        }
        if (lineChartItems.length > 0) {
            var lineChartGroup = this.buildDefaultItems('LineChart');
            lineChartGroup.items = lineChartItems;
            chartItems.push(lineChartGroup);
        }
        if (areaChartItems.length > 0) {
            var areaChartGroup = this.buildDefaultItems('AreaChart');
            areaChartGroup.items = areaChartItems;
            chartItems.push(areaChartGroup);
        }
        if (columnChartItems.length > 0) {
            var columnChartGroup = this.buildDefaultItems('ColumnChart');
            columnChartGroup.items = columnChartItems;
            chartItems.push(columnChartGroup);
        }
        if (barChartItems.length > 0) {
            var barChartGroup = this.buildDefaultItems('BarChart');
            barChartGroup.items = barChartItems;
            chartItems.push(barChartGroup);
        }
        if (scatterChart) {
            chartItems.push(scatterChart);
        }
        if (pieChart) {
            chartItems.push(pieChart);
        }
        if (chartItems.length > 0) {
            var chartGroup = this.buildDefaultItems('Chart');
            chartGroup.items = chartItems;
            menuItems.push(chartGroup);
        }
        if (exportItems.length > 0) {
            var exportGroup = this.buildDefaultItems('export');
            exportGroup.items = exportItems;
            menuItems.push(exportGroup);
        }
        return menuItems;
    };
    ContextMenu.prototype.getLastPage = function () {
        var totalpage = Math.floor(this.parent.pageSettings.totalRecordsCount / this.parent.pageSettings.pageSize);
        if (this.parent.pageSettings.totalRecordsCount % this.parent.pageSettings.pageSize) {
            totalpage += 1;
        }
        return totalpage;
    };
    ContextMenu.prototype.contextMenuOpen = function () {
        this.isOpen = true;
    };
    /**
     * @param {ContextMenuClickEventArgs} args - specifies the ContextMenuClickEventArgs argument type
     * @returns {void}
     * @hidden
     */
    ContextMenu.prototype.contextMenuItemClick = function (args) {
        var item = this.getKeyFromId(args.item.id);
        switch (item) {
            case 'AutoFitAll':
                this.parent.autoFitColumns([]);
                break;
            case 'AutoFit':
                this.parent.autoFitColumns(this.targetColumn.field);
                break;
            case 'Group':
                this.parent.groupColumn(this.targetColumn.field);
                break;
            case 'Ungroup':
                this.parent.ungroupColumn(this.targetColumn.field);
                break;
            case 'Edit':
                if (this.parent.editModule) {
                    if (this.parent.editSettings.mode === 'Batch') {
                        if (this.row && this.cell && !isNaN(parseInt(this.cell.getAttribute(literals.ariaColIndex), 10) - 1)) {
                            this.parent.editModule.editCell(parseInt(this.row.getAttribute(literals.ariaRowIndex), 10) - 1, 
                            // eslint-disable-next-line
                            this.parent.getColumns()[parseInt(this.cell.getAttribute(literals.ariaColIndex), 10) - 1].field);
                        }
                    }
                    else {
                        this.parent.editModule.endEdit();
                        this.parent.editModule.startEdit(this.row);
                    }
                }
                break;
            case 'Delete':
                if (this.parent.editModule) {
                    if (this.parent.editSettings.mode !== 'Batch') {
                        this.parent.editModule.endEdit();
                    }
                    if (this.parent.getSelectedRecords().length === 1) {
                        if (!this.parent.isCheckBoxSelection) {
                            this.parent.isFocusFirstCell = true;
                        }
                        this.parent.editModule.deleteRow(this.row);
                    }
                    else {
                        this.parent.deleteRecord();
                    }
                }
                break;
            case 'Save':
                if (this.parent.editModule) {
                    if (this.parent.isEdit && this.parent.editSettings.mode !== 'Batch') {
                        this.parent.isFocusFirstCell = true;
                    }
                    this.parent.editModule.endEdit();
                }
                break;
            case 'Cancel':
                if (this.parent.editModule) {
                    if (this.parent.isEdit) {
                        this.parent.isFocusFirstCell = true;
                    }
                    this.parent.editModule.closeEdit();
                }
                break;
            case 'Copy':
                this.parent.copy();
                break;
            case 'PdfExport':
                this.parent.pdfExport();
                break;
            case 'ExcelExport':
                this.parent.excelExport();
                break;
            case 'CsvExport':
                this.parent.csvExport();
                break;
            case 'SortAscending':
                this.isOpen = false;
                this.parent.sortColumn(this.targetColumn.field, 'Ascending');
                break;
            case 'SortDescending':
                this.isOpen = false;
                this.parent.sortColumn(this.targetColumn.field, 'Descending');
                break;
            case 'FirstPage':
                this.parent.goToPage(1);
                break;
            case 'PrevPage':
                this.parent.goToPage(this.parent.pageSettings.currentPage - 1);
                break;
            case 'LastPage':
                this.parent.goToPage(this.getLastPage());
                break;
            case 'NextPage':
                this.parent.goToPage(this.parent.pageSettings.currentPage + 1);
                break;
            case 'Bar':
            case 'StackingBar':
            case 'StackingBar100':
            case 'Pie':
            case 'Column':
            case 'StackingColumn':
            case 'StackingColumn100':
            case 'Line':
            case 'StackingLine':
            case 'StackingLine100':
            case 'Area':
            case 'StackingArea':
            case 'StackingArea100':
            case 'Scatter':
                args.records = this.parent.getSelectedRecords();
                args.gridInstance = this.parent;
                args.chartType = item;
                break;
            case 'PinRow':
                this.parent.pinRows([this.targetRowdata.rowData]);
                break;
            case 'UnpinRow':
                this.parent.unpinRows([this.targetRowdata.rowData]);
                break;
        }
        args.column = this.targetColumn;
        args.rowInfo = this.targetRowdata;
        this.parent.trigger(events.contextMenuClick, args);
    };
    ContextMenu.prototype.contextMenuOnClose = function (args) {
        var parent = 'parentObj';
        if (args.items.length > 0 && args.items[0]["" + parent] instanceof Menu) {
            this.updateItemStatus();
        }
        this.parent.notify(events.selectRowOnContextOpen, { isOpen: false });
    };
    ContextMenu.prototype.getLocaleText = function (item) {
        return this.l10n.getConstant(this.localeText["" + item]);
    };
    ContextMenu.prototype.updateItemStatus = function () {
        this.contextMenu.showItems(this.hiddenItems);
        this.contextMenu.enableItems(this.disableItems);
        this.hiddenItems = [];
        this.disableItems = [];
        this.isOpen = false;
    };
    ContextMenu.prototype.contextMenuBeforeOpen = function (args) {
        var closestGrid = closest(args.event.target, '.e-grid');
        if (args.event && closestGrid && closestGrid !== this.parent.element) {
            args.cancel = true;
        }
        else if (args.event && (closest(args.event.target, '.' + menuClass.groupHeader)
            || closest(args.event.target, '.' + menuClass.touchPop) ||
            closest(args.event.target, '.e-summarycell') ||
            closest(args.event.target, '.e-groupcaption') ||
            closest(args.event.target, '.e-filterbarcell')) ||
            (this.parent.editSettings.showAddNewRow && closest(args.event.target, '.e-addedrow')
                && this.parent.element.querySelector('.e-editedrow'))) {
            args.cancel = true;
        }
        else {
            this.targetColumn = this.getColumn(args.event);
            if (parentsUntil(args.event.target, 'e-grid')) {
                this.targetRowdata = this.parent.getRowInfo(args.event.target);
            }
            if ((isNullOrUndefined(args.parentItem)) && this.targetColumn) {
                if (this.targetRowdata.cell) {
                    this.parent.notify(events.selectRowOnContextOpen, { isOpen: true });
                    this.selectRow(args.event, (this.targetRowdata.cell.classList.contains('e-selectionbackground')
                        && this.parent.selectionSettings.type === 'Multiple') ? false : true);
                }
            }
            var hideSepItems = [];
            var showSepItems = [];
            for (var _i = 0, _a = args.items; _i < _a.length; _i++) {
                var item = _a[_i];
                var key = this.getKeyFromId(item.id);
                var dItem = this.defaultItems["" + key];
                if (this.getDefaultItems().indexOf(key) !== -1) {
                    if (this.ensureDisabledStatus(key)) {
                        this.disableItems.push(item.text);
                    }
                    if (args.event && (this.ensureTarget(args.event.target, menuClass.edit) ||
                        this.ensureTarget(args.event.target, menuClass.batchEdit))) {
                        if (key !== 'Save' && key !== 'Cancel') {
                            this.hiddenItems.push(item.text);
                        }
                    }
                    else if (this.parent.editModule && this.parent.editSettings.mode === 'Batch' &&
                        ((closest(args.event.target, '.e-gridform')) ||
                            this.parent.editModule.getBatchChanges()[literals.changedRecords].length ||
                            this.parent.editModule.getBatchChanges()[literals.addedRecords].length ||
                            this.parent.editModule.getBatchChanges()[literals.deletedRecords].length) && (key === 'Save' || key === 'Cancel')) {
                        continue;
                    }
                    else if (isNullOrUndefined(args.parentItem) && args.event &&
                        !isNullOrUndefined(dItem) && !this.ensureTarget(args.event.target, dItem.target)) {
                        this.hiddenItems.push(item.text);
                    }
                }
                else if (item.target && args.event &&
                    !this.ensureTarget(args.event.target, item.target)) {
                    if (item.separator) {
                        hideSepItems.push(item.id);
                    }
                    else {
                        this.hiddenItems.push(item.text);
                    }
                }
                else if (this.ensureTarget(args.event.target, item.target) && item.separator) {
                    showSepItems.push(item.id);
                }
                if (key === 'PinRow' && !isNullOrUndefined(this.targetRowdata.row) && this.targetRowdata.row.classList.contains('e-grid-pin-row')) {
                    this.hiddenItems.push(item.text);
                }
                else if (key === 'UnpinRow' && !isNullOrUndefined(this.targetRowdata.row) && !this.targetRowdata.row.classList.contains('e-grid-pin-row')) {
                    this.hiddenItems.push(item.text);
                }
            }
            if (showSepItems.length > 0) {
                this.contextMenu.showItems(showSepItems, true);
            }
            this.contextMenu.enableItems(this.disableItems, false);
            this.contextMenu.hideItems(this.hiddenItems);
            if (hideSepItems.length > 0) {
                this.contextMenu.hideItems(hideSepItems, true);
            }
            this.eventArgs = args.event;
            args.column = this.targetColumn;
            args.rowInfo = this.targetRowdata;
            this.parent.trigger(events.contextMenuOpen, args);
            if (args.cancel || (this.hiddenItems.length === args.items.length && !args.parentItem)) {
                this.updateItemStatus();
                args.cancel = true;
            }
        }
        applyBiggerTheme(this.parent.element, this.contextMenu.element.parentElement);
    };
    ContextMenu.prototype.contextMenuBeforeClose = function (args) {
        args.column = this.targetColumn;
        args.rowInfo = this.targetRowdata;
        this.parent.trigger(events.contextMenuClose, args);
    };
    ContextMenu.prototype.ensureTarget = function (targetElement, selector) {
        var target = targetElement;
        if (this.ensureFrozenHeader(targetElement) && (selector === menuClass.header || selector === menuClass.content)) {
            target = closest(targetElement, selector === menuClass.header ? 'thead' : literals.tbody);
        }
        else if (selector === menuClass.content || selector === menuClass.header) {
            target = parentsUntil(closest(targetElement, '.' + literals.table), selector.substr(1, selector.length));
        }
        else {
            target = closest(targetElement, selector);
        }
        return target && parentsUntil(target, 'e-grid') === this.parent.element;
    };
    ContextMenu.prototype.ensureFrozenHeader = function (targetElement) {
        return (this.parent.frozenRows || this.parent.pinnedTopRecords.length)
            && closest(targetElement, menuClass.header) ? true : false;
    };
    ContextMenu.prototype.ensureDisabledStatus = function (item) {
        var status = false;
        switch (item) {
            case 'AutoFitAll':
            case 'AutoFit':
                status = !(this.parent.ensureModuleInjected(Resize) && !this.parent.isEdit)
                    || (this.targetColumn && !this.targetColumn.field && item === 'AutoFit');
                break;
            case 'Group':
                if (!this.parent.allowGrouping || (this.parent.ensureModuleInjected(Group) && this.targetColumn
                    && this.parent.groupSettings.columns.indexOf(this.targetColumn.field) >= 0) ||
                    (this.targetColumn && !this.targetColumn.field)) {
                    status = true;
                }
                break;
            case 'Ungroup':
                if (!this.parent.allowGrouping || !this.parent.ensureModuleInjected(Group)
                    || (this.parent.ensureModuleInjected(Group) && this.targetColumn
                        && this.parent.groupSettings.columns.indexOf(this.targetColumn.field) < 0)) {
                    status = true;
                }
                break;
            case 'Edit':
            case 'Delete':
            case 'Save':
            case 'Cancel':
                if (!this.parent.editModule || (this.parent.getDataRows().length === 0)) {
                    status = true;
                }
                break;
            case 'Copy':
                if ((this.parent.getSelectedRowIndexes().length === 0 && this.parent.getSelectedRowCellIndexes().length === 0) ||
                    this.parent.getCurrentViewRecords().length === 0) {
                    status = true;
                }
                break;
            case 'export':
                if (!(this.parent.allowExcelExport && this.parent.ensureModuleInjected(ExcelExport))
                    && !(this.parent.allowPdfExport && this.parent.ensureModuleInjected(PdfExport))) {
                    status = true;
                }
                break;
            case 'PdfExport':
                if (!(this.parent.allowPdfExport) || !this.parent.ensureModuleInjected(PdfExport)) {
                    status = true;
                }
                break;
            case 'ExcelExport':
            case 'CsvExport':
                if (!(this.parent.allowExcelExport) || !this.parent.ensureModuleInjected(ExcelExport)) {
                    status = true;
                }
                break;
            case 'SortAscending':
            case 'SortDescending':
                if ((!this.parent.allowSorting) || !this.parent.ensureModuleInjected(Sort) ||
                    (this.targetColumn && !this.targetColumn.field)) {
                    status = true;
                }
                else if (this.parent.ensureModuleInjected(Sort) && this.parent.sortSettings.columns.length > 0 && this.targetColumn) {
                    var sortColumns = this.parent.sortSettings.columns;
                    for (var i = 0; i < sortColumns.length; i++) {
                        if (sortColumns[parseInt(i.toString(), 10)].field === this.targetColumn.field
                            && sortColumns[parseInt(i.toString(), 10)].direction.toLowerCase() === item.toLowerCase().replace('sort', '').toLocaleLowerCase()) {
                            status = true;
                        }
                    }
                }
                break;
            case 'FirstPage':
            case 'PrevPage':
                if (!this.parent.allowPaging || !this.parent.ensureModuleInjected(Page) ||
                    this.parent.getCurrentViewRecords().length === 0 ||
                    (this.parent.ensureModuleInjected(Page) && this.parent.pageSettings.currentPage === 1)) {
                    status = true;
                }
                break;
            case 'LastPage':
            case 'NextPage':
                if (!this.parent.allowPaging || !this.parent.ensureModuleInjected(Page) ||
                    this.parent.getCurrentViewRecords().length === 0 ||
                    (this.parent.ensureModuleInjected(Page) && this.parent.pageSettings.currentPage === this.getLastPage())) {
                    status = true;
                }
                break;
            case 'Chart':
                status = !this.parent.getSelectedRecords().length;
                break;
        }
        return status;
    };
    /**
     * Gets the context menu element from the Grid.
     *
     * @returns {Element} returns the element
     */
    ContextMenu.prototype.getContextMenu = function () {
        return this.element;
    };
    /**
     * Destroys the context menu component in the Grid.
     *
     * @function destroy
     * @returns {void}
     * @hidden
     */
    ContextMenu.prototype.destroy = function () {
        var gridElement = this.parent.element;
        if (!gridElement || (!gridElement.querySelector('.' + literals.gridHeader) && !gridElement.querySelector('.' + literals.gridContent))) {
            return;
        }
        if (this.contextMenu) {
            this.contextMenu.select = null;
            this.contextMenu.beforeOpen = null;
            this.contextMenu.onOpen = null;
            this.contextMenu.onClose = null;
        }
        this.removeEventListener();
        this.contextMenu.destroy();
        if (this.element.parentNode) {
            remove(this.element);
        }
        this.parent.element.classList.remove('e-noselect');
    };
    ContextMenu.prototype.getModuleName = function () {
        return 'contextMenu';
    };
    /**
     * @param {string} item - Defines the Key
     * @hidden
     * @returns {string} - Returns the ID
     */
    ContextMenu.prototype.generateID = function (item) {
        return this.gridID + '_cmenu_' + item;
    };
    /**
     * @param {string} id - Defines the ID
     * @hidden
     * @returns {string} - Returns the Key
     */
    ContextMenu.prototype.getKeyFromId = function (id) {
        return id.replace(this.gridID + '_cmenu_', '');
    };
    ContextMenu.prototype.buildDefaultItems = function (item) {
        var menuItem;
        switch (item) {
            case 'AutoFitAll':
                menuItem = { target: menuClass.header, iconCss: menuClass.autofitall };
                break;
            case 'AutoFit':
                menuItem = { target: menuClass.header, iconCss: menuClass.autofit };
                break;
            case 'Group':
                menuItem = { target: menuClass.header, iconCss: menuClass.group };
                break;
            case 'Ungroup':
                menuItem = { target: menuClass.header, iconCss: menuClass.ungroup };
                break;
            case 'Edit':
                menuItem = { target: menuClass.content, iconCss: menuClass.editIcon };
                break;
            case 'Delete':
                menuItem = { target: menuClass.content, iconCss: menuClass.delete };
                break;
            case 'Save':
                menuItem = { target: menuClass.edit, iconCss: menuClass.save };
                break;
            case 'Cancel':
                menuItem = { target: menuClass.edit, iconCss: menuClass.cancel };
                break;
            case 'Copy':
                menuItem = { target: menuClass.content, iconCss: menuClass.copy };
                break;
            case 'export':
                menuItem = { target: menuClass.content };
                break;
            case 'PdfExport':
                menuItem = { target: menuClass.content, iconCss: menuClass.pdf };
                break;
            case 'ExcelExport':
                menuItem = { target: menuClass.content, iconCss: menuClass.excel };
                break;
            case 'CsvExport':
                menuItem = { target: menuClass.content, iconCss: menuClass.csv };
                break;
            case 'SortAscending':
                menuItem = { target: menuClass.header, iconCss: menuClass.ascending };
                break;
            case 'SortDescending':
                menuItem = { target: menuClass.header, iconCss: menuClass.descending };
                break;
            case 'FirstPage':
                menuItem = { target: menuClass.pager, iconCss: menuClass.fPage };
                break;
            case 'PrevPage':
                menuItem = { target: menuClass.pager, iconCss: menuClass.pPage };
                break;
            case 'LastPage':
                menuItem = { target: menuClass.pager, iconCss: menuClass.lPage };
                break;
            case 'NextPage':
                menuItem = { target: menuClass.pager, iconCss: menuClass.nPage };
                break;
            case 'Chart':
                menuItem = { target: menuClass.content, iconCss: menuClass.chart };
                break;
            case 'BarChart':
                menuItem = { target: menuClass.content, iconCss: menuClass.barChart };
                break;
            case 'Bar':
                menuItem = { target: menuClass.content, iconCss: menuClass.bar };
                break;
            case 'StackingBar':
                menuItem = { target: menuClass.content, iconCss: menuClass.stackingBar };
                break;
            case 'StackingBar100':
                menuItem = { target: menuClass.content, iconCss: menuClass.stackingBar100 };
                break;
            case 'Pie':
                menuItem = { target: menuClass.content, iconCss: menuClass.pie };
                break;
            case 'ColumnChart':
                menuItem = { target: menuClass.content, iconCss: menuClass.columnChart };
                break;
            case 'Column':
                menuItem = { target: menuClass.content, iconCss: menuClass.column };
                break;
            case 'StackingColumn':
                menuItem = { target: menuClass.content, iconCss: menuClass.stackingColumn };
                break;
            case 'StackingColumn100':
                menuItem = { target: menuClass.content, iconCss: menuClass.stackingColumn100 };
                break;
            case 'LineChart':
                menuItem = { target: menuClass.content, iconCss: menuClass.lineChart };
                break;
            case 'Line':
                menuItem = { target: menuClass.content, iconCss: menuClass.line };
                break;
            case 'StackingLine':
                menuItem = { target: menuClass.content, iconCss: menuClass.stackingLine };
                break;
            case 'StackingLine100':
                menuItem = { target: menuClass.content, iconCss: menuClass.stackingLine100 };
                break;
            case 'AreaChart':
                menuItem = { target: menuClass.content, iconCss: menuClass.areaChart };
                break;
            case 'Area':
                menuItem = { target: menuClass.content, iconCss: menuClass.area };
                break;
            case 'StackingArea':
                menuItem = { target: menuClass.content, iconCss: menuClass.stackingArea };
                break;
            case 'StackingArea100':
                menuItem = { target: menuClass.content, iconCss: menuClass.stackingArea100 };
                break;
            case 'Scatter':
                menuItem = { target: menuClass.content, iconCss: menuClass.scatter };
                break;
            case 'PinRow':
                menuItem = { target: '.e-rowcell', iconCss: menuClass.pin };
                break;
            case 'UnpinRow':
                menuItem = { target: '.e-rowcell', iconCss: menuClass.unpin };
                break;
        }
        this.defaultItems["" + item] = {
            text: this.getLocaleText(item), id: this.generateID(item),
            target: menuItem.target, iconCss: menuItem.iconCss ? 'e-icons ' + menuItem.iconCss : ''
        };
        return this.defaultItems["" + item];
    };
    ContextMenu.prototype.getDefaultItems = function () {
        return ['AutoFitAll', 'AutoFit',
            'Group', 'Ungroup', 'Edit', 'Delete', 'Save', 'Cancel', 'Copy', 'export',
            'PdfExport', 'ExcelExport', 'CsvExport', 'SortAscending', 'SortDescending',
            'FirstPage', 'PrevPage', 'LastPage', 'NextPage',
            'Chart', 'BarChart', 'ColumnChart', 'LineChart', 'AreaChart', 'PinRow', 'UnpinRow'].concat(this.chartList);
    };
    ContextMenu.prototype.setLocaleKey = function () {
        var localeKeys = {
            'AutoFitAll': 'autoFitAll',
            'AutoFit': 'autoFit',
            'Copy': 'Copy',
            'Group': 'Group',
            'Ungroup': 'Ungroup',
            'Edit': 'EditRecord',
            'Delete': 'DeleteRecord',
            'Save': 'Save',
            'Cancel': 'CancelButton',
            'PdfExport': 'Pdfexport',
            'ExcelExport': 'Excelexport',
            'CsvExport': 'Csvexport',
            'export': 'Export',
            'SortAscending': 'SortAscending',
            'SortDescending': 'SortDescending',
            'FirstPage': 'FirstPage',
            'LastPage': 'LastPage',
            'PrevPage': 'PreviousPage',
            'NextPage': 'NextPage',
            'Chart': 'Chart',
            'BarChart': 'BarChart',
            'Bar': 'Bar',
            'StackingBar': 'StackingBar',
            'StackingBar100': 'StackingBar100',
            'Pie': 'Pie',
            'ColumnChart': 'ColumnChart',
            'Column': 'Column',
            'StackingColumn': 'StackingColumn',
            'StackingColumn100': 'StackingColumn100',
            'LineChart': 'LineChart',
            'Line': 'Line',
            'StackingLine': 'StackingLine',
            'StackingLine100': 'StackingLine100',
            'AreaChart': 'AreaChart',
            'Area': 'Area',
            'StackingArea': 'StackingArea',
            'StackingArea100': 'StackingArea100',
            'Scatter': 'Scatter',
            'PinRow': 'PinRow',
            'UnpinRow': 'UnpinRow'
        };
        return localeKeys;
    };
    ContextMenu.prototype.getColumn = function (e) {
        var cell = closest(e.target, 'th.e-headercell');
        if (cell) {
            var uid = cell.querySelector('.e-headercelldiv, .e-stackedheadercelldiv').getAttribute('data-mappinguid');
            return this.parent.getColumnByUid(uid);
        }
        else {
            var ele = (this.parent.getRowInfo(e.target).column);
            return ele || null;
        }
    };
    ContextMenu.prototype.selectRow = function (e, isSelectable) {
        this.cell = e.target;
        this.row = closest(e.target, 'tr.e-row') || this.row;
        if (this.row && isSelectable && !parentsUntil(e.target, 'e-gridpager')) {
            this.parent.selectRow(parseInt(this.row.getAttribute(literals.ariaRowIndex), 10) - 1);
        }
    };
    return ContextMenu;
}());
export { ContextMenu };
