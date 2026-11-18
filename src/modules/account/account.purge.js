const mongoose = require('mongoose');

// Fields that point at the user who owns a document. Shared content created by an ADMIN is deliberately not
// matched by "actor"/"createdBy", only by these ownership fields.
const OWNER_PATHS = ['owner', 'user', 'student'];

/**
 * BR-26: permanently deletes every document owned by a user (attempts, mastery, plans, history, sessions...).
 * Walks all registered models, so modules added later are covered without changing this file.
 * Returns { modelName: deletedCount } for the audit log.
 */
async function purgeUserData(userId) {
  const result = {};
  for (const Model of Object.values(mongoose.models)) {
    if (Model.modelName === 'User') continue;
    for (const path of OWNER_PATHS) {
      const schemaPath = Model.schema.path(path);
      if (schemaPath && schemaPath.options && schemaPath.options.ref === 'User') {
        // eslint-disable-next-line no-await-in-loop
        const { deletedCount } = await Model.deleteMany({ [path]: userId });
        if (deletedCount) result[Model.modelName] = (result[Model.modelName] || 0) + deletedCount;
      }
    }
  }
  return result;
}

module.exports = { purgeUserData };
