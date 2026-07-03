import {
	cloneDocument,
	createDocument,
	createFrame,
	createPage,
	normalizeDocument,
	touch,
} from './document-model.js';
import { renderDocument } from './render.js';
import {
	selection,
	selectCell,
	selectFrame,
	selectPage,
	selectedFrame,
	selectedPage,
} from './selection.js';
import { loadDocument, listDocuments, saveDocument } from './storage.js';
import { cellRef, remapFormulaReferences } from './table-formulas.js';

let doc = normalizeDocument(JSON.parse(localStorage.getItem('rechnung3.lastDocument') || 'null') || createDocument());
selection.pageId = doc.pages[0].id;
let drag = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function refresh() {
	renderDocument(doc, selection);
	renderPages();
	syncPalettes();
	localStorage.setItem('rechnung3.lastDocument', JSON.stringify(doc));
	$('#saveStatus').textContent = 'Unsaved';
}

function changed() {
	touch(doc);
	refresh();
}

function renderPages() {
	const list = $('#pageList');
	list.innerHTML = '';

	doc.pages.forEach((page, index) => {
		const button = document.createElement('button');
		button.className = `page-thumb${selection.pageId === page.id ? ' is-selected' : ''}`;
		button.draggable = true;
		button.innerHTML = `<span>Page<br>${index + 1}</span>`;
		button.title = `${index + 1}. ${page.name || 'Page'} — drag to reorder`;
		button.onclick = () => {
			selectPage(page.id);
			refresh();
		};
		button.ondragstart = (event) => event.dataTransfer.setData('text/plain', page.id);
		button.ondragover = (event) => {
			event.preventDefault();
			button.classList.add('drag-over');
		};
		button.ondragleave = () => button.classList.remove('drag-over');
		button.ondrop = (event) => {
			event.preventDefault();
			button.classList.remove('drag-over');
			const from = event.dataTransfer.getData('text/plain');
			const oldIndex = doc.pages.findIndex((item) => item.id === from);

			if (oldIndex < 0 || oldIndex === index) {
				return;
			}

			const moved = doc.pages.splice(oldIndex, 1)[0];
			doc.pages.splice(index, 0, moved);
			doc.pages.forEach((item, itemIndex) => {
				item.order = itemIndex;
			});
			changed();
		};
		list.append(button);
	});

	const docs = $('#documentList');
	docs.innerHTML = '<option value="">Saved documents…</option>' + listDocuments()
		.map((item) => `<option value="${item.id}">${item.title}</option>`)
		.join('');
}

function syncPalettes() {
	const frame = selectedFrame(doc);

	$$('[data-transform]').forEach((input) => {
		const key = input.dataset.transform;

		if (!frame) {
			input.value = '';
			return;
		}

		if (input.type === 'checkbox') {
			input.checked = Boolean(frame[key]);
		} else {
			input.value = frame[key] ?? '';
		}
	});

	const framePageSelect = $('#framePage');
	framePageSelect.innerHTML = doc.pages
		.map((page, index) => `<option value="${page.id}">Page ${index + 1}</option>`)
		.join('');
	framePageSelect.disabled = !frame;
	framePageSelect.value = frame ? selection.pageId : '';

	$$('[data-type-style]').forEach((input) => {
		input.disabled = !frame || frame.type !== 'text';

		if (frame?.type === 'text') {
			input.value = frame.style[input.dataset.typeStyle] ?? '';
		}
	});

	const tableFrame = frame?.type === 'table' ? frame : null;
	const cell = selection.cell;
	$('#cellRef').textContent = cell ? cellRef(cell.row, cell.col) : '—';
	$('#cellInput').disabled = !cell || !tableFrame;
	$('#cellInput').value = cell && tableFrame
		? tableFrame.content.rows[cell.row]?.cells[cell.col]?.formula || tableFrame.content.rows[cell.row]?.cells[cell.col]?.value || ''
		: '';
	$('#discountType').value = tableFrame?.content.discount?.type || 'none';
	$('#discountValue').value = tableFrame?.content.discount?.value || 0;
	$('#carryLabel').value = tableFrame?.content.carryLabel || 'Subtotal carried forward';

	$('#framePage').onchange = (event) => {
	moveSelectedFrameToPage(event.target.value);
};

$$('[data-margin]').forEach((input) => {
		input.value = doc.settings.guides.margins[input.dataset.margin] ?? '';
	});
}

