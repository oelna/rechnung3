# Rechnung3

Rechnung3 is a static, browser-only invoice layout editor. It is intended to run from simple hosting such as GitHub Pages with only `index.html`, CSS, and JavaScript files.

## Project outline

The app experiments with a lightweight desktop-publishing workflow for invoices:

- DIN A4 pages rendered in the browser.
- Add, duplicate, delete, and reorder pages.
- Add typed frames for text, tables, and Girocode placeholders.
- Move and resize frames on the page with visible handles.
- Edit text frame content directly on the page.
- Edit table cells and table headers directly on the page.
- Resize, insert, delete, and reorder table rows and columns.
- Use simple spreadsheet-style formulas in table cells, including cell references, `SUM()`, and `ROUND()`.
- Add subtotal/carry-forward rows and table-level discounts.
- Save documents to `localStorage` and import/export document JSON.
- Print to DIN A4 or export to PDF through the browser print dialog.

## Current limitations

This repository is a vibe-coded prototype and should be treated as an exploratory draft, not production accounting software.

Known limitations include:

- Formula parsing is intentionally small and only supports a limited subset of spreadsheet syntax.
- Girocode rendering is currently a placeholder rather than a finished QR/Girocode implementation.
- Browser print/PDF output can vary by browser and printer settings.
- The document schema can still change between prototypes.
- There is no automated browser test suite yet.
- Accessibility and keyboard workflows need more polish.
- Long table continuation across multiple pages is only partially represented through subtotal/carry-forward helpers.

## Development

Open `index.html` in a browser or serve the directory with any static file server. No build step is required.
