const { createSchema } = require('./knowledge.validation');

describe('knowledge module', () => {
  it('createSchema rejects empty name', () => {
    expect(createSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('createSchema accepts a minimal concept', () => {
    expect(createSchema.safeParse({ name: 'Phương trình bậc 2' }).success).toBe(true);
  });
});

jest.mock('./knowledge.model', () => ({ find: jest.fn(), countDocuments: jest.fn(), findById: jest.fn() }));

// A thenable mongoose-query-like stub: every chained call (sort/skip/limit/select/populate)
// returns itself, resolving to `result` when awaited — matches how the service now chains
// .populate() onto find()/findById() for the parent/prerequisites/related relations.
function queryStub(result) {
  const stub = {
    sort: () => stub,
    skip: () => stub,
    limit: () => stub,
    select: () => stub,
    populate: () => stub,
    then: (resolve) => resolve(result),
  };
  return stub;
}

describe('knowledge list() status filter (security)', () => {
  const Concept = require('./knowledge.model');
  const { list } = require('./knowledge.service');

  beforeEach(() => {
    Concept.find.mockReturnValue(queryStub([]));
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

describe('knowledge update()', () => {
  const Concept = require('./knowledge.model');
  const { update } = require('./knowledge.service');

  it('merges the given fields and stamps updatedBy', async () => {
    const item = { name: 'Old', description: 'old desc', save: jest.fn() };
    Concept.findById.mockReturnValue(queryStub(item));
    const result = await update('c1', 'admin1', { name: 'New' });
    expect(result.name).toBe('New');
    expect(result.description).toBe('old desc');
    expect(result.updatedBy).toBe('admin1');
    expect(item.save).toHaveBeenCalled();
  });

  it('404s on a concept that does not exist', async () => {
    Concept.findById.mockReturnValue(queryStub(null));
    await expect(update('c1', 'admin1', { name: 'New' })).rejects.toMatchObject({ status: 404 });
  });

  it('rejects a concept being set as its own parent', async () => {
    await expect(update('c1', 'admin1', { parentConcept: 'c1' })).rejects.toMatchObject({
      code: 'SELF_PARENT',
    });
  });

  it('rejects a prerequisite that does not exist', async () => {
    Concept.countDocuments.mockResolvedValue(0);
    await expect(update('c1', 'admin1', { prerequisites: ['missing-id'] })).rejects.toMatchObject({
      code: 'INVALID_RELATION',
    });
  });
});
