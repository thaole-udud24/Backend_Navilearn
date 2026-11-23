const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const BusinessRule = require('./business-rule.model');

const DEFAULT_RULES = [
  {
    ruleCode: 'BR-15',
    name: 'Ngưỡng AI_Help_Ratio kích hoạt kiểm chứng độc lập',
    category: 'AI',
    value: 0.7,
    defaultValue: 0.7,
    unit: 'tỷ lệ (0-1)',
    description:
      'Nếu tỷ lệ trợ giúp từ AI vượt ngưỡng này trong lượt làm bài, sinh viên bắt buộc làm bài kiểm chứng độc lập.',
    isActive: true,
  },
  {
    ruleCode: 'BR-17-FALLING-BEHIND',
    name: 'Ngưỡng phát hiện Falling Behind (chậm tiến độ)',
    category: 'RISK',
    value: 3,
    defaultValue: 3,
    unit: 'ngày',
    description: 'Số ngày chậm so với kế hoạch học tập đề ra để hệ thống kích hoạt cảnh báo Falling Behind.',
    isActive: true,
  },
  {
    ruleCode: 'BR-17-RETENTION-RISK',
    name: 'Ngưỡng phát hiện Retention Risk (nguy cơ quên kiến thức)',
    category: 'RISK',
    value: 7,
    defaultValue: 7,
    unit: 'ngày',
    description: 'Số ngày không ôn tập lại một khái niệm dẫn tới nguy cơ rơi vào trạng thái DECAY_RISK.',
    isActive: true,
  },
  {
    ruleCode: 'BR-17-PREREQUISITE',
    name: 'Ngưỡng Mastery tiên quyết tối thiểu (Prerequisite Collapse)',
    category: 'RISK',
    value: 50,
    defaultValue: 50,
    unit: '%',
    description: 'Mức Mastery tối thiểu của kiến thức tiên quyết trước khi bắt đầu học kiến thức phụ thuộc.',
    isActive: true,
  },
  {
    ruleCode: 'BR-16-INTERVALS',
    name: 'Chu kỳ ôn tập ngắt quãng (Spaced Repetition)',
    category: 'REVISION',
    value: [1, 3, 7, 14, 30],
    defaultValue: [1, 3, 7, 14, 30],
    unit: 'ngày',
    description: 'Các mốc thời gian cách quãng để hệ thống tự động lên lịch nhắc sinh viên ôn tập lại.',
    isActive: true,
  },
  {
    ruleCode: 'BR-05-MASTERY-THRESHOLD',
    name: 'Ngưỡng chuyển trạng thái UNDERSTOOD',
    category: 'MASTERY',
    value: 80,
    defaultValue: 80,
    unit: '%',
    // [CHƯA WIRE] Chờ module Learning State (BR-39 thật: NOT_SEEN→LEARNING→PRACTICING→UNDERSTOOD→APPLIED)
    // được xây; hiện chưa có code nào đọc rule này, sửa giá trị ở đây chưa có tác dụng.
    description:
      'Mức điểm Mastery cần đạt được để kiến thức chuyển từ PRACTICING sang UNDERSTOOD. (Chưa áp dụng - chờ module Learning State)',
    isActive: true,
  },
  {
    ruleCode: 'BR-12-NBA-WEIGHTS',
    name: 'Trọng số thuật toán Next Best Action',
    category: 'MASTERY',
    value: { urgency: 0.4, weakness: 0.35, prerequisite: 0.25 },
    defaultValue: { urgency: 0.4, weakness: 0.35, prerequisite: 0.25 },
    unit: 'tỷ trọng',
    description: 'Trọng số ưu tiên đề xuất hoạt động học tập tiếp theo.',
    isActive: true,
  },
  {
    // Lưu ý: đây KHÔNG phải BR-39 chính thức trong BRD (BR-39 thật là state machine Learning State
    // NOT_SEEN→LEARNING→PRACTICING→UNDERSTOOD→APPLIED, chưa được xây). 3 rule MST-LEVEL-* này chỉ
    // là ngưỡng nội bộ cho chỉ số "level" (novice/developing/proficient/mastered) của mastery.service.js.
    ruleCode: 'MST-LEVEL-DEVELOPING',
    name: 'Ngưỡng Mastery level DEVELOPING (nội bộ, không phải BR-39)',
    category: 'MASTERY',
    value: 40,
    defaultValue: 40,
    unit: '%',
    description:
      'Điểm Mastery tối thiểu để đạt level developing (chỉ số nội bộ, không thuộc Learning State BR-39 trong BRD).',
    isActive: true,
  },
  {
    ruleCode: 'MST-LEVEL-PROFICIENT',
    name: 'Ngưỡng Mastery level PROFICIENT (nội bộ, không phải BR-39)',
    category: 'MASTERY',
    value: 70,
    defaultValue: 70,
    unit: '%',
    description:
      'Điểm Mastery tối thiểu để đạt level proficient (chỉ số nội bộ, không thuộc Learning State BR-39 trong BRD).',
    isActive: true,
  },
  {
    ruleCode: 'MST-LEVEL-MASTERED',
    name: 'Ngưỡng Mastery level MASTERED (nội bộ, không phải BR-39)',
    category: 'MASTERY',
    value: 90,
    defaultValue: 90,
    unit: '%',
    description:
      'Điểm Mastery tối thiểu để đạt level mastered (chỉ số nội bộ, không thuộc Learning State BR-39 trong BRD).',
    isActive: true,
  },
];

