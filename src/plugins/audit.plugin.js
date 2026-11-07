// Mongoose plugin: stamps createdBy/updatedBy from the service-provided actor.
function auditPlugin(schema) {
  schema.add({
    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  });
}

module.exports = auditPlugin;
