const { buildDashboard } = require('./mastery.dashboard.service');

describe('student mastery dashboard', () => {
  it('returns no invented average when the student has no assessment data', () => {
    const result = buildDashboard([], new Date('2026-01-08T12:00:00Z'));

    expect(result.summary.averageMastery).toBeNull();
    expect(result.summary.trackedConcepts).toBe(0);
    expect(result.trend).toHaveLength(7);
    expect(result.weakConcepts).toEqual([]);
  });

  it('counts learning states and lists weak assessed concepts', () => {
    const now = new Date();
    const items = [
      {
        concept: { _id: 'c1', name: 'Khái niệm A' },
        score: 40,
        attemptsCount: 2,
        learningState: 'LEARNING',
        lastAttemptAt: now,
        history: [{ score: 40, at: now }],
      },
      {
        concept: { _id: 'c2', name: 'Khái niệm B' },
        score: 80,
        attemptsCount: 3,
        learningState: 'UNDERSTOOD',
        lastAttemptAt: now,
        history: [{ score: 80, at: now }],
      },
    ];

    const result = buildDashboard(items, now);

    expect(result.summary.averageMastery).toBe(60);
    expect(result.summary.masteredConcepts).toBe(1);
    expect(result.summary.decayRiskConcepts).toBe(0);
    expect(result.weakConcepts).toEqual([
      expect.objectContaining({ conceptId: 'c1', score: 40 }),
    ]);
  });
});