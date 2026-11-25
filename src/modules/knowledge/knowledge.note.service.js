const ApiError = require('../../utils/ApiError');
const ConceptNote = require('./knowledge.note.model');
const { getOwnedNode } = require('./knowledge.personal.service');

const toPublicNote = (note) => ({
  id: note.id,
  personalConcept: String(note.personalConcept),
  content: note.content,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
});

async function getOwnedNote(noteId, ownerId) {
  const note = await ConceptNote.findOne({ _id: noteId, owner: ownerId });
  if (!note) throw ApiError.notFound('Không tìm thấy ghi chú');
  return note;
}

async function listNotes(ownerId, personalConceptId) {
  await getOwnedNode(personalConceptId, ownerId);
  const notes = await ConceptNote.find({ owner: ownerId, personalConcept: personalConceptId }).sort({ createdAt: -1 });
  return notes.map(toPublicNote);
}

// UC-KNW-10
async function createNote(ownerId, { personalConcept, content }) {
  const node = await getOwnedNode(personalConcept, ownerId);
  if (node.status !== 'active') {
    throw ApiError.conflict('Nút đã ngừng sử dụng, không thể thêm ghi chú', 'NODE_ARCHIVED');
  }
  const note = await ConceptNote.create({ owner: ownerId, personalConcept: node._id, content, createdBy: String(ownerId) });
  return toPublicNote(note);
}

// UC-KNW-11
async function updateNote(noteId, ownerId, content) {
  const note = await getOwnedNote(noteId, ownerId);
  note.content = content;
  note.updatedBy = String(ownerId);
  await note.save();
  return toPublicNote(note);
}

// UC-KNW-12
async function deleteNote(noteId, ownerId) {
  const note = await getOwnedNote(noteId, ownerId);
  await note.deleteOne();
}

module.exports = { listNotes, createNote, updateNote, deleteNote };
