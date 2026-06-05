/**
 * Uploads a file to Azure Blob Storage via API proxy to avoid CORS
 * @param {File} file 
 * @param {string} folder 
 * @returns {Promise<string>} The URL of the uploaded file
 */
export const uploadToAzure = async (file, folder = 'proofs') => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    const data = await response.json();
    return data.url;
  } catch (err) {
    console.error('[AzureClient] Upload error:', err);
    throw err;
  }
};
