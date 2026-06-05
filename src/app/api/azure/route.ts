import { NextResponse } from 'next/server';
import { TableClient, AzureSASCredential } from "@azure/data-tables";

const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME || "hbplusstorage";
const sasToken = process.env.AZURE_STORAGE_SAS_TOKEN || "";
const endpoint = `https://${accountName}.table.core.windows.net`;

function getClient(tableName: string) {
  if (!sasToken) throw new Error("AZURE_STORAGE_SAS_TOKEN is not defined in environment variables");
  return new TableClient(endpoint, tableName, new AzureSASCredential(sasToken));
}

function corsResponse(data: any, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function OPTIONS() {
  return corsResponse({}, 200);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get('table');

  if (!table) {
    return corsResponse({ error: 'Table name is required' }, 400);
  }

  try {
    const client = getClient(table);
    const entities = [];
    
    try {
      const iterator = client.listEntities();
      for await (const entity of iterator) {
        entities.push(entity);
      }
    } catch (tableError: any) {
      // If table doesn't exist, just return empty list instead of error
      if (tableError.statusCode === 404) {
        return corsResponse([]);
      }
      throw tableError;
    }
    
    if (table === 'Submissions') {
      const enrichedEntities = entities.map(entity => {
        if (entity.file_url && typeof entity.file_url === 'string' && !entity.file_url.includes('?')) {
          if (entity.file_url.includes('blob.core.windows.net')) {
            entity.file_url = `${entity.file_url}?${sasToken}`;
          }
        }
        return entity;
      });
      return corsResponse(enrichedEntities);
    }
    
    return corsResponse(entities);
  } catch (error: any) {
    console.error(`Error fetching table ${table}:`, error);
    return corsResponse({ error: error.message }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { table, entity } = body;

    if (!table || !entity) {
      return corsResponse({ error: 'Table and entity are required' }, 400);
    }

    const client = getClient(table);
    
    try {
      await client.upsertEntity(entity, "Merge");
    } catch (upsertError: any) {
      // If table not found, try to create it (requires SAS permissions)
      if (upsertError.statusCode === 404) {
        try {
          const { TableServiceClient } = await import("@azure/data-tables");
          const serviceClient = new TableServiceClient(endpoint, new AzureSASCredential(sasToken));
          await serviceClient.createTable(table);
          // Try upsert again after creation
          await client.upsertEntity(entity, "Merge");
        } catch (createError: any) {
          throw new Error(`Table "${table}" not found and could not be created. Please create it manually in Azure Portal. Error: ${createError.message}`);
        }
      } else {
        throw upsertError;
      }
    }
    
    return corsResponse({ success: true });
  } catch (error: any) {
    console.error('Error upserting entity:', error);
    return corsResponse({ error: error.message }, 500);
  }
}
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get('table');
  const partitionKey = searchParams.get('partitionKey');
  const rowKey = searchParams.get('rowKey');

  if (!table || !partitionKey || !rowKey) {
    return corsResponse({ error: 'table, partitionKey, and rowKey are required' }, 400);
  }

  try {
    const client = getClient(table);
    await client.deleteEntity(partitionKey, rowKey);
    return corsResponse({ success: true });
  } catch (error: any) {
    console.error(`Error deleting entity from ${table}:`, error);
    return corsResponse({ error: error.message }, 500);
  }
}
