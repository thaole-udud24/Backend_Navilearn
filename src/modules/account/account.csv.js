// Minimal CSV writer. Cells that start with = + - @ are prefixed with ' so Excel does not run them as formulas.
const BOM = String.fromCharCode(0xfeff);

function escapeCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** columns: [{ header, value: (row) => any }]. Output starts with a BOM so Excel reads UTF-8 correctly. */
function toCsv(rows, columns) {
  const lines = [columns.map((c) => escapeCell(c.header)).join(',')];
  rows.forEach((row) => lines.push(columns.map((c) => escapeCell(c.value(row))).join(',')));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

module.exports = { toCsv, escapeCell };
