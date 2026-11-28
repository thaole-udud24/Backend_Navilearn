const { z } = require('zod');

const dismissSchema = z.object({
  key: z.string().min(1).max(200),
  action: z.enum(['keep', 'snooze']),
});

module.exports = { dismissSchema };
