const { parsePagination } = require('../../utils/pagination');

describe('mastery module', () => {
  it('parsePagination defaults page=1 limit=20', () => {
    const { page, limit, skip } = parsePagination({});
    expect(page).toBe(1);
    expect(limit).toBe(20);
    expect(skip).toBe(0);
  });

  it('parsePagination caps limit at 100', () => {
    const { limit } = parsePagination({ limit: '500' });
    expect(limit).toBe(100);
  });
});