// Fallback dùng khi chưa có DB hoặc cho unit test không muốn hit DB (BR-38/BR-39).
const DEFAULT_THRESHOLDS = {
  'mastery.developing': 40,
  'mastery.proficient': 70,
  'mastery.mastered': 90,
};

const THRESHOLD_RULE_CODES = {
  'mastery.developing': 'MST-LEVEL-DEVELOPING',
  'mastery.proficient': 'MST-LEVEL-PROFICIENT',
  'mastery.mastered': 'MST-LEVEL-MASTERED',
};

// UC-BRL-10: merges configured rule values over the defaults so callers always get a complete map.
async function getThresholds() {
  await ensureDefaultRules();
  const codes = Object.values(THRESHOLD_RULE_CODES);
  const rows = await BusinessRule.find({ ruleCode: { $in: codes } });
  const byCode = Object.fromEntries(rows.map((r) => [r.ruleCode, r.value]));
  const result = { ...DEFAULT_THRESHOLDS };
  for (const [key, code] of Object.entries(THRESHOLD_RULE_CODES)) {
    if (byCode[code] !== undefined) result[key] = byCode[code];
  }
  return result;
}

// default rule if not exist in db
async function ensureDefaultRules() {
  const count = await BusinessRule.countDocuments();
  if (count === 0) {
    await BusinessRule.insertMany(DEFAULT_RULES);
  }
}

