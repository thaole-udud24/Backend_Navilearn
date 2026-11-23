const { z } = require('zod');
const importBulk = require('./importBulk');

describe('importBulk', () => {
  const schema = z.object({ name: z.string().min(1) });

  it('creates valid rows and reports per-row validation errors', async () => {
    const create = jest.fn(async (data) => ({ id: `id-${data.name}` }));
    const result = await importBulk([{ name: 'A' }, { name: '' }, { name: 'B' }], { schema, create });
    expect(result).toMatchObject({ createdCount: 2, createdIds: ['id-A', 'id-B'], errorCount: 1 });
    expect(result.errors[0].row).toBe(1);
  });

  it('keeps going and records the error when create() throws for a valid row', async () => {
    const create = jest.fn(async (data) => {
      if (data.name === 'bad') throw new Error('boom');
      return { id: data.name };
    });
    const result = await importBulk([{ name: 'ok' }, { name: 'bad' }], { schema, create });
    expect(result.createdCount).toBe(1);
    expect(result.errors).toEqual([{ row: 1, message: 'boom' }]);
  });
});