function mmFromPx(px) {
	return px * 25.4 / 96;
}

$('#documentCanvas').addEventListener('mousedown', (event) => {
	const frameElement = event.target.closest('.frame');
	const pageElement = event.target.closest('.page');

	if (pageElement && !frameElement) {
		selectPage(pageElement.dataset.pageId);
		refresh();
		return;
	}

	if (!frameElement) {
		return;
	}

	selectFrame(frameElement.dataset.pageId, frameElement.dataset.frameId);
	const frame = selectedFrame(doc);

	if (event.target.classList.contains('resize-handle')) {
		drag = {
			kind: 'resize',
			frame,
			startX: event.clientX,
			startY: event.clientY,
			width: frame.width,
			height: frame.height,
		};
	} else if (event.target.classList.contains('col-resize-handle')) {
		const column = frame.content.columns[Number(event.target.dataset.col)];
		drag = {
			kind: 'column',
			column,
			startX: event.clientX,
			width: column.width,
		};
	} else if (!frame.locked && event.target.classList.contains('drag-handle')) {
		drag = {
			kind: 'move',
			frame,
			startX: event.clientX,
			startY: event.clientY,
			x: frame.x,
			y: frame.y,
		};
	}

	if (drag || !event.target.closest('[contenteditable="true"]')) {
		refresh();
	} else {
		syncPalettes();
	}
});

window.addEventListener('mousemove', (event) => {
	if (!drag) {
		return;
	}

	const dx = mmFromPx(event.clientX - drag.startX);
	const dy = mmFromPx(event.clientY - drag.startY);

	if (drag.kind === 'move') {
		drag.frame.x = Math.max(0, Number((drag.x + dx).toFixed(1)));
		drag.frame.y = Math.max(0, Number((drag.y + dy).toFixed(1)));
	} else if (drag.kind === 'column') {
		drag.column.width = Math.max(8, Number((drag.width + dx).toFixed(1)));
	} else {
		drag.frame.width = Math.max(5, Number((drag.width + dx).toFixed(1)));
		drag.frame.height = Math.max(5, Number((drag.height + dy).toFixed(1)));
	}

	renderDocument(doc, selection);
	syncPalettes();
});

window.addEventListener('mouseup', () => {
	if (drag) {
		drag = null;
		changed();
	}
});

$('#documentCanvas').addEventListener('click', (event) => {
	const cell = event.target.closest('td[data-row]');

	if (cell) {
		const frame = cell.closest('.frame');
		selectFrame(frame.dataset.pageId, frame.dataset.frameId);
		selectCell(frame.dataset.frameId, Number(cell.dataset.row), Number(cell.dataset.col));
		syncPalettes();
	}
});

$('#documentCanvas').addEventListener('focusout', (event) => {
	if (event.target.closest('[contenteditable="true"]')) {
		changed();
	}
});

$('#documentCanvas').addEventListener('input', (event) => {
	const text = event.target.closest('[data-editable-text]');

	if (text) {
		const frame = findFrame(text.closest('.frame').dataset.frameId);
		frame.content.html = text.innerHTML;
		touch(doc);
		return;
	}

	const tableCell = event.target.closest('td[data-row]');

	if (tableCell) {
		const frame = findFrame(tableCell.closest('.frame').dataset.frameId);
		const cell = frame.content.rows[Number(tableCell.dataset.row)].cells[Number(tableCell.dataset.col)];
		const value = tableCell.textContent.trim();
		setCellInput(cell, value);
		touch(doc);
		syncPalettes();
		return;
	}

	const tableHeader = event.target.closest('th[data-col]');

	if (tableHeader) {
		const frame = findFrame(tableHeader.closest('.frame').dataset.frameId);
		frame.content.columns[Number(tableHeader.dataset.col)].label = tableHeader.childNodes[0]?.textContent.trim() || '';
		touch(doc);
	}
});

function findFrame(frameId) {
	return doc.pages.flatMap((page) => page.frames).find((frame) => frame.id === frameId);
}

