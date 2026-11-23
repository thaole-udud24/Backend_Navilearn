// Generic "validate each row, create what's valid, keep going" import report — the pattern
// already used by question-bank.service.importBulk, extracted so other admin-editable catalogs
// (assessment-config, rubric, plan-template, knowledge) can reuse it instead of re-copying it.
async function importBulk(rows, { schema, create }) {
  const created = [];
  const errors = [];
  for (let i = 0; i < rows.length; i += 1) {
    const parsed = schema.safeParse(rows[i]);
    if (!parsed.success) {
      errors.push({ row: i, message: parsed.error.issues.map((iss) => iss.message).join('; ') });
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const item = await create(parsed.data);
      created.push(item.id);
    } catch (err) {
      errors.push({ row: i, message: err.message });
    }
  }
  return { createdCount: created.length, createdIds: created, errorCount: errors.length, errors };
}

module.exports = importBulk;
