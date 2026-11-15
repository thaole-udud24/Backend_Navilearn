const { z } = require('zod');

const createRuleSchema = z.object(
  {
    ruleCode: z.string().min(2).max(50),
    name: z.string().min(1).max(250),
    category: z.enum(['AI', 'RISK', 'REVISION', 'MASTERY', 'GENERAL']).default('GENERAL'),
    value: z.any(),
    defaultValue: z.any().optional(),
    unit: z.string().max(20).optional().default(''),
    description: z.string().max(2000).optional().default(''),
    isActive: z.boolean().optional().default(true),
  },
);

const updateRuleSchema = z.object(
  {
    value: z.any().optional(),
    name: z.string().min(1).max(250).optional(),
    description: z.string().max(2000).optional(),
    unit: z.string().max(20).optional(),
    isActive: z.boolean().optional(),
    reason: z.string().max(500).optional().default('Cập nhật quy tắc'),
  },
);

const resetRuleSchema = z.object(
  {
    reason: z.string().max(500).optional().default('Khôi phục về giá trị mặc định'),
  },
);

const listQuerySchema = z.object(
  {
    page: z.string().optional(),
    limit: z.string().optional(),
    category: z.enum(['AI', 'RISK', 'REVISION', 'MASTERY', 'GENERAL']).optional(),
    search: z.string().optional(),
    isActive: z.enum(['true', 'false']).optional(),
  },
);

const idParamsSchema = z.object(
  {
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID không hợp lệ'),
  },
);

const simulateRuleSchema = z.object({
  ruleCode: z.string().min(2).max(50),
  value: z.any(),
});

module.exports = {
  createRuleSchema,
  updateRuleSchema,
  resetRuleSchema,
  listQuerySchema,
  idParamsSchema,
  simulateRuleSchema,
}; 