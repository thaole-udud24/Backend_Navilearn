// Mongoose plugin: adds deletedAt and excludes soft-deleted docs from default finds.
function softDeletePlugin(schema) {
  schema.add({ deletedAt: { type: Date, default: null } });

  function excludeDeleted() {
    if (this.getFilter().deletedAt === undefined) {
      this.where({ deletedAt: null });
    }
  }

  schema.pre(/^find/, excludeDeleted);

  schema.methods.softDelete = function softDelete() {
    this.deletedAt = new Date();
    return this.save();
  };
}

module.exports = softDeletePlugin;
