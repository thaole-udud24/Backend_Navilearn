const { createSchema } = require('./knowledge.validation');

describe('knowledge module', () => {
  it('createSchema rejects empty name', () => {
    expect(createSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('createSchema accepts a minimal concept', () => {
    expect(createSchema.safeParse({ name: 'Phương trình bậc 2' }).success).toBe(true);
  });
});

jest.mock('./knowledge.model', () => ({ find: jest.fn(), countDocuments: jest.fn() }));

describe('knowledge list() status filter (security)', () => {
  const Concept = require('./knowledge.model');
  const { list } = require('./knowledge.service');

  beforeEach(() => {
    Concept.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => [] }) }) });
    Concept.countDocuments.mockResolvedValue(0);
  });

  it('forces status=active for a student even if they ask for a different status', async () => {
    await list({ status: 'archived' }, { role: 'student' });
    expect(Concept.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
  });

  it('lets an admin request a specific status', async () => {
    await list({ status: 'archived' }, { role: 'admin' });
    expect(Concept.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'archived' }));
  });
});
