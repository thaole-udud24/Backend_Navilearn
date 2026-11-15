const { parsePagination } = require('../../utils/pagination');
const {
  createRuleSchema,
  updateRuleSchema,
  resetRuleSchema,
  idParamsSchema,
} = require('./business-rule.validation');
const { assertValidValue } = require('./business-rule.service');

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

  it('validates createRuleSchema properly', () => {
    const validData = {
      ruleCode: 'BR-15',
      name: 'Ngưỡng AI Help Ratio',
      category: 'AI',
      value: 0.7,
      defaultValue: 0.7,
      unit: '%',
      description: 'Quy tắc kiểm tra tỷ lệ trợ giúp từ AI',
    };
    const parsed = createRuleSchema.safeParse(validData);
    expect(parsed.success).toBe(true);
  });

  it('rejects createRuleSchema with missing required fields', () => {
    const invalidData = {
      name: 'Thiếu ruleCode và value',
    };
    const parsed = createRuleSchema.safeParse(invalidData);
    expect(parsed.success).toBe(false);
  });

  it('validates updateRuleSchema with partial fields and reason', () => {
    const updateData = {
      value: 0.8,
      reason: 'Nâng ngưỡng phát hiện rủi ro',
    };
    const parsed = updateRuleSchema.safeParse(updateData);
    expect(parsed.success).toBe(true);
    expect(parsed.data.reason).toBe('Nâng ngưỡng phát hiện rủi ro');
  });

  it('validates resetRuleSchema with default reason', () => {
    const parsed = resetRuleSchema.safeParse({});
    expect(parsed.success).toBe(true);
    expect(parsed.data.reason).toBe('Khôi phục về giá trị mặc định');
  });

  it('rejects BR-15 out of range', () => {
  expect(() => assertValidValue('BR-15', 1.5)).toThrow();
});
  it('accepts BR-15 = 0.7', () => {
    expect(() => assertValidValue('BR-15', 0.7)).not.toThrow();
  });

  it('rejects NBA weights not summing to 1', () => {
    expect(() => assertValidValue('BR-12-NBA-WEIGHTS', { urgency: 0.5, weakness: 0.5, prerequisite: 0.5 })).toThrow();
  });

  it('rejects non-increasing review intervals', () => {
    expect(() => assertValidValue('BR-16-INTERVALS', [1, 7, 3])).toThrow();
  });
  
  it('rejects malformed id', () => {
    expect(idParamsSchema.safeParse({ id: 'abc' }).success).toBe(false);
  });
}); 

