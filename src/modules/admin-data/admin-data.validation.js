const { z } = require('zod');

const staleQuerySchema = z.object({
  days: z.string().optional(),
});

const exportStudentQuerySchema = z.object({
  student: z.string().min(1, 'Thiếu mã hoặc email học viên'),
});

const activityQuerySchema = z.object({
  limit: z.string().optional(),
});

module.exports = { staleQuerySchema, exportStudentQuerySchema, activityQuerySchema };
