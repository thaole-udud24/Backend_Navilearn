const SUBJECT_SCOPE = Object.freeze({ PERSONAL: 'personal', SHARED: 'shared' });

// personal subjects: active <-> archived. shared catalog subjects: active <-> inactive.
const SUBJECT_STATUS = Object.freeze({ ACTIVE: 'active', ARCHIVED: 'archived', INACTIVE: 'inactive' });

// [ASSUMPTION] Text extraction/indexing belongs to the AIA module; until it runs, uploads stay "pending".
const PROCESSING_STATUS = Object.freeze({ PENDING: 'pending', PROCESSED: 'processed', ERROR: 'error' });

const MAX_DOCUMENTS_PER_SUBJECT = 30; // BR-43
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_IMPORT_FILES = 20;

const ALLOWED_FILE_TYPES = Object.freeze({
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
});

module.exports = {
  SUBJECT_SCOPE,
  SUBJECT_STATUS,
  PROCESSING_STATUS,
  MAX_DOCUMENTS_PER_SUBJECT,
  MAX_FILE_SIZE,
  MAX_IMPORT_FILES,
  ALLOWED_FILE_TYPES,
};
