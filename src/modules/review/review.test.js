const { parsePagination } = require('../../utils/pagination');

describe('review module', () => {
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

// B11: real aggregate stats for the admin tiles.
jest.mock('./review.model');

describe('stats (B11)', () => {
  const ReviewItem = require('./review.model');
  const { stats } = require('./review.service');

  beforeEach(() => jest.clearAllMocks());

  it('aggregates overall avg rating/total, unseen count, and per-category breakdown', async () => {
    ReviewItem.aggregate
      .mockResolvedValueOnce([{ _id: null, avgRating: 4.2, total: 318 }])
      .mockResolvedValueOnce([
        { category: 'lo_trinh', avgRating: 4.5, total: 120 },
        { category: 'luyen_tap', avgRating: 3.8, total: 90 },
      ]);
    ReviewItem.countDocuments.mockResolvedValue(12);

    const result = await stats();

    expect(result).toEqual({
      avgRating: 4.2,
      total: 318,
      unseen: 12,
      byCategory: [
        { category: 'lo_trinh', avgRating: 4.5, total: 120 },
        { category: 'luyen_tap', avgRating: 3.8, total: 90 },
      ],
    });
    expect(ReviewItem.countDocuments).toHaveBeenCalledWith({ status: 'open' });
  });

  it('defaults to zero when there are no reviews yet', async () => {
    ReviewItem.aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    ReviewItem.countDocuments.mockResolvedValue(0);

    const result = await stats();

    expect(result.avgRating).toBe(0);
    expect(result.total).toBe(0);
    expect(result.unseen).toBe(0);
  });
});
