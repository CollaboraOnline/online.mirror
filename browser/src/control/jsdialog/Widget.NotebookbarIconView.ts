/* -*- js-indent-level: 8 -*- */
/*
 * Copyright the Collabora Online contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

declare var JSDialog: any;

function _createButtonForNotebookbarIconview(
	parentContainer: Element,
	id: string,
	buttonClass: string,
	icon: string,
	ariaLabel: string,
	builder: JSBuilder,
	onClickCallback: any,
	accessibility?: NotebookbarAccessibilityDescriptor,
	opensPopup?: boolean,
) {
	const container = window.L.DomUtil.create(
		'div',
		builder.options.cssClass +
			' unotoolbutton ui-content unospan no-label ui-iconview-button',
		parentContainer,
	);
	container.id = id;

	// create the button
	const button = window.L.DomUtil.create(
		'button',
		'ui-content unobutton ' + buttonClass,
		container,
	);
	button.id = id + '-button';
	if (accessibility?.combination) button.accessKey = accessibility?.combination;

	if (opensPopup) button.setAttribute('aria-haspopup', 'dialog');

	const a11yData: WidgetJSON = {
		id: id,
		type: 'iconview-button',
		aria: {
			label: ariaLabel,
		},
	};
	JSDialog.SetupA11yLabelForNonLabelableElement(button, a11yData, builder);

	// add the icon
	const buttonImage = window.L.DomUtil.create(
		'img',
		'ui-iconview-button-icon',
		button,
	);
	buttonImage.alt = '';
	app.LOUtil.setImage(buttonImage, icon, builder.map);

	// set the onclick callback
	button.onclick = onClickCallback;
}

function _getDropdownContent(data: IconViewListJSON, builder: JSBuilder) {
	const dropdownContent: Array<MenuDefinition> = [];
	for (const child of data.children) {
		// get up-to-date copy from model, TODO: more clean way to do that
		const childData = (
			builder?.options?.mobileWizard as any
		)?.getWidgetSnapshot(child.id);

		dropdownContent.push({
			id: 'dropdown-entry-' + child.id,
			type: 'json',
			content: childData ? childData : undefined,
		});
	}

	if (
		data.children.length === 1 &&
		data.children[0].id === 'tablestyles_design'
	) {
		dropdownContent.push(
			{
				id: 'dropdown-entry-tablestyles-separator',
				type: 'json',
				content: {
					type: 'separator',
					id: 'tablestyles-actions-separator',
					orientation: 'horizontal',
				} as SeparatorWidgetJSON,
			},
			{
				id: 'dropdown-entry-new-table-style',
				type: 'json',
				content: {
					id: 'new-table-style',
					type: 'customtoolitem',
					text: _('New Table Style...'),
					command: '.uno:NewTableStyle',
					icon: 'lc_newtablestyle.svg',
				} as ToolItemWidgetJSON,
			},
			{
				id: 'dropdown-entry-clear-table-style',
				type: 'json',
				content: {
					id: 'clear-table-style',
					type: 'customtoolitem',
					text: _('Clear Style'),
					command: '.uno:ClearTableStyle',
					icon: 'lc_cleartablestyle.svg',
				} as ToolItemWidgetJSON,
			},
		);
	}

	if (data.children.length === 1 && data.children[0].id === 'stylesview') {
		dropdownContent.push(
			{
				id: 'dropdown-entry-stylesview',
				type: 'json',
				content: {
					type: 'separator',
					id: 'iconview-button-separator',
					orientation: 'horizontal',
				} as SeparatorWidgetJSON,
			},
			{
				id: 'dropdown-entry-more',
				type: 'json',
				content: {
					id: 'format-style-list-dialog',
					type: 'customtoolitem',
					text: _('Open Styles Sidebar'),
					command: 'showstylelistdeck',
					icon: 'lc_stylepreviewmore.svg',
				} as ToolItemWidgetJSON,
			},
		);
	}

	return dropdownContent;
}

JSDialog.notebookbarIconViewList = function (
	parentContainer: Element,
	data: IconViewListJSON,
	builder: JSBuilder,
) {
	const rootNode = window.L.DomUtil.create(
		'div',
		builder.options.cssClass + ' ui-iconview-root',
		parentContainer,
	);
	rootNode.id = data.id;

	const commonContainer = window.L.DomUtil.create(
		'div',
		builder.options.cssClass + ' ui-iconview-window',
		rootNode,
	);
	commonContainer.id = data.id + '-window';

	let firstIconViewIndex = 0;

	while (data.children && data.children[firstIconViewIndex]) {
		if (data.children[firstIconViewIndex].type === 'iconview') break;
		firstIconViewIndex++;
	}

	const iconViewData = data.children[firstIconViewIndex];

	// we insert into DOM only the first iconview (rest is accessible only in the dropdown)
	JSDialog.iconView(commonContainer, iconViewData, builder);
	// builder will not do it for us - we manage children (return is false in this handler)
	builder.postProcess(commonContainer, iconViewData);

	const iconview = commonContainer.querySelector('.ui-iconview');
	if (!iconview) {
		app.console.error('IconView cannot be created: ' + data.id);
		return false;
	}

	const buttonsContainer = window.L.DomUtil.create(
		'div',
		builder.options.cssClass + ' ui-iconview-buttons-container',
		rootNode,
	);
	buttonsContainer.id = data.id + '-buttons-container';

	const horizontal = data.horizontal === true;
	if (horizontal)
		window.L.DomUtil.addClass(rootNode, 'ui-iconview-root-horizontal');

	// be aware the child iconviews can get update and be replaced in DOM
	// we need to use firstChild to get correct instance at the time of execution
	const scrollBySteps = (steps: number) => {
		const current = commonContainer.firstChild as HTMLElement;
		if (horizontal)
			current.scrollBy({
				left: steps * current.offsetWidth,
				behavior: 'smooth',
			});
		else
			current.scrollBy({
				top: steps * current.offsetHeight,
				behavior: 'smooth',
			});
	};

	const scrollUpCallback = () => {
		scrollBySteps(-1);
	};

	const scrollDownCallback = () => {
		scrollBySteps(1);
	};

	const notebookbarIconViewCallback = (
		objectType: string,
		eventType: string,
		object: any,
		entry_data: string,
	) => {
		builder.callback(objectType, eventType, object, entry_data, builder);
		/*
			the dropdown can have controls to trigger dialogs
			or sidebars. when that happens, we want the dropdown
			to move out of our way.
		*/
		if (objectType !== 'iconview') JSDialog.CloseAllDropdowns();
	};

	const expanderCallback = () => {
		JSDialog.CloseAllDropdowns();

		JSDialog.OpenDropdown(
			data.id,
			rootNode,
			_getDropdownContent(data, builder),
			notebookbarIconViewCallback,
		);
	};

	_createButtonForNotebookbarIconview(
		buttonsContainer,
		data.id + '-scroll-up',
		'ui-iconview-scroll-up-button',
		horizontal ? 'lc_prevrecord.svg' : 'lc_searchprev.svg',
		horizontal ? _('Scroll left') : _('Scroll up'),
		builder,
		scrollUpCallback,
	);

	_createButtonForNotebookbarIconview(
		buttonsContainer,
		data.id + '-scroll-down',
		'ui-iconview-scroll-down-button',
		horizontal ? 'lc_nextrecord.svg' : 'lc_searchnext.svg',
		horizontal ? _('Scroll right') : _('Scroll down'),
		builder,
		scrollDownCallback,
	);

	_createButtonForNotebookbarIconview(
		buttonsContainer,
		data.id + '-expand',
		'ui-iconview-expander-button',
		'lc_iconviewexpander.svg',
		_('More options'),
		builder,
		expanderCallback,
		{
			focusBack: true,
			combination: data.expanderAccessKey || 'SD',
			de: null,
		},
		true /* opensPopup */,
	);

	rootNode._onDropDown = function (opened: boolean) {
		if (opened) {
			app.layoutingService.appendLayoutingTask(() => {
				app.layoutingService.appendLayoutingTask(() => {
					const expander = JSDialog.GetDropdown(data.id);
					if (!expander) {
						app.console.error(
							'iconview._onDropDown: expander missing: "' + data.id + '"',
						);
						return;
					}
					const overlay = expander.parentNode;
					overlay.style.position = 'fixed';
					overlay.style.zIndex = '20000';
					rootNode.appendChild(overlay);

					// setup correct callbacks for rendering actions for fresh instance
					// both in notebookbar and inside dropdown
					const currentIconView = commonContainer.firstChild as IconViewElement;
					currentIconView.updateRenders = (pos: number) => {
						currentIconView.updateRendersImpl(
							pos,
							iconViewData.id,
							currentIconView,
						);
						currentIconView.updateRendersImpl(pos, iconViewData.id, expander);
					};
				});
			});
		}
	};

	/*
		close dropdown when the window is resized. this
		is to prevent dropdown from hanging in the corner
		when the overflowgroups collapse displacing the
		underlying iconview.
	*/

	// update indexes on resize
	const resizeObserver = new ResizeObserver(() => {
		JSDialog.UpdateIconViewIndexes(commonContainer.firstChild as HTMLElement);
		const dropdown = JSDialog.GetDropdown(data.id);
		if (dropdown) JSDialog.CloseDropdown(data.id);
	});

	resizeObserver.observe(rootNode);

	// Do not animate on creation - eg. when opening sidebar with icon view it might move the app
	const firstSelected = $(iconview).children('.selected').get(0);
	if (firstSelected) {
		const offsetTop = firstSelected.offsetTop;
		iconview.scrollTop = offsetTop;
	}

	return false;
};
