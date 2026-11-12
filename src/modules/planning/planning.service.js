const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const PlanningItem = require('./planning.model');
const PlanningGoal = require('./planning.goal.model');
async function create(ownerId, data) {
  return PlanningItem.create({ owner: ownerId, createdBy: ownerId, ...data });
}

async function listForOwner(ownerId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { owner: ownerId, ...(query.status ? { status: query.status } : {}) };
  const [items, total] = await Promise.all([
    PlanningItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    PlanningItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

// Personal learning data (BR-02/BR-35): owner only, admin gets no access.
async function getOwned(id, requester) {
  const item = await PlanningItem.findById(id);
  if (!item) throw ApiError.notFound('Plan not found');
  if (String(item.owner) !== String(requester.id)) throw ApiError.forbidden('Not the owner of this plan');
  return item;
}

async function confirm(id, requester) {
  const item = await getOwned(id, requester);
  if (item.status !== 'proposed') throw ApiError.conflict('Plan is not awaiting confirmation');
  item.status = 'active';
  item.updatedBy = requester.id;
  await item.save();
  if (item.replaces) await PlanningItem.updateOne({ _id: item.replaces, owner: item.owner }, { status: 'superseded' });
  return item;
}

async function getActive(id, requester) {
  const item = await getOwned(id, requester);
  if (item.status !== 'active') throw ApiError.conflict('Only an active plan can be edited');
  return item;
}

async function addSession(id, requester, data) {
  const item = await getActive(id, requester);
  item.sessions.push(data);
  item.updatedBy = requester.id;
  await item.save();
  return item;
}

async function updateSession(id, sessionId, requester, data) {
  const item = await getActive(id, requester);
  const session = item.sessions.find((s) => String(s._id) === sessionId);
  if (!session) throw ApiError.notFound('Session not found');
  Object.assign(session, data);
  item.updatedBy = requester.id;
  await item.save();
  return item;
}

async function removeSession(id, sessionId, requester) {
  const item = await getActive(id, requester);
  if (!item.sessions.some((s) => String(s._id) === sessionId)) throw ApiError.notFound('Session not found');
  item.sessions = item.sessions.filter((s) => String(s._id) !== sessionId);
  item.updatedBy = requester.id;
  await item.save();
}

async function remove(id, requester) {
  const item = await getOwned(id, requester);
  await item.softDelete();
}

async function createGoal(ownerId, data) {
  return PlanningGoal.create({ owner: ownerId, createdBy: ownerId, ...data });
}

async function listGoals(ownerId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { owner: ownerId };
  const [items, total] = await Promise.all([
    PlanningGoal.find(filter).sort({ deadline: 1 }).skip(skip).limit(limit).populate('concept', 'name'),
    PlanningGoal.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function getOwnedGoal(id, requester) {
  const goal = await PlanningGoal.findById(id);
  if (!goal) throw ApiError.notFound('Goal not found');
  if (String(goal.owner) !== String(requester.id)) throw ApiError.forbidden('Not the owner of this goal');
  return goal;
}

async function updateGoal(id, requester, data) {
  const goal = await getOwnedGoal(id, requester);
  Object.assign(goal, data, { updatedBy: requester.id });
  await goal.save();
  return goal;
}

async function removeGoal(id, requester) {
  const goal = await getOwnedGoal(id, requester);
  await goal.softDelete();
}

module.exports = {
  create,
  listForOwner,
  getOwned,
  confirm,
  addSession,
  updateSession,
  removeSession,
  remove,
  createGoal,
  listGoals,
  getOwnedGoal,
  updateGoal,
  removeGoal,
};
