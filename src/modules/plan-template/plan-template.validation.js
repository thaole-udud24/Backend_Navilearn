const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const stepSchema = z.object({
  dayOffset: z.number().int().min(1).max(60),
  durationMin: z.number().int().min(5).max(480),
  title: z.string().trim().min(1).max(150),
  chapterTitle: z.string().trim().max(150).optional(),
  note: z.string().trim().max(300).optional(),
  objectives: z.array(z.string().trim().max(200)).max(6).optional(),
  theoryContent: z.string().trim().max(8000).optional(),
  questions: z.array(objectId).max(20).optional(),
  // When set, objectives/theoryContent/questions above are overwritten server-side with a snapshot
  // of the referenced (published) lesson — see plan-template.service.applyLessonSnapshots.
  lessonId: objectId.optional().nullable(),
});

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  concept: objectId.optional(),
  steps: z.array(stepSchema).min(1).max(20),
  source: z.enum(['manual', 'ai', 'import']).optional(),
});

const updateSchema = createSchema.partial().refine((o) => Object.keys(o).length > 0, 'No fields to update');

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  concept: objectId.optional(),
  subjectId: objectId.optional(),
});

const idParamsSchema = z.object({ id: objectId });

const stepLessonParamsSchema = z.object({ id: objectId, stepIndex: z.coerce.number().int().min(0) });

const applySchema = z.object({
  goalId: objectId.optional(),
});

const publishSchema = z.object({
  changeLog: z.string().trim().max(500).optional(),
});

const importSchema = z.object({
  items: z.array(z.record(z.unknown())).min(1).max(500),
});

module.exports = {
  createSchema,
  updateSchema,
  listQuerySchema,
  idParamsSchema,
  stepLessonParamsSchema,
  applySchema,
  publishSchema,
  importSchema,
};
