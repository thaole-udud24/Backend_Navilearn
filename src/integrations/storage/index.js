// [ASSUMPTION] No storage provider specified in BRD; stub returns a local path until S3/GCS is wired in.
async function saveFile(file) {
  return { path: `uploads/${file.filename}`, size: file.size };
}

module.exports = { saveFile };
