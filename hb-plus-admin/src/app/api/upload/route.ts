import { NextResponse } from 'next/server';
import { BlobServiceClient } from '@azure/storage-blob';

const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME || "hbplusstorage";
const containerName = process.env.AZURE_STORAGE_CONTAINER || "hb-playground";
const sasToken = process.env.AZURE_STORAGE_SAS_TOKEN || "";
const endpoint = `https://${accountName}.blob.core.windows.net`;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folder = formData.get('folder') as string || 'proofs';

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (!sasToken) {
      console.error('AZURE_STORAGE_SAS_TOKEN is not defined in environment variables');
      return NextResponse.json({ error: 'Storage credentials configuration error' }, { status: 500 });
    }

    const blobServiceClient = new BlobServiceClient(`${endpoint}?${sasToken}`);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    const blobName = `${folder}/${Date.now()}-${file.name}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    
    const arrayBuffer = await file.arrayBuffer();
    await blockBlobClient.uploadData(arrayBuffer, {
      blobHTTPHeaders: { blobContentType: file.type }
    });
    
    return NextResponse.json({ url: blockBlobClient.url });
  } catch (error: any) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
