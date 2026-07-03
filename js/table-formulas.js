function columnName(index) {
	let name = '';
	let value = index + 1;

	while (value) {
		const mod = (value - 1) % 26;
		name = String.fromCharCode(65 + mod) + name;
		value = Math.floor((value - 1) / 26);
	}

	return name;
}

function columnIndex(name) {
	return [...name].reduce((number, char) => number * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

export function cellRef(rowIndex, columnIndexValue) {
	return `${columnName(columnIndexValue)}${rowIndex + 1}`;
}

function parseReference(reference) {
	const match = String(reference).toUpperCase().match(/^([A-Z]+)(\d+)$/);

	if (!match) {
		return null;
	}

	return {
		column: columnIndex(match[1]),
		row: Number(match[2]) - 1,
	};
}

function rawCell(table, rowIndex, columnIndexValue, seen = new Set()) {
	const key = `${rowIndex}:${columnIndexValue}`;

	if (seen.has(key)) {
		throw new Error('circular');
	}

	seen.add(key);

	const cell = table.rows[rowIndex]?.cells[columnIndexValue];

	if (!cell) {
		return 0;
	}

	if (cell.formula) {
		const value = evaluateFormula(cell.formula, table, seen);
		return typeof value === 'number' ? value : Number(value) || 0;
	}

	const number = Number(String(cell.value ?? '').replace(',', '.'));
	return Number.isFinite(number) ? number : 0;
}

function displayReference(table, reference, seen) {
	const parsed = parseReference(reference);
	const cell = table.rows[parsed.row]?.cells[parsed.column];

	if (!cell) {
		return '';
	}

	if (cell.formula) {
		return evaluateFormula(cell.formula, table, new Set(seen));
	}

	return cell.value ?? '';
}

function rangeSum(table, startReference, endReference, seen) {
	const start = parseReference(startReference);
	const end = parseReference(endReference);
	let sum = 0;

	for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row++) {
		for (let column = Math.min(start.column, end.column); column <= Math.max(start.column, end.column); column++) {
			sum += rawCell(table, row, column, new Set(seen));
		}
	}

	return sum;
}


function splitArguments(input) {
	const args = [];
	let depth = 0;
	let current = '';

	for (const char of input) {
		if (char === '(') {
			depth++;
		}

		if (char === ')') {
			depth--;
		}

		if (char === ',' && depth === 0) {
			args.push(current.trim());
			current = '';
			continue;
		}

		current += char;
	}

	if (current.trim()) {
		args.push(current.trim());
	}

	return args;
}

function sumArgument(table, argument, seen) {
	const range = argument.match(/^([A-Z]+\d+):([A-Z]+\d+)$/);

	if (range) {
		return rangeSum(table, range[1], range[2], seen);
	}

	const reference = parseReference(argument);

	if (reference) {
		return rawCell(table, reference.row, reference.column, new Set(seen));
	}

	return Number(evalSafe(replaceCellReferences(argument, table, seen))) || 0;
}

function replaceCellReferences(expr, table, seen) {
	return expr.replace(/([A-Z]+)(\d+)/g, (_, column, row) => String(rawCell(table, Number(row) - 1, columnIndex(column), new Set(seen))));
}

function replaceFunctionCalls(expr, name, replacer) {
	let index = 0;
	let output = '';
	const needle = `${name}(`;

	while (index < expr.length) {
		const start = expr.indexOf(needle, index);

		if (start === -1) {
			output += expr.slice(index);
			break;
		}

		output += expr.slice(index, start);
		let depth = 1;
		let end = start + needle.length;

		while (end < expr.length && depth > 0) {
			if (expr[end] === '(') {
				depth++;
			} else if (expr[end] === ')') {
				depth--;
			}
			end++;
		}

		if (depth !== 0) {
			throw new Error('function paren');
		}

		const inner = expr.slice(start + needle.length, end - 1);
		output += replacer(inner);
		index = end;
	}

	return output;
}

export function evaluateFormula(input, table, seen = new Set()) {
	try {
		let expr = String(input || '').trim().replace(/^=/, '').toUpperCase();

		if (/^[A-Z]+\d+$/.test(expr)) {
			return displayReference(table, expr, seen);
		}

		expr = replaceFunctionCalls(expr, 'SUM', (inner) => {
			const total = splitArguments(inner).reduce((sum, argument) => sum + sumArgument(table, argument, seen), 0);
			return String(total);
		});

		expr = replaceFunctionCalls(expr, 'ROUND', (inner) => {
			const [valueExpression, digits = '0'] = splitArguments(inner);
			const numericExpression = replaceCellReferences(valueExpression, table, seen);
			return String(Number(evalSafe(numericExpression)).toFixed(Number(digits)));
		});

		expr = replaceCellReferences(expr, table, seen);
		return evalSafe(expr);
	} catch {
		return '#ERR';
	}
}

function evalSafe(expr) {
	if (!/^[\d+\-*/().\s]+$/.test(expr)) {
		throw new Error('bad formula');
	}

	const tokens = expr.match(/\d+(?:\.\d+)?|[()+\-*/]/g) || [];
	let index = 0;
	const peek = () => tokens[index];
	const take = () => tokens[index++];

	function factor() {
		const token = take();

		if (token === '(') {
			const value = sum();

			if (take() !== ')') {
				throw new Error('paren');
			}

			return value;
		}

		if (token === '-') {
			return -factor();
		}

		const number = Number(token);

		if (!Number.isFinite(number)) {
			throw new Error('num');
		}

		return number;
	}

	function product() {
		let value = factor();

		while (peek() === '*' || peek() === '/') {
			const operator = take();
			const right = factor();
			value = operator === '*' ? value * right : value / right;
		}

		return value;
	}

	function sum() {
		let value = product();

		while (peek() === '+' || peek() === '-') {
			const operator = take();
			const right = product();
			value = operator === '+' ? value + right : value - right;
		}

		return value;
	}

	const value = sum();

	if (index < tokens.length) {
		throw new Error('tail');
	}

	return value;
}

export function displayCell(table, rowIndex, columnIndexValue) {
	const cell = table.rows[rowIndex]?.cells[columnIndexValue];

	if (!cell) {
		return '';
	}

	if (cell.formula) {
		const value = evaluateFormula(cell.formula, table);
		return typeof value === 'number' ? formatNumber(value) : value;
	}

	return cell.value ?? '';
}

export function formatNumber(number) {
	return Number(number).toLocaleString('de-DE', {
		minimumFractionDigits: Number.isInteger(number) ? 0 : 2,
		maximumFractionDigits: 2,
	});
}

export function tableTotal(table) {
	let total = 0;

	table.rows.forEach((row, rowIndex) => {
		if (row.kind === 'discount' || row.kind === 'total' || row.kind === 'subtotal') {
			return;
		}

		const columnIndexValue = row.cells.length - 1;
		const raw = displayCell(table, rowIndex, columnIndexValue);
		const value = Number(String(raw).replaceAll('.', '').replace(',', '.'));

		if (Number.isFinite(value)) {
			total += value;
		}
	});

	const discount = table.discount || { type: 'none', value: 0 };

	if (discount.type === 'percent') {
		total -= total * (Number(discount.value) || 0) / 100;
	}

	if (discount.type === 'amount') {
		total -= Number(discount.value) || 0;
	}

	return total;
}

export function remapFormulaReferences(table, rowMap, columnMap) {
	const updateReference = (reference) => {
		const parsed = parseReference(reference);

		if (!parsed) {
			return reference;
		}

		const nextRow = rowMap?.get(parsed.row) ?? parsed.row;
		const nextColumn = columnMap?.get(parsed.column) ?? parsed.column;

		if (nextRow < 0 || nextColumn < 0) {
			return '#REF';
		}

		return cellRef(nextRow, nextColumn);
	};

	table.rows.forEach((row) => {
		row.cells.forEach((cell) => {
			if (!cell.formula) {
				return;
			}

			cell.formula = cell.formula.replace(/([A-Z]+\d+)/g, (reference) => updateReference(reference));
		});
	});
}
