const { deriveLevel } = require('./mastery.service');

describe('mastery module', () => {
  it('derives level thresholds correctly', () => {
    expect(deriveLevel(10)).toBe('novice');
    expect(deriveLevel(40)).toBe('developing');
    expect(deriveLevel(70)).toBe('proficient');
    expect(deriveLevel(95)).toBe('mastered');
  });
});
