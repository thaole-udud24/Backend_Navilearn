const { z } = require('zod');

const replanSchema = z.object({ planId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id') });

module.exports = { replanSchema };