async function listAll(query) {
  await ensureDefaultRules();

  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.category) {
    filter.category = query.category;
  }
  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === 'true';
  }
  if (query.search) {
    filter.$or = [
      { ruleCode: { $regex: query.search, $options: 'i' } },
      { name: { $regex: query.search, $options: 'i' } },
    ];
  }
  const [items, total] = await Promise.all([
    BusinessRule.find(filter).sort({ ruleCode: 1 }).skip(skip).limit(limit),
    BusinessRule.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  const item = await BusinessRule.findById(id);
  if (!item) throw ApiError.notFound('Business rule not found');
  return item;
}

async function getByCode(ruleCode) {
  const item = await BusinessRule.findOne({ ruleCode: ruleCode.toUpperCase() });
  if (!item) throw ApiError.notFound(`Business rule ${ruleCode} not found`);
  return item;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

const RULE_VALIDATORS = {
  'BR-15': (v) => (isNum(v) && v > 0 && v <= 1) || 'Ngưỡng AI_Help_Ratio phải trong (0, 1]',
  'BR-17-FALLING-BEHIND': (v) => (Number.isInteger(v) && v >= 1) || 'Phải là số nguyên >= 1',
  'BR-17-RETENTION-RISK': (v) => (Number.isInteger(v) && v >= 1) || 'Phải là số nguyên >= 1',
  'BR-17-PREREQUISITE': (v) => (isNum(v) && v >= 0 && v <= 100) || 'Phải trong khoảng 0-100',
  'BR-05-MASTERY-THRESHOLD': (v) => (isNum(v) && v >= 0 && v <= 100) || 'Phải trong khoảng 0-100',
  'MST-LEVEL-DEVELOPING': (v) => (isNum(v) && v >= 0 && v <= 100) || 'Phải trong khoảng 0-100',
  'MST-LEVEL-PROFICIENT': (v) => (isNum(v) && v >= 0 && v <= 100) || 'Phải trong khoảng 0-100',
  'MST-LEVEL-MASTERED': (v) => (isNum(v) && v >= 0 && v <= 100) || 'Phải trong khoảng 0-100',
  'BR-16-INTERVALS': (v) =>
    (Array.isArray(v) &&
      v.length > 0 &&
      v.every((n) => Number.isInteger(n) && n > 0) &&
      v.every((n, i) => i === 0 || n > v[i - 1])) ||
    'Phải là mảng số nguyên dương tăng dần',
  'BR-12-NBA-WEIGHTS': (v) => {
    if (!v || typeof v !== 'object') return 'Phải là object trọng số';
    const keys = ['urgency', 'weakness', 'prerequisite'];
    if (!keys.every((k) => isNum(v[k]) && v[k] >= 0)) return 'Thiếu hoặc sai trọng số';
    const sum = keys.reduce((s, k) => s + v[k], 0);
    return Math.abs(sum - 1) < 1e-6 || 'Tổng trọng số phải bằng 1';
  },
};

function assertValidValue(ruleCode, value, defaultValue) {
  const check = RULE_VALIDATORS[ruleCode];
  if (check) {
    const result = check(value);
    if (result !== true) {
      throw ApiError.badRequest(result, 'INVALID_RULE_VALUE', [{ field: 'value', message: result }]);
    }
    return;
  }
  // BR-51: rule không nằm trong danh mục chuẩn (do admin tự tạo) vẫn phải có biên tối thiểu -
  // không được rỗng, và nếu đã có defaultValue thì value mới phải cùng kiểu dữ liệu.
  if (value === undefined || value === null || value === '') {
    throw ApiError.badRequest('Giá trị không được để trống', 'INVALID_RULE_VALUE', [
      { field: 'value', message: 'Giá trị không được để trống' },
    ]);
  }
  if (defaultValue !== undefined && typeof value !== typeof defaultValue) {
    throw ApiError.badRequest('Giá trị phải cùng kiểu dữ liệu với giá trị mặc định', 'INVALID_RULE_VALUE', [
      { field: 'value', message: 'Sai kiểu dữ liệu' },
    ]);
  }
}

async function create(requesterId, data) {
  const existing = await BusinessRule.findOne({ ruleCode: data.ruleCode.toUpperCase() });
  if (existing) throw ApiError.conflict('Mã quy tắc đã tồn tại trong hệ thống', 'RULE_CODE_EXISTS');

  assertValidValue(data.ruleCode.toUpperCase(), data.value, data.defaultValue);

  const item = await BusinessRule.create({
    ...data,
    defaultValue: data.defaultValue !== undefined ? data.defaultValue : data.value,
    createdBy: requesterId,
    updatedBy: requesterId,
  });
  return item;
}

async function update(id, data, requesterId) {
  const item = await BusinessRule.findById(id);
  if (!item) throw ApiError.notFound('Business rule not found');
  if (data.value !== undefined) assertValidValue(item.ruleCode, data.value, item.defaultValue);

  const oldValue = item.value;
  const isValueChanged = data.value !== undefined && JSON.stringify(data.value) !== JSON.stringify(oldValue);

  if (isValueChanged) {
    item.history.unshift({
      oldValue,
      newValue: data.value,
      changedBy: requesterId,
      reason: data.reason || 'Cập nhật giá trị quy tắc',
      changedAt: new Date(),
    });
    item.value = data.value;
  }
  if (data.name !== undefined) item.name = data.name;
  if (data.description !== undefined) item.description = data.description;
  if (data.unit !== undefined) item.unit = data.unit;
  if (data.isActive !== undefined) item.isActive = data.isActive;

  item.updatedBy = requesterId;
  await item.save();
  return item;
}

async function resetToDefault(id, requesterId, reason) {
  const item = await BusinessRule.findById(id);
  if (!item) throw ApiError.notFound('Business rule not found');
  if (JSON.stringify(item.value) === JSON.stringify(item.defaultValue)) return item;

  const oldValue = item.value;
  item.history.unshift({
    oldValue,
    newValue: item.defaultValue,
    changedBy: requesterId,
    reason: reason || 'Reset giá trị quy tắc về mặc định',
    changedAt: new Date(),
  });

  item.value = item.defaultValue;
  item.updatedBy = requesterId;
  await item.save();
  return item;
}

async function getHistory(id) {
  const item = await BusinessRule.findById(id).populate('history.changedBy', 'fullName email');
  if (!item) throw ApiError.notFound('Business rule not found');
  return item.history;
}

async function remove(id, requesterId) {
  const item = await BusinessRule.findById(id);
  if (!item) throw ApiError.notFound('Business rule not found');
  item.updatedBy = requesterId;
  await item.softDelete();
}

async function exportRules() {
  await ensureDefaultRules();
  const rules = await BusinessRule.find({}).sort({ ruleCode: 1 }).lean();
  const header = ['ruleCode', 'name', 'category', 'value', 'defaultValue', 'unit', 'isActive'];
  const esc = (v) => `"${String(typeof v === 'object' ? JSON.stringify(v) : (v ?? '')).replace(/"/g, '""')}"`;
  const rows = rules.map((r) => header.map((h) => esc(r[h])).join(','));
  return '\uFEFF' + [header.join(','), ...rows].join('\n'); // BOM để Excel đọc đúng tiếng Việt
}

async function simulate({ ruleCode, value }) {
  const rule = await getByCode(ruleCode);
  assertValidValue(rule.ruleCode, value, rule.defaultValue);
  const changed = JSON.stringify(rule.value) !== JSON.stringify(value);
  return {
    ruleCode: rule.ruleCode,
    name: rule.name,
    currentValue: rule.value,
    draftValue: value,
    changed,
    unit: rule.unit,
    // chưa lưu gì vào DB; phần tác động cụ thể bổ sung sau khi module RSK/REV/ADP có hàm đánh giá
    note: changed ? 'Giá trị nháp khác giá trị hiện hành, chưa được áp dụng.' : 'Không có thay đổi.',
  };
}

module.exports = {
  listAll,
  getById,
  getByCode,
  create,
  update,
  resetToDefault,
  getHistory,
  remove,
  exportRules,
  simulate,
  ensureDefaultRules,
  assertValidValue,
  getThresholds,
  DEFAULT_THRESHOLDS,
};
