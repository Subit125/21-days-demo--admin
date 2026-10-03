/**
 * Minimal streaming ZIP writer (store method, no compression).
 *
 * Photos are already JPEG/PNG, so deflating them buys a percent or two for a lot
 * of CPU on a serverless function — storing them keeps the export fast and the
 * memory flat: one photo is held at a time, never the whole archive.
 *
 * Built in rather than pulled from npm because the admin app has no archiver
 * dependency and an export route is not worth one. Scope is deliberately small:
 * no compression, no encryption, no zip64. Archives past 4GB are refused with a
 * clear error instead of being written corrupt (see MAX_TOTAL).
 */

const MAX_TOTAL = 0xffffffff; // zip32 ceiling for offsets and sizes

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time, the only timestamp a basic zip entry carries. */
function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2)),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export interface ZipEntry {
  /** Path inside the archive, e.g. "Sanjeeta Mohta/day-01_Morning Read.jpg". */
  name: string;
  /** Resolves to the file's bytes. Called one at a time, in order. */
  data: () => Promise<Uint8Array>;
  /** Shown as the file's timestamp; defaults to now. */
  date?: Date;
  /**
   * Never fetched ahead of its turn. For an entry whose contents summarise the
   * ones before it — a report of what failed, say — which would otherwise be
   * built while earlier entries were still in flight.
   */
  deferred?: boolean;
}

/**
 * Streams the entries as a ZIP archive.
 *
 * `onError` is called when a single entry cannot be fetched: that entry is left
 * out and the rest of the archive still downloads, because losing one photo
 * should not cost an admin the other thousand.
 *
 * `prefetch` fetches that many entries ahead of the one being written. Entries
 * are written in order regardless — the lookahead only overlaps the network
 * waits, which is the whole cost of an export of a thousand small files. Memory
 * stays bounded at roughly `prefetch` photos.
 */
export function createZipStream(
  entries: ZipEntry[],
  onError?: (name: string, error: unknown) => void,
  prefetch = 6,
): ReadableStream<Uint8Array> {
  type Central = {
    name: Uint8Array; crc: number; size: number; offset: number; time: number; date: number;
  };

  const central: Central[] = [];
  let offset = 0;
  let index = 0;

  const u8 = (n: number) => n >>> 0;

  const localHeader = (name: Uint8Array, crc: number, size: number, time: number, date: number) => {
    const buf = new Uint8Array(30 + name.length);
    const view = new DataView(buf.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);      // version needed
    view.setUint16(6, 0x0800, true);  // UTF-8 names
    view.setUint16(8, 0, true);       // stored
    view.setUint16(10, time, true);
    view.setUint16(12, date, true);
    view.setUint32(14, u8(crc), true);
    view.setUint32(18, u8(size), true);
    view.setUint32(22, u8(size), true);
    view.setUint16(26, name.length, true);
    view.setUint16(28, 0, true);
    buf.set(name, 30);
    return buf;
  };

  const centralDirectory = () => {
    let size = 0;
    for (const e of central) size += 46 + e.name.length;
    const buf = new Uint8Array(size + 22);
    const view = new DataView(buf.buffer);
    let p = 0;
    for (const e of central) {
      view.setUint32(p, 0x02014b50, true);
      view.setUint16(p + 4, 20, true);      // version made by
      view.setUint16(p + 6, 20, true);      // version needed
      view.setUint16(p + 8, 0x0800, true);
      view.setUint16(p + 10, 0, true);
      view.setUint16(p + 12, e.time, true);
      view.setUint16(p + 14, e.date, true);
      view.setUint32(p + 16, u8(e.crc), true);
      view.setUint32(p + 20, u8(e.size), true);
      view.setUint32(p + 24, u8(e.size), true);
      view.setUint16(p + 28, e.name.length, true);
      view.setUint16(p + 30, 0, true);      // extra
      view.setUint16(p + 32, 0, true);      // comment
      view.setUint16(p + 34, 0, true);      // disk
      view.setUint16(p + 36, 0, true);      // internal attrs
      view.setUint32(p + 38, 0, true);      // external attrs
      view.setUint32(p + 42, u8(e.offset), true);
      buf.set(e.name, p + 46);
      p += 46 + e.name.length;
    }
    view.setUint32(p, 0x06054b50, true);
    view.setUint16(p + 4, 0, true);
    view.setUint16(p + 6, 0, true);
    view.setUint16(p + 8, central.length, true);
    view.setUint16(p + 10, central.length, true);
    view.setUint32(p + 12, u8(size), true);
    view.setUint32(p + 16, u8(offset), true);
    view.setUint16(p + 20, 0, true);
    return buf;
  };

  // Fetches already in flight, keyed by entry index. A rejected promise is held
  // here like any other and surfaces when that entry's turn comes, so a failure
  // is reported against the right file.
  const inFlight = new Map<number, Promise<Uint8Array>>();

  const start = (i: number, force = false) => {
    if (i >= entries.length || inFlight.has(i)) return;
    if (entries[i].deferred && !force) return;
    const p = (async () => entries[i].data())();
    p.catch(() => {}); // handled at consumption; this only stops an unhandled rejection
    inFlight.set(i, p);
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      // One entry written per pull; the rest of the window is fetching meanwhile.
      while (index < entries.length) {
        for (let i = index; i < Math.min(index + prefetch, entries.length); i++) start(i);

        const current = index++;
        const entry = entries[current];
        start(current, true); // a deferred entry begins only now, with everything before it done
        let bytes: Uint8Array;
        try {
          bytes = await inFlight.get(current)!;
        } catch (err) {
          onError?.(entry.name, err);
          continue;
        } finally {
          inFlight.delete(current);
        }

        if (offset + bytes.length + 30 + entry.name.length > MAX_TOTAL) {
          controller.error(new Error(
            'Export is larger than 4GB, which this archive format cannot hold. ' +
            'Download the batch member by member instead.',
          ));
          return;
        }

        const name = new TextEncoder().encode(entry.name);
        const { time, date } = dosDateTime(entry.date ?? new Date());
        const crc = crc32(bytes);

        controller.enqueue(localHeader(name, crc, bytes.length, time, date));
        controller.enqueue(bytes);
        central.push({ name, crc, size: bytes.length, offset, time, date });
        offset += 30 + name.length + bytes.length;
        return; // yield to the consumer; next pull takes the next entry
      }

      controller.enqueue(centralDirectory());
      controller.close();
    },
  });
}
