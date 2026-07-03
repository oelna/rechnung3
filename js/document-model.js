export const APP_SCHEMA_VERSION = 'rechnung3.document.v1';

const now = () => new Date().toISOString();
const id = (prefix) => (crypto.randomUUID ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random()}`);

export const DEFAULT_MARGINS = {
	top: 20,
	right: 15,
	bottom: 20,
	left: 25,
};

export function createPage() {
	return {
		id: id('page'),
		name: 'Page',
		order: 0,
		size: {
			width: 210,
			height: 297,
			unit: 'mm',
		},
		frames: [],
	};
}

export function createFrame(type = 'text', patch = {}) {
	const base = {
		id: id('frame'),
		type,
		x: patch.x ?? DEFAULT_MARGINS.left,
		y: 30,
		width: 80,
		height: 35,
		zIndex: 1,
		locked: false,
		style: {
			fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
			fontSize: 10,
			fontWeight: 400,
			lineHeight: 1.35,
			textAlign: 'left',
		},
		content: {},
	};

	if (type === 'text') {
		base.content = {
			html: '',
		};
	}

	if (type === 'table') {
		base.width = 160;
		base.height = 12;
		base.content = {
			columns: [
				{ id: id('col'), width: 40 },
				{ id: id('col'), width: 40 },
				{ id: id('col'), width: 40 },
				{ id: id('col'), width: 40 },
			],
			rows: [
				{
					id: id('row'),
					cells: [
						{ value: '' },
						{ value: '' },
						{ value: '' },
						{ value: '' },
					],
				},
				{
					id: id('row'),
					cells: [
						{ value: '' },
						{ value: '' },
						{ value: '' },
						{ value: '' },
					],
				},
			],
			discount: {
				type: 'none',
				value: 0,
			},
			carryLabel: 'Subtotal carried forward',
		};
	}

	if (type === 'girocode') {
		base.width = 35;
		base.height = 35;
		base.content = {
			name: 'Recipient',
			iban: '',
			bic: '',
			amount: '',
			currency: 'EUR',
			reason: 'Invoice payment',
		};
	}

	return Object.assign(base, patch);
}

export function createDocument() {
	const page = createPage();
	const margins = { ...DEFAULT_MARGINS };
	const doc = {
		id: id('doc'),
		schemaVersion: APP_SCHEMA_VERSION,
		title: 'Untitled invoice',
		createdAt: now(),
		updatedAt: now(),
		settings: {
			grid: {
				enabled: true,
				size: 5,
				snap: true,
			},
			guides: {
				margins,
			},
		},
		pages: [page],
		invoice: {
			invoiceNumber: '',
			invoiceDate: new Date().toISOString().slice(0, 10),
			currency: 'EUR',
		},
	};

	page.frames.push(createFrame('text', {
		x: margins.left,
		y: margins.top,
		width: 90,
		height: 20,
		content: {
			html: '',
		},
	}));
	page.frames.push(createFrame('table', {
		x: margins.left,
		y: margins.top + 50,
	}));

	return normalizeDocument(doc);
}

export function normalizeDocument(doc) {
	doc.schemaVersion ||= APP_SCHEMA_VERSION;
	doc.id ||= id('doc');
	doc.title ||= 'Untitled invoice';
	doc.settings ||= {};
	doc.settings.guides ||= {};
	doc.settings.guides.margins ||= { ...DEFAULT_MARGINS };
	doc.pages ||= [createPage()];

	doc.pages.forEach((page, pageIndex) => {
		page.id ||= id('page');
		page.order = pageIndex;
		page.size ||= { width: 210, height: 297, unit: 'mm' };
		page.frames ||= [];

		page.frames.forEach((frame, frameIndex) => {
			frame.id ||= id('frame');
			frame.zIndex ??= frameIndex + 1;
			frame.style ||= {};
			frame.content ||= {};
		});
	});

	doc.updatedAt ||= now();
	return doc;
}

export function touch(doc) {
	doc.updatedAt = now();
	return doc;
}

export function cloneDocument(doc) {
	return JSON.parse(JSON.stringify(doc));
}
