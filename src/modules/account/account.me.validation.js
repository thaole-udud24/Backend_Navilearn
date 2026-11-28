const { z } = require('zod');
const { passwordField } = require('./account.auth.validation');

const minutes = z.number().int().min(0).max(1440);

const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(1).max(100),
    locale: z.enum(['vi', 'en']),
    timezone: z.string().trim().min(1).max(64),
    learningGoal: z.string().trim().max(500),
    availability: z
      .object({
        mon: minutes,
        tue: minutes,
        wed: minutes,
        thu: minutes,
        fri: minutes,
        sat: minutes,
        sun: minutes,
      })
      .partial(),
    // N14 "Nhắc học": giờ nhắc + ngày nghỉ mặc định.
    notificationHour: z.number().int().min(0).max(23),
    defaultRestDays: z.array(z.number().int().min(0).max(6)).max(7),
  })
  .partial();

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordField,
});

const deleteAccountSchema = z.object({
  password: z.string().min(1),
});

const sessionIdParamsSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id'),
});

module.exports = { updateProfileSchema, changePasswordSchema, deleteAccountSchema, sessionIdParamsSchema };
