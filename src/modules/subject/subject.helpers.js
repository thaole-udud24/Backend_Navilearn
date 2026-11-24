const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toPublicSubject = (subject, documentCount = 0) => ({
  id: subject.id,
  scope: subject.scope,
  name: subject.name,
  description: subject.description,
  status: subject.status,
  pinned: subject.pinned,
  order: subject.order,
  catalogSubject: subject.catalogSubject ? String(subject.catalogSubject) : null,
  documentCount,
  createdAt: subject.createdAt,
  updatedAt: subject.updatedAt,
});

// storedName is the on-disk name: never exposed.
const toPublicDocument = (doc) => ({
  id: doc.id,
  scope: doc.scope,
  subject: String(doc.subject),
  name: doc.name,
  description: doc.description,
  tags: doc.tags,
  important: doc.important,
  classification: {
    chapter: doc.classification?.chapter || '',
    topic: doc.classification?.topic || '',
    concept: doc.classification?.concept || '',
  },
  file: { originalName: doc.file.originalName, mimeType: doc.file.mimeType, size: doc.file.size },
  version: doc.version,
  processingStatus: doc.processingStatus,
  processingError: doc.processingError,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

/** Counts documents per subject id → Map(subjectId -> count). */
async function countDocumentsBySubject(DocumentModel, subjectIds) {
  const rows = await DocumentModel.aggregate([
    { $match: { subject: { $in: subjectIds } } },
    { $group: { _id: '$subject', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

module.exports = { escapeRegex, toPublicSubject, toPublicDocument, countDocumentsBySubject };
