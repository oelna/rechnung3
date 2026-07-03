import { displayCell, formatNumber, tableTotal } from './table-formulas.js';

export function renderDocument(doc, sel) {
	const root = document.querySelector('#documentCanvas');
	root.innerHTML = '';
	doc.pages.forEach((page) => root.append(renderPage(page, sel)));
}

function renderPage(page, sel) {
	const el = document.createElement('article');
	el.className = 'page';
	el.dataset.pageId = page.id;

	[...page.frames]
		.sort((a, b) => a.zIndex - b.zIndex)
		.forEach((frame) => el.append(renderFrame(frame, page.id, sel)));

	return el;
}

function applyGeometry(el, frame) {
	Object.assign(el.style, {
		left: `${frame.x}mm`,
		top: `${frame.y}mm`,
		width: `${frame.width}mm`,
		height: `${frame.height}mm`,
		zIndex: frame.zIndex,
	});
}

function frameChrome() {
	return '<div class="frame-ui"><div class="drag-handle" title="Drag to move frame">move frame</div></div><div class="resize-handle" title="Resize frame"></div>';
}

function renderFrame(frame, pageId, sel) {
	const el = document.createElement('section');
	el.className = `frame frame-${frame.type}${sel.frameId === frame.id ? ' is-selected' : ''}${frame.locked ? ' locked' : ''}`;
	el.dataset.frameId = frame.id;
	el.dataset.pageId = pageId;
	applyGeometry(el, frame);
	el.innerHTML = frameChrome();

	if (frame.type === 'text') {
		renderText(el, frame);
	}

	if (frame.type === 'table') {
		renderTable(el, frame, sel);
	}

	if (frame.type === 'girocode') {
		renderGiro(el, frame);
	}

	return el;
}

function renderText(el, frame) {
	const body = document.createElement('div');
	body.className = 'text-editor';
	body.contentEditable = !frame.locked;
	body.dataset.editableText = 'true';
	Object.assign(body.style, {
		fontFamily: frame.style.fontFamily,
		fontSize: `${frame.style.fontSize}pt`,
		fontWeight: frame.style.fontWeight,
		lineHeight: frame.style.lineHeight,
		textAlign: frame.style.textAlign,
	});
	body.innerHTML = frame.content.html || '';
	el.append(body);
}

function renderTable(el, frame, sel) {
	const table = document.createElement('table');
	const colgroup = document.createElement('colgroup');

	frame.content.columns.forEach((column) => {
		const col = document.createElement('col');
		col.style.width = `${column.width}mm`;
		colgroup.append(col);
	});

	table.append(colgroup);
	table.append(renderTableHeader(frame));

	frame.content.rows.forEach((row, rowIndex) => {
		const tr = document.createElement('tr');

		if (row.kind) {
			tr.classList.add(`table-${row.kind}-row`);
		}

		if (sel.cell?.frameId === frame.id && sel.cell.row === rowIndex) {
			tr.classList.add('insert-target');
		}

		frame.content.columns.forEach((column, columnIndex) => {
			const td = document.createElement('td');
			td.className = 'table-cell';
			td.dataset.row = rowIndex;
			td.dataset.col = columnIndex;
			td.contentEditable = true;
			td.textContent = displayCell(frame.content, rowIndex, columnIndex);

			if (sel.cell?.frameId === frame.id && sel.cell.row === rowIndex && sel.cell.col === columnIndex) {
				td.classList.add('is-selected');
			}

			tr.append(td);
		});

		table.append(tr);
	});

	appendDiscountAndTotalRows(table, frame.content);
	el.append(table);
	appendOverflowHints(el, frame);
}

function renderTableHeader(frame) {
	const head = document.createElement('tr');

	frame.content.columns.forEach((column, index) => {
		const th = document.createElement('th');
		th.dataset.col = index;
		th.contentEditable = true;
		th.textContent = column.label || '';

		const handle = document.createElement('span');
		handle.className = 'col-resize-handle';
		handle.dataset.col = index;
		handle.contentEditable = 'false';
		th.append(handle);

		head.append(th);
	});

	return head;
}

function appendDiscountAndTotalRows(table, content) {
	const discount = content.discount || { type: 'none' };

	if (discount.type !== 'none') {
		const tr = document.createElement('tr');
		tr.className = 'table-discount-row';
		const baseTotal = tableTotal({ ...content, discount: { type: 'none' } });
		const discountValue = discount.type === 'percent'
			? baseTotal * (Number(discount.value) || 0) / 100
			: Number(discount.value) || 0;
		tr.innerHTML = `<td colspan="${Math.max(1, content.columns.length - 1)}">Discount ${discount.type === 'percent' ? `${discount.value}%` : ''}</td><td>-${formatNumber(discountValue)}</td>`;
		table.append(tr);
	}

	const tr = document.createElement('tr');
	tr.className = 'table-total-row';
	tr.innerHTML = `<td colspan="${Math.max(1, content.columns.length - 1)}">Total</td><td>${formatNumber(tableTotal(content))}</td>`;
	table.append(tr);
}

function appendOverflowHints(el, frame) {
	if ((frame.y + frame.height) > 285) {
		const warning = document.createElement('div');
		warning.className = 'overflow-warning';
		warning.textContent = 'May overflow page';
		el.append(warning);
	}

	if (frame.content.rows.some((row) => row.kind === 'subtotal')) {
		const carry = document.createElement('div');
		carry.className = 'page-break-carry';
		carry.textContent = frame.content.carryLabel || 'Subtotal carried forward';
		el.append(carry);
	}
}

function renderGiro(el, frame) {
	const payload = [
		frame.content.name,
		frame.content.iban,
		frame.content.bic,
		frame.content.amount,
		frame.content.reason,
	]
		.filter(Boolean)
		.join('\n');
	const box = document.createElement('div');
	box.className = 'girocode-box';
	box.innerHTML = `<div><div class="girocode-qr">▦</div><strong>Girocode</strong><br><small>${payload || 'Enter payment data'}</small></div>`;
	el.append(box);
}
