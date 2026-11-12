const { deriveLevel } = require('./mastery.service');

describe('mastery module', () => {
  it('derives level thresholds correctly with the default cut points', () => {
    expect(deriveLevel(10)).toBe('novice');
    expect(deriveLevel(40)).toBe('developing');
    expect(deriveLevel(70)).toBe('proficient');
    expect(deriveLevel(95)).toBe('mastered');
  });

  it('derives level using admin-configured thresholds (UC-BRL-10) instead of the defaults', () => {
    const thresholds = { 'mastery.developing': 20, 'mastery.proficient': 50, 'mastery.mastered': 80 };
    expect(deriveLevel(25, thresholds)).toBe('developing');
    expect(deriveLevel(85, thresholds)).toBe('mastered');
    expect(deriveLevel(10, thresholds)).toBe('novice');
  });
});
