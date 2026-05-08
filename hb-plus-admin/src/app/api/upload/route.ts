import { NextResponse } from 'next/server';
import { BlobServiceClient } from '@azure/storage-blob';

const accountName = "hbplusstorage";
const containerName = "hb-playground";
const sasToken = "sv=2019-12-12&ss=bt&srt=sco&sp=rdwaup&se=2027-01-01T00%3A00%3A00Z&spr=https&sig=I%2Fr6ukvInxcGfSJvRegM%2FFF04elIYXV9qskCFT6LrFQ%3D";
const endpoint = `https://${accountName}.blob.core.windows.net`;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folder = formData.get('folder') as string || 'proofs';

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
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
