// BR-40. shortcut: weights hard-coded, read from business-rule (BRL) when that module is ready.
const WEIGHTS = Object.freeze({
  mastery: 0.3,
  importance: 0.2,
  prerequisite: 0.15,
  deadline: 0.2,
  forgetting: 0.1,
  timeFit: 0.05,
});

// mastery is 0-100 (MasteryItem.score); every other factor is 0-1.
const FACTORS = {
  mastery: (a) => 1 - a.mastery / 100,
  importance: (a) => a.importance,
  prerequisite: (a) => a.prerequisite,
  deadline: (a) => a.deadline,
  forgetting: (a) => a.forgetting,
  timeFit: (a) => a.timeFit,
};
function computePriority(a, w = WEIGHTS) {
  return Object.keys(w).reduce((sum, k) => sum + w[k] * FACTORS[k](a), 0);
}
const DAY_MS = 86400000;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// shortcut: prerequisite and timeFit stay 0 until Concept has prerequisite data and study-time data exists.
function buildActivity({ id, name, mastery, goal }, now = new Date()) {
  const last = mastery && mastery.lastAttemptAt;
  return {
    id,
    name,
    mastery: mastery ? mastery.score : 0,
    importance: goal ? goal.importance / 5 : 0.6,
    prerequisite: 0,
    deadline: goal ? clamp01(1 - (goal.deadline - now) / DAY_MS / 30) : 0,
    forgetting: last ? clamp01((now - last) / DAY_MS / 14) : 0,
    timeFit: 0,
  };
}
const REASONS = {
  mastery: (a) => `Mức thành thạo còn thấp (${Math.round(a.mastery)}/100)`,
  importance: () => 'Khái niệm có mức quan trọng cao',
  prerequisite: () => 'Là kiến thức tiên quyết cần củng cố',
  deadline: () => 'Sắp đến hạn mục tiêu',
  forgetting: () => 'Lâu chưa ôn, có nguy cơ quên',
  timeFit: () => 'Phù hợp với thời gian khả dụng',
};
// BR-12: every recommendation carries a reason = the factor that contributes most to the score.
function explain(a, w = WEIGHTS) {
  const top = Object.keys(w).reduce((best, k) => (w[k] * FACTORS[k](a) > w[best] * FACTORS[best](a) ? k : best));
  return REASONS[top](a);
}

function rankActivities(activities, w = WEIGHTS) {
  return activities
    .map((a) => ({ ...a, priority: computePriority(a, w) }))
    .sort((x, y) => y.priority - x.priority);
}

module.exports = { WEIGHTS, computePriority, rankActivities, buildActivity, explain };