function moveSelectedFrameToPage(pageId) {
	if (!selection.frameId || pageId === selection.pageId) {
		return;
	}

	const sourcePage = doc.pages.find((page) => page.id === selection.pageId);
	const targetPage = doc.pages.find((page) => page.id === pageId);

	if (!sourcePage || !targetPage) {
		return;
	}

	const frameIndex = sourcePage.frames.findIndex((frame) => frame.id === selection.frameId);

	if (frameIndex === -1) {
		return;
	}

	const [frame] = sourcePage.frames.splice(frameIndex, 1);
	frame.zIndex = targetPage.frames.length + 1;
	targetPage.frames.push(frame);
	selectFrame(targetPage.id, frame.id);
	changed();
}


function setCellInput(cell, value) {
	if (value.startsWith('=')) {
		cell.formula = value;
		delete cell.value;
	} else {
		cell.value = value;
		delete cell.formula;
	}
}

$('#framePage').onchange = (event) => {
	moveSelectedFrameToPage(event.target.value);
};

$$('[data-margin]').forEach((input) => {
	input.oninput = () => {
		doc.settings.guides.margins[input.dataset.margin] = Number(input.value) || 0;
		changed();
	};
});

$$('[data-transform]').forEach((input) => {
	input.addEventListener('keydown', (event) => {
		if (!event.shiftKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) {
			return;
		}

		event.preventDefault();
		const direction = event.key === 'ArrowUp' ? 1 : -1;
		input.value = String((Number(input.value) || 0) + direction * 10);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
});


$$('[data-add-frame]').forEach((button) => {
	button.onclick = () => {
		const page = selectedPage(doc);
		const frame = createFrame(button.dataset.addFrame, {
			zIndex: page.frames.length + 1,
			x: doc.settings.guides.margins.left,
		});
		page.frames.push(frame);
		selectFrame(page.id, frame.id);
		changed();
	};
});

$('[data-delete-frame]').onclick = () => {
	const page = selectedPage(doc);
	page.frames = page.frames.filter((frame) => frame.id !== selection.frameId);
	selection.frameId = null;
	changed();
};

$('[data-duplicate-frame]').onclick = () => {
	const page = selectedPage(doc);
	const frame = selectedFrame(doc);

	if (!frame) {
		return;
	}

	const copy = cloneDocument(frame);
	copy.id = crypto.randomUUID();
	copy.x += 5;
	copy.y += 5;
	page.frames.push(copy);
	selectFrame(page.id, copy.id);
	changed();
};

$$('[data-transform]').forEach((input) => {
	input.oninput = () => {
		const frame = selectedFrame(doc);

		if (!frame) {
			return;
		}

		const key = input.dataset.transform;
		frame[key] = input.type === 'checkbox' ? input.checked : Number(input.value);
		changed();
	};
});

$$('[data-type-style]').forEach((input) => {
	input.oninput = () => {
		const frame = selectedFrame(doc);

		if (frame?.type !== 'text') {
			return;
		}

		frame.style[input.dataset.typeStyle] = input.type === 'number' ? Number(input.value) : input.value;
		changed();
	};
});

$$('[data-table-action]').forEach((button) => {
	button.onclick = () => tableAction(button.dataset.tableAction);
});

function tableAction(action) {
	const frame = selectedFrame(doc);

	if (frame?.type !== 'table') {
		return;
	}

	const table = frame.content;
	const cell = selection.cell || { row: 0, col: 0 };

	if (action === 'add-row-before') {
		insertRow(table, cell.row);
	}

	if (action === 'add-row-after') {
		insertRow(table, cell.row + 1);
	}

	if (action === 'delete-row' && table.rows.length > 1) {
		deleteRow(table, cell.row);
		selection.cell = { frameId: frame.id, row: Math.max(0, cell.row - 1), col: cell.col };
	}

	if (action === 'move-row-up' && cell.row > 0) {
		moveRow(table, cell.row, cell.row - 1);
		selection.cell = { frameId: frame.id, row: cell.row - 1, col: cell.col };
	}

	if (action === 'move-row-down' && cell.row < table.rows.length - 1) {
		moveRow(table, cell.row, cell.row + 1);
		selection.cell = { frameId: frame.id, row: cell.row + 1, col: cell.col };
	}

	if (action === 'add-column-before') {
		insertColumn(table, cell.col);
	}

	if (action === 'add-column-after') {
		insertColumn(table, cell.col + 1);
	}

	if (action === 'delete-column' && table.columns.length > 1) {
		deleteColumn(table, cell.col);
		selection.cell = { frameId: frame.id, row: cell.row, col: Math.max(0, cell.col - 1) };
	}

	if (action === 'move-column-left' && cell.col > 0) {
		moveColumn(table, cell.col, cell.col - 1);
		selection.cell = { frameId: frame.id, row: cell.row, col: cell.col - 1 };
	}

	if (action === 'move-column-right' && cell.col < table.columns.length - 1) {
		moveColumn(table, cell.col, cell.col + 1);
		selection.cell = { frameId: frame.id, row: cell.row, col: cell.col + 1 };
	}

	if (action === 'mark-subtotal') {
		table.rows[cell.row].kind = 'subtotal';
	}

	if (action === 'clear-subtotal') {
		delete table.rows[cell.row].kind;
	}

	fitTableFrame(frame);
	changed();
}

function fitTableFrame(frame) {
	if (frame?.type === 'table') {
		frame.height = Math.max(8, frame.content.rows.length * 5 + 2);
	}
}

function newRow(table) {
	return {
		id: crypto.randomUUID(),
		cells: table.columns.map(() => ({ value: '' })),
	};
}

function insertRow(table, index) {
	const rowMap = new Map(table.rows.map((row, rowIndex) => [rowIndex, rowIndex >= index ? rowIndex + 1 : rowIndex]));
	table.rows.splice(index, 0, newRow(table));
	remapFormulaReferences(table, rowMap, null);
}

function deleteRow(table, index) {
	const rowMap = new Map(table.rows.map((row, rowIndex) => [rowIndex, rowIndex === index ? -1 : rowIndex > index ? rowIndex - 1 : rowIndex]));
	table.rows.splice(index, 1);
	remapFormulaReferences(table, rowMap, null);
}

function moveRow(table, from, to) {
	const rowMap = new Map(table.rows.map((row, rowIndex) => [rowIndex, rowIndex]));
	rowMap.set(from, to);
	rowMap.set(to, from);
	const moved = table.rows.splice(from, 1)[0];
	table.rows.splice(to, 0, moved);
	remapFormulaReferences(table, rowMap, null);
}

function insertColumn(table, index) {
	const columnMap = new Map(table.columns.map((column, columnIndex) => [columnIndex, columnIndex >= index ? columnIndex + 1 : columnIndex]));
	table.columns.splice(index, 0, { id: crypto.randomUUID(), width: 25, label: 'Column' });
	table.rows.forEach((row) => row.cells.splice(index, 0, { value: '' }));
	remapFormulaReferences(table, null, columnMap);
}

function deleteColumn(table, index) {
	const columnMap = new Map(table.columns.map((column, columnIndex) => [columnIndex, columnIndex === index ? -1 : columnIndex > index ? columnIndex - 1 : columnIndex]));
	table.columns.splice(index, 1);
	table.rows.forEach((row) => row.cells.splice(index, 1));
	remapFormulaReferences(table, null, columnMap);
}

function moveColumn(table, from, to) {
	const columnMap = new Map(table.columns.map((column, columnIndex) => [columnIndex, columnIndex]));
	columnMap.set(from, to);
	columnMap.set(to, from);
	const moved = table.columns.splice(from, 1)[0];
	table.columns.splice(to, 0, moved);
	table.rows.forEach((row) => {
		const movedCell = row.cells.splice(from, 1)[0];
		row.cells.splice(to, 0, movedCell);
	});
	remapFormulaReferences(table, null, columnMap);
}

$('#cellInput').oninput = () => {
	const frame = selectedFrame(doc);
	const selected = selection.cell;

	if (!frame || !selected) {
		return;
	}

	const cell = frame.content.rows[selected.row].cells[selected.col];
	setCellInput(cell, $('#cellInput').value);
	changed();
};

$('#discountType').onchange = $('#discountValue').oninput = () => {
	const frame = selectedFrame(doc);

	if (frame?.type === 'table') {
		frame.content.discount = {
			type: $('#discountType').value,
			value: Number($('#discountValue').value) || 0,
		};
		changed();
	}
};

$('#carryLabel').oninput = () => {
	const frame = selectedFrame(doc);

	if (frame?.type === 'table') {
		frame.content.carryLabel = $('#carryLabel').value;
		changed();
	}
};

$('#addPage').onclick = () => {
	const page = createPage();
	page.order = doc.pages.length;
	doc.pages.push(page);
	selectPage(page.id);
	changed();
};

$('#duplicatePage').onclick = () => {
	const page = cloneDocument(selectedPage(doc));
	page.id = crypto.randomUUID();
	page.frames.forEach((frame) => {
		frame.id = crypto.randomUUID();
	});
	doc.pages.push(page);
	selectPage(page.id);
	changed();
};

$('#deletePage').onclick = () => {
	if (doc.pages.length > 1) {
		doc.pages = doc.pages.filter((page) => page.id !== selection.pageId);
		selectPage(doc.pages[0].id);
		changed();
	}
};

$('#newDocument').onclick = () => {
	doc = createDocument();
	selection.pageId = doc.pages[0].id;
	refresh();
};

$('#saveDocument').onclick = () => {
	saveDocument(doc);
	$('#saveStatus').textContent = 'Saved';
	renderPages();
};

$('#documentList').onchange = (event) => {
	const loaded = loadDocument(event.target.value);

	if (loaded) {
		doc = normalizeDocument(loaded);
		selection.pageId = doc.pages[0].id;
		refresh();
	}
};

$('#exportJson').onclick = () => {
	const anchor = document.createElement('a');
	anchor.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
	anchor.download = `${doc.title || 'invoice'}.json`;
	anchor.click();
};

$('#importJson').onchange = async (event) => {
	const file = event.target.files[0];

	if (!file) {
		return;
	}

	const imported = normalizeDocument(JSON.parse(await file.text()));

	if (listDocuments().some((item) => item.id === imported.id)) {
		imported.id = crypto.randomUUID();
	}

	doc = imported;
	selection.pageId = doc.pages[0].id;
	changed();
};

function setPreview(enabled) {
	document.body.classList.toggle('mode-preview', enabled);
}

$('#printDocument').onclick = () => print();
$('#togglePreview').onclick = () => setPreview(!document.body.classList.contains('mode-preview'));
$('#closePreview').onclick = () => setPreview(false);

$$('.palette').forEach((palette) => {
	let paletteDrag = null;
	const details = palette.querySelector('details');
	const handle = palette.querySelector('summary');
	let didDragPalette = false;
	handle.addEventListener('click', (event) => {
		if (didDragPalette) {
			event.preventDefault();
			didDragPalette = false;
		}
	});
	handle.onmousedown = (event) => {
		paletteDrag = {
			x: event.clientX,
			y: event.clientY,
			left: palette.offsetLeft,
			top: palette.offsetTop,
			open: details.open,
		};
	};

	window.addEventListener('mousemove', (event) => {
		if (!paletteDrag) {
			return;
		}

		if (Math.abs(event.clientX - paletteDrag.x) > 3 || Math.abs(event.clientY - paletteDrag.y) > 3) {
			didDragPalette = true;
		}

		palette.style.left = `${paletteDrag.left + event.clientX - paletteDrag.x}px`;
		palette.style.top = `${paletteDrag.top + event.clientY - paletteDrag.y}px`;
		details.open = paletteDrag.open;
		palette.style.right = 'auto';
		palette.style.bottom = 'auto';
	});

	window.addEventListener('mouseup', () => {
		paletteDrag = null;
	});
});

window.addEventListener('keydown', (event) => {
	if (event.key === 'Escape' && document.body.classList.contains('mode-preview')) {
		setPreview(false);
		return;
	}

	if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable) {
		return;
	}

	if (event.key === 'Delete') {
		$('[data-delete-frame]').click();
	}

	if (event.key === 'p' && (event.ctrlKey || event.metaKey)) {
		event.preventDefault();
		print();
	}
});

refresh();
