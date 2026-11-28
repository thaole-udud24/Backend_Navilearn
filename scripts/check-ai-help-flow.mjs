import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('dotenv').config();

const mongoose = require('mongoose');
const { getAiHelpRatio } = require('../src/modules/ai-assist/ai-help.service');

const baseUrl = process.env.API_BASE_URL || 'http://localhost:5000/api/v1';
const token = process.env.ACCESS_TOKEN;
const configId = process.env.ASSESSMENT_CONFIG_ID;

if (!token || !configId || !process.env.MONGODB_URI) {
  throw new Error('Cần ACCESS_TOKEN, ASSESSMENT_CONFIG_ID và MONGODB_URI');
}

const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
const ownerId = payload.sub;

async function api(path, method = 'GET', body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${json.message || response.status}`);
  }
  return json.data;
}

await mongoose.connect(process.env.MONGODB_URI);

try {
  const config = await api(`/assessment-config-items/${configId}`);
  assert.equal(config.kind, 'practice');
  assert.equal(config.retryPolicy?.maxAttempts ?? 0, 0, 'Chọn bộ đề cho phép làm lại không giới hạn');

  assert.ok(config.questions?.length > 0, 'Bộ đề cần ít nhất một câu hỏi');
  const questionId = String(config.questions[0]);

  const question = await api(`/question-bank-items/${questionId}`);
  assert.ok(
    ['mcq', 'true_false'].includes(question.type),
    'Chọn bộ đề có câu trắc nghiệm để test không cần chấm tự luận bằng AI',
  );

  const answers = [{ question: questionId, selectedOptionIndex: 0 }];

  // Lấy mốc trước khi tạo 2 bài; database dev có thể đã có bài cũ.
  const first = await api('/assessment-items', 'POST', {
    assessmentConfig: configId,
  });
  const before = await getAiHelpRatio(ownerId, first.concept);

  await api('/ai-assist-items/ask', 'POST', {
    question: 'Hãy gợi ý cách tiếp cận kiến thức này.',
    concept: first.concept,
    assessmentItemId: first._id,
  });

  const assisted = await api(`/assessment-items/${first._id}/submit`, 'PATCH', { answers });
  assert.ok(assisted.aiHelpLevel > 0);
  assert.ok(assisted.aiHelpCount > 0);

  const second = await api('/assessment-items', 'POST', {
    assessmentConfig: configId,
  });
  const unassisted = await api(`/assessment-items/${second._id}/submit`, 'PATCH', { answers });
  assert.equal(unassisted.aiHelpLevel, 0);
  assert.equal(unassisted.aiHelpCount, 0);

  const after = await getAiHelpRatio(ownerId, first.concept);
  assert.equal(after.totalAttempts - before.totalAttempts, 2);
  assert.equal(after.assistedAttempts - before.assistedAttempts, 1);

  process.stdout.write(
    `Đạt: 2 bài mới, 1 bài dùng AI; tỉ lệ của 2 bài mới = 0.5\n` +
      `Tỉ lệ toàn bộ bài của kiến thức này = ${after.aiHelpRatio}\n`,
  );
} finally {
  await mongoose.disconnect();
}
