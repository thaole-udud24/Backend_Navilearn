const ApiError = require('../utils/ApiError');
const { ROLES } = require('./roles');
const Concept = require('../modules/knowledge/knowledge.model');
const StudentSubjectItem = require('../modules/student-subject/student-subject.model');
const knowledgeService = require('../modules/knowledge/knowledge.service');

async function findRootConceptId(concept) {
  let current = concept;
  const visited = new Set([String(current._id)]);
  while (current && current.parentConcept) {
    const parentId = String(current.parentConcept);
    if (visited.has(parentId)) break;
    visited.add(parentId);
    // eslint-disable-next-line no-await-in-loop
    current = await Concept.findById(parentId).select('_id parentConcept').lean();
  }
  return current?._id ?? concept._id;
}

/**
 * Validates `subjectId` and returns all descendant Concept IDs (including the subject itself).
 * For students, enforces that the root subject is in their enrolled `StudentSubjectItem` list.
 * Returns `null` when `subjectId` is omitted/empty ("Tất cả môn học").
 */
async function resolveSubjectConceptIds(subjectId, requester) {
  if (!subjectId) return null;
  const subject = await Concept.findOne({ _id: subjectId, status: 'active' })
    .select('_id parentConcept')
    .lean();
  if (!subject) {
    throw ApiError.notFound('Môn học không tồn tại', 'SUBJECT_NOT_FOUND');
  }

  if (requester?.role === ROLES.STUDENT) {
    const rootId = subject.parentConcept ? await findRootConceptId(subject) : subject._id;
    const enrolled = await StudentSubjectItem.exists({ owner: requester.id, concept: rootId });
    if (!enrolled) {
      throw ApiError.forbidden('Bạn không có quyền truy cập môn học này', 'SUBJECT_FORBIDDEN');
    }
  }

  return knowledgeService.getDescendantIds(subject._id);
}

module.exports = { resolveSubjectConceptIds };
