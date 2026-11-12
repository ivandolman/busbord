import type { Readable } from "node:stream";
import yauzl from "yauzl";

export interface GtfsArchive {
  has(name: string): boolean;
  /** Opens a table as a stream. Entries are never written to disk, so archive paths cannot escape. */
  open(name: string): Promise<Readable>;
  close(): void;
}

export function openGtfsArchive(zipPath: string): Promise<GtfsArchive> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError ?? new Error(`Could not open ${zipPath}`));
        return;
      }
      const entries = new Map<string, yauzl.Entry>();
      zipFile.on("entry", (entry: yauzl.Entry) => {
        entries.set(entry.fileName, entry);
        zipFile.readEntry();
      });
      zipFile.on("error", reject);
      zipFile.on("end", () => {
        resolve({
          has: (name) => entries.has(name),
          open: (name) =>
            new Promise<Readable>((resolveStream, rejectStream) => {
              const entry = entries.get(name);
              if (!entry) {
                rejectStream(new Error(`${name} is missing from the GTFS archive`));
                return;
              }
              zipFile.openReadStream(entry, (streamError, stream) => {
                if (streamError || !stream) {
                  rejectStream(streamError ?? new Error(`Could not read ${name}`));
                } else {
                  resolveStream(stream);
                }
              });
            }),
          close: () => zipFile.close(),
        });
      });
      zipFile.readEntry();
    });
  });
}
