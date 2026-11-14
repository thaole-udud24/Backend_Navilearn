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
    description: 'Nếu tỷ lệ trợ giúp từ AI vượt ngưỡng này trong lượt làm bài, sinh viên bắt buộc làm bài kiểm chứng độc lập.',
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
    description: 'Mức điểm Mastery cần đạt được để kiến thức chuyển từ PRACTICING sang UNDERSTOOD.',
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
];

// default rule if not exist in db
async function ensureDefaultRules() {
  const count = await BusinessRule.countDocuments();
  if (count === 0) {
    await BusinessRule.insertMany(DEFAULT_RULES);
  }
}

async function listAll(query) {
  await ensureDefaultRules();

  const {page, limit, skip} = parsePagination(query);
  const filter = {};

  if(query.category){
    filter.category = query.category;
  }
  if(query.isActive !== undefined){
    filter.isActive = query.isActive === 'true';
  }
  if(query.search){
    filter.$or = [
      {ruleCode: {$regex: query.search, $options: 'i'}},
      {name: {$regex: query.search, $options: 'i'}},
    ];
  }
  const  [items, total] = await Promise.all([
    BusinessRule.find(filter).sort({ruleCode: 1}).skip(skip).limit(limit),
    BusinessRule.countDocuments(filter),
  ]);
  return {items, meta: buildMeta(page, limit, total)};
}

async function getById(id) {
  const item = await BusinessRule.findById(id);
  if (!item) throw ApiError.notFound('Business rule not found');
  return item;
}

async function getByCode(ruleCode) {
  const item = await BusinessRule.findOne({ruleCode: ruleCode.toUpperCase()});
  if (!item) throw ApiError.notFound(`Business rule ${ruleCode} not found`);
  return item;
} 

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

const RULE_VALIDATORS = {
  'BR-15': (v) => isNum(v) && v > 0 && v <= 1 || 'Ngưỡng AI_Help_Ratio phải trong (0, 1]',
  'BR-17-FALLING-BEHIND': (v) => Number.isInteger(v) && v >= 1 || 'Phải là số nguyên >= 1',
  'BR-17-RETENTION-RISK': (v) => Number.isInteger(v) && v >= 1 || 'Phải là số nguyên >= 1',
  'BR-17-PREREQUISITE': (v) => isNum(v) && v >= 0 && v <= 100 || 'Phải trong khoảng 0-100',
  'BR-05-MASTERY-THRESHOLD': (v) => isNum(v) && v >= 0 && v <= 100 || 'Phải trong khoảng 0-100',
  'BR-16-INTERVALS': (v) =>
    (Array.isArray(v) && v.length > 0 && v.every((n) => Number.isInteger(n) && n > 0)
      && v.every((n, i) => i === 0 || n > v[i - 1])) || 'Phải là mảng số nguyên dương tăng dần',
  'BR-12-NBA-WEIGHTS': (v) => {
    if (!v || typeof v !== 'object') return 'Phải là object trọng số';
    const keys = ['urgency', 'weakness', 'prerequisite'];
    if (!keys.every((k) => isNum(v[k]) && v[k] >= 0)) return 'Thiếu hoặc sai trọng số';
    const sum = keys.reduce((s, k) => s + v[k], 0);
    return Math.abs(sum - 1) < 1e-6 || 'Tổng trọng số phải bằng 1';
  },
};

function assertValidValue(ruleCode, value) {
  const check = RULE_VALIDATORS[ruleCode];
  if(!check) return;
  const result = check(value);
  if(result !== true){
    throw ApiError.badRequest(result, 'INVALID_RULE_VALUE', [{ field: 'value', message: result }]);
  }
}

async function create(requesterId, data) {
  const existing = await BusinessRule.findOne({ruleCode: data.ruleCode.toUpperCase()});
  if (existing) throw ApiError.conflict('Mã quy tắc đã tồn tại trong hệ thống', 'RULE_CODE_EXISTS');

  assertValidValue(data.ruleCode.toUpperCase(), data.value);

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
  if (data.value !== undefined) assertValidValue(item.ruleCode, data.value);
  
  const oldValue = item.value;
  const isValueChanged = data.value !== undefined && JSON.stringify(data.value) !== JSON.stringify(oldValue);

  if(isValueChanged){
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
  const esc = (v) => `"${String(typeof v === 'object' ? JSON.stringify(v) : v ?? '').replace(/"/g, '""')}"`;
  const rows = rules.map((r) => header.map((h) => esc(r[h])).join(','));
  return '\uFEFF' + [header.join(','), ...rows].join('\n'); // BOM để Excel đọc đúng tiếng Việt
}

async function simulate({ ruleCode, value }) {
  const rule = await getByCode(ruleCode);
  assertValidValue(rule.ruleCode, value);
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
};
