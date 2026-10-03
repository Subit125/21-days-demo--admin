import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { TableClient, AzureSASCredential } from '@azure/data-tables';
import { createZipStream, type ZipEntry } from '@/lib/zipStream';

/**
 * Proof-photo export. Staff pick a batch and get its photos as one zip, foldered
 * by member, instead of opening a thousand submissions one at a time.
 *
 * The storage key stays on the server: the browser receives the archive, never a
 * SAS token. Blobs are fetched one at a time and streamed straight out, so the
 * function holds one photo in memory rather than the whole export.
 */

export const runtime = 'nodejs';
// A whole batch runs to hundreds of MB. Hosts cap this lower on some plans; the UI
// offers per-member exports for when the full batch cannot finish in time.
export const maxDuration = 300;

const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME || 'hbplusstorage';
const sasToken = process.env.AZURE_STORAGE_SAS_TOKEN || '';
const endpoint = `https://${accountName}.table.core.windows.net`;

const table = (name: string) =>
  new TableClient(endpoint, name, new AzureSASCredential(sasToken));

async function readTable(name: string): Promise<any[]> {
  const out: any[] = [];
  for await (const entity of table(name).listEntities()) out.push(entity);
  return out;
}

async function requireAdmin() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get('hb_admin_session');
  if (!cookie) return null;
  try {
    const session = JSON.parse(Buffer.from(cookie.value, 'base64').toString());
    if (!session?.email || session.exp < Date.now()) return null;
    return session as { email: string };
  } catch {
    return null;
  }
}

/** Keeps names usable on Windows, macOS and Linux alike. */
const safe = (value: unknown, fallback = 'unknown') =>
  String(value ?? '')
    .replace(/[\/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || fallback;

interface Photo {
  userId: string;
  memberName: string;
  path: string;
  url: string;
  date?: Date;
}

/**
 * Submissions carry no batch of their own — a member who moved cohorts keeps every
 * row they ever wrote. The task or flashcard behind the row is what places it, which
 * is how the rest of the admin app scopes a batch too.
 */
async function collectPhotos(batchId: string, memberId?: string): Promise<Photo[]> {
  const [profiles, submissions, tasks, cards] = await Promise.all([
    readTable('Profiles'),
    readTable('Submissions'),
    readTable('Tasks'),
    readTable('Flashcards'),
  ]);

  const members = new Map<string, any>();
  for (const p of profiles) {
    if (p.batch_id !== batchId) continue;
    const id = p.rowKey || p.RowKey;
    if (!memberId || id === memberId) members.set(id, p);
  }

  const taskById = new Map(tasks.map((t: any) => [t.rowKey || t.RowKey, t]));
  const cardById = new Map(cards.map((c: any) => [c.rowKey || c.RowKey, c]));

  const photos: Photo[] = [];
  const used = new Set<string>();

  for (const sub of submissions) {
    const member = members.get(sub.user_id);
    if (!member) continue;

    const meta = sub.task_id ? taskById.get(sub.task_id) : cardById.get(sub.flashcard_id);
    if (!meta || (meta.batch_id || meta.BatchId) !== batchId) continue;

    const fileUrl = typeof sub.file_url === 'string' ? sub.file_url : '';
    if (!fileUrl.includes('blob.core.windows.net')) continue;

    const base = fileUrl.split('?')[0];
    const day = meta.day != null ? `day-${String(meta.day).padStart(2, '0')}` : 'day-xx';
    const title = safe(meta.title || meta.name || meta.question, sub.task_id ? 'task' : 'flashcard');
    const when = String(sub.submitted_at || sub.created_at || '').slice(0, 10) || 'nodate';
    const ext = (base.match(/\.(png|jpe?g|webp|gif|heic)$/i) || ['.jpg'])[0];
    const folder = safe(member.name || member.email, sub.user_id);

    let path = `${folder}/${day}_${title}_${when}${ext}`;
    // One task can produce the same name twice (a retry re-submitted the same day).
    // Duplicate names inside a zip extract unpredictably, so number the repeats.
    for (let n = 2; used.has(path); n++) {
      path = `${folder}/${day}_${title}_${when}_${n}${ext}`;
    }
    used.add(path);

    const submitted = new Date(sub.submitted_at || sub.created_at || Date.now());
    photos.push({
      userId: sub.user_id,
      memberName: member.name || member.email || sub.user_id,
      path,
      url: `${base}?${sasToken}`,
      date: isNaN(submitted.getTime()) ? undefined : submitted,
    });
  }

  return photos.sort((a, b) => a.path.localeCompare(b.path));
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  if (!sasToken) {
    return NextResponse.json({ error: 'Storage credentials are not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get('batch');
  const memberId = searchParams.get('member') || undefined;
  const mode = searchParams.get('mode') || 'zip';

  if (!batchId) {
    return NextResponse.json({ error: 'batch is required' }, { status: 400 });
  }

  let photos: Photo[];
  try {
    photos = await collectPhotos(batchId, memberId);
  } catch (error: any) {
    console.error('[photos] lookup failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The panel asks for this first, so it can show counts before anyone waits on a
  // download — and so a batch with no photos says so instead of sending an empty zip.
  if (mode === 'summary') {
    const perMember = new Map<string, { userId: string; name: string; photos: number }>();
    for (const p of photos) {
      const row = perMember.get(p.userId) || { userId: p.userId, name: p.memberName, photos: 0 };
      row.photos++;
      perMember.set(p.userId, row);
    }
    return NextResponse.json({
      batch: batchId,
      total: photos.length,
      members: [...perMember.values()].sort((a, b) => b.photos - a.photos),
    });
  }

  if (photos.length === 0) {
    return NextResponse.json({ error: 'No photos found for this selection' }, { status: 404 });
  }

  const skipped: string[] = [];
  const entries: ZipEntry[] = photos.map((photo) => ({
    name: photo.path,
    date: photo.date,
    data: async () => {
      // Storage drops the odd connection on an export of this size. One attempt
      // per photo meant a blip silently cost a file, so retry before giving up.
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await fetch(photo.url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return new Uint8Array(await response.arrayBuffer());
        } catch (error) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
      }
      throw lastError;
    },
  }));

  // Last entry, so by the time it is written every other photo has been tried.
  // An admin should not have to count files to find out something is missing.
  entries.push({
    name: '_missing-photos.txt',
    deferred: true,
    data: async () =>
      new TextEncoder().encode(
        skipped.length
          ? `These ${skipped.length} photo(s) could not be downloaded from storage.\n` +
            `Try exporting the member again; the rest of this archive is complete.\n\n` +
            skipped.join('\n') + '\n'
          : 'All photos in this batch downloaded successfully.\n',
      ),
  });

  const stream = createZipStream(entries, (name, error) => {
    skipped.push(name);
    console.error(`[photos] skipped ${name}:`, error);
  });

  const label = memberId
    ? `${batchId}_${safe(photos[0].memberName)}`
    : `${batchId}_all`;

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${label}_photos.zip"`,
      'Cache-Control': 'no-store',
      'X-Photo-Count': String(photos.length),
    },
  });
}
