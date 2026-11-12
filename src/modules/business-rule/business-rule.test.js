const { parsePagination } = require('../../utils/pagination');
const { thresholdKeyParamsSchema, upsertThresholdSchema } = require('./business-rule.validation');
const { DEFAULT_THRESHOLDS } = require('./business-rule.service');

describe('business-rule module', () => {
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

  it('rejects an unknown threshold key', () => {
    expect(thresholdKeyParamsSchema.safeParse({ key: 'mastery.unknown' }).success).toBe(false);
  });

  it('accepts a known threshold key', () => {
    expect(thresholdKeyParamsSchema.safeParse({ key: 'mastery.proficient' }).success).toBe(true);
  });

  it('rejects a threshold value outside 0-100', () => {
    expect(upsertThresholdSchema.safeParse({ value: 150 }).success).toBe(false);
  });

  it('ships sane default mastery thresholds', () => {
    expect(DEFAULT_THRESHOLDS['mastery.developing']).toBeLessThan(DEFAULT_THRESHOLDS['mastery.proficient']);
    expect(DEFAULT_THRESHOLDS['mastery.proficient']).toBeLessThan(DEFAULT_THRESHOLDS['mastery.mastered']);
  });
});
