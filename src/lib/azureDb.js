// Common Table Names
export const TABLES = {
  PROFILES: "Profiles",
  TASKS: "Tasks",
  SUBMISSIONS: "Submissions",
  CLANS: "Clans",
  FLASHCARDS: "Flashcards",
  MANUAL_AWARDS: "ManualAwards",
  BATCHES: "Batches"
};

/**
 * Fetch all entities from a table via API proxy to avoid CORS
 */
export const getAllEntities = async (tableName) => {
  try {
    const response = await fetch(`/api/azure?table=${tableName}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch entities');
    }
    return await response.json();
  } catch (err) {
    console.error(`[AzureDB] Error fetching ${tableName}:`, err);
    throw err;
  }
};

/**
 * Upsert an entity (Create or Update) via API proxy
 * @param {string} tableName 
 * @param {object} entity Must have partitionKey and rowKey
 */
export const upsertEntity = async (tableName, entity) => {
  try {
    const response = await fetch('/api/azure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: tableName, entity })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to upsert entity');
    }
    return await response.json();
  } catch (err) {
    console.error(`[AzureDB] Error upserting to ${tableName}:`, err);
    throw err;
  }
};

/**
 * Delete an entity by partitionKey + rowKey
 */
export const deleteEntity = async (tableName, partitionKey, rowKey) => {
  try {
    const url = `/api/azure?table=${encodeURIComponent(tableName)}&partitionKey=${encodeURIComponent(partitionKey)}&rowKey=${encodeURIComponent(rowKey)}`;
    const response = await fetch(url, { method: 'DELETE' });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete entity');
    }
    return await response.json();
  } catch (err) {
    console.error(`[AzureDB] Error deleting from ${tableName}:`, err);
    throw err;
  }
};
