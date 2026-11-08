const { createSchema } = require('./knowledge.validation');

describe('knowledge module', () => {
  it('createSchema rejects empty name', () => {
    expect(createSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('createSchema accepts a minimal concept', () => {
    expect(createSchema.safeParse({ name: 'Phương trình bậc 2' }).success).toBe(true);
  });
});
