const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const env = require('../config/env');

function isConfigured() {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
  );
}

/**
 * Uploads a local image file to Cloudinary using signed REST API (no extra npm dependency).
 * Returns the HTTPS `secure_url` on success and deletes the temp local file; returns `null`
 * if Cloudinary is not configured or the upload fails so callers can safely fall back to local disk.
 */
async function uploadImageFile(localFilePath, folder = 'navilearn', mimeType = 'image/jpeg') {
  if (!isConfigured() || !localFilePath || env.NODE_ENV === 'test') return null;

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = `folder=${folder}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`;
    const signature = crypto.createHash('sha1').update(paramsToSign).digest('hex');

    const buffer = await fs.promises.readFile(localFilePath);
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType }), path.basename(localFilePath));
    form.append('api_key', env.CLOUDINARY_API_KEY);
    form.append('timestamp', String(timestamp));
    form.append('folder', folder);
    form.append('signature', signature);

    const url = `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`;
    const res = await fetch(url, { method: 'POST', body: form });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.secure_url) return null;

    fs.promises.unlink(localFilePath).catch(() => {});
    return json.secure_url;
  } catch {
    return null;
  }
}

module.exports = { isConfigured, uploadImageFile };
