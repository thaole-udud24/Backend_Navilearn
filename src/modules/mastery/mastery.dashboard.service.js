const MasteryItem = require('./mastery.model');
const { computeDisplayState } = require('./mastery.service');

const STATES = ['LEARNING', 'PRACTICING', 'UNDERSTOOD', 'APPLIED', 'DECAY_RISK'];

function buildDashboard(items, now = new Date()) {
  const stateCounts = Object.fromEntries(STATES.map((state) => [state, 0]));
  const assessed = items.filter((item) => item.attemptsCount > 0);

  for (const item of items) {
    const state = computeDisplayState(item);
    if (Object.hasOwn(stateCounts, state)) stateCounts[state] += 1;
  }

  const averageMastery = assessed.length
    ? Math.round(assessed.reduce((sum, item) => sum + item.score, 0) / assessed.length)
    : null;

  const weakConcepts = assessed
    .map((item) => ({
      conceptId: String(item.concept?._id ?? item.concept),
      name: item.concept?.name ?? 'Khái niệm',
      score: item.score,
      learningState: computeDisplayState(item),
    }))
    .filter((item) => item.score < 60 || item.learningState === 'DECAY_RISK')
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  // Dựng lại điểm Mastery trung bình cuối mỗi ngày từ lịch sử chấm bài.
  const trend = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - 6 + index,
    ));
    const endOfDay = day.getTime() + 24 * 60 * 60 * 1000 - 1;

    const scores = assessed.flatMap((item) => {
      const latest = (item.history ?? [])
        .filter((entry) => new Date(entry.at).getTime() <= endOfDay)
        .sort((a, b) => new Date(b.at) - new Date(a.at))[0];

      return latest ? [latest.score] : [];
    });

    return {
      date: day.toISOString().slice(0, 10),
      averageMastery: scores.length
        ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
        : null,
    };
  });

  return {
    summary: {
      trackedConcepts: items.length,
      assessedConcepts: assessed.length,
      averageMastery,
      masteredConcepts: stateCounts.UNDERSTOOD + stateCounts.APPLIED,
      decayRiskConcepts: stateCounts.DECAY_RISK,
    },
    stateCounts,
    trend,
    weakConcepts,
  };
}

async function getDashboard(ownerId) {
  // Không phân trang: các chỉ số không được sai khi sinh viên có hơn 100 khái niệm.
  const items = await MasteryItem.find({ owner: ownerId })
    .populate('concept', 'name')
    .lean();

  return buildDashboard(items);
}

module.exports = { getDashboard, buildDashboard };