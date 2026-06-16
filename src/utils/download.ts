export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function dataUrlToBytes(dataUrl: string) {
  const [header = "", base64 = ""] = dataUrl.split(",");
  if (!/^data:/i.test(header) || !base64) {
    throw new Error("Malformed data URL: expected a base64 data: payload.");
  }
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Error("Malformed data URL: invalid base64 payload.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function safeBaseName(filename: string) {
  return filename.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "document";
}
