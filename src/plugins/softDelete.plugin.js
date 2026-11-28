// Mongoose plugin: adds deletedAt and excludes soft-deleted docs from default finds.
function softDeletePlugin(schema) {
  schema.add({ deletedAt: { type: Date, default: null } });

  function excludeDeleted() {
    if (this.getFilter().deletedAt === undefined) {
      this.where({ deletedAt: null });
    }
  }

  // /^find/ alone misses 'countDocuments' (and 'count'), which don't start with "find" —
  // that let a stale pagination total count soft-deleted docs that `find` already excludes.
  schema.pre(['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'countDocuments', 'count'], excludeDeleted);

  schema.methods.softDelete = function softDelete() {
    this.deletedAt = new Date();
    return this.save();
  };
}

module.exports = softDeletePlugin;
