const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Download an image from a URL and save it locally.
 * Returns the local path on success, or null on failure (non-throwing).
 */
async function downloadImage(url, destPath) {
  try {
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    await fs.promises.writeFile(destPath, response.data);
    return destPath;
  } catch (error) {
    console.error(`[ImageDownloader] Failed to download ${url}:`, error.message);
    return null;
  }
}

module.exports = { downloadImage };
