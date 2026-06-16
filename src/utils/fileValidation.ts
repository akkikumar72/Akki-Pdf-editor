export const MAX_PDF_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export type FileValidation = { ok: true } | { ok: false; reason: string };

function formatMb(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

async function readHeader(file: File, length: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, length).arrayBuffer());
}

function startsWith(header: Uint8Array, signature: number[]): boolean {
  if (header.length < signature.length) return false;
  return signature.every((byte, index) => header[index] === byte);
}

/**
 * Validate an imported PDF by size and `%PDF-` magic bytes before it is parsed,
 * preventing spoofed-MIME or oversized files from freezing the tab.
 */
export async function validatePdfFile(file: File): Promise<FileValidation> {
  if (file.size === 0) return { ok: false, reason: "That file is empty." };
  if (file.size > MAX_PDF_BYTES) {
    return { ok: false, reason: `PDF is ${formatMb(file.size)}; the limit is ${formatMb(MAX_PDF_BYTES)}.` };
  }
  const header = await readHeader(file, 5);
  // "%PDF-"
  if (!startsWith(header, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { ok: false, reason: "That file is not a valid PDF." };
  }
  return { ok: true };
}

/**
 * Validate an imported raster image by size and PNG/JPEG magic bytes before it
 * is read into a data URL and persisted.
 */
export async function validateImageFile(file: File): Promise<FileValidation> {
  if (file.size === 0) return { ok: false, reason: "That image is empty." };
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, reason: `Image is ${formatMb(file.size)}; the limit is ${formatMb(MAX_IMAGE_BYTES)}.` };
  }
  const header = await readHeader(file, 8);
  const isPng = startsWith(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const isJpeg = startsWith(header, [0xff, 0xd8, 0xff]);
  if (!isPng && !isJpeg) {
    return { ok: false, reason: "Only PNG or JPEG images are supported." };
  }
  return { ok: true };
}
