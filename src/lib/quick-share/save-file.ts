/**
 * Save helpers for PDF blobs.
 *
 * On Chrome/Edge desktop: prompts for save location via File System Access API
 * and resolves only after the file is written.
 *
 * On unsupported browsers (Safari/Firefox/iOS): falls back to the classic
 * a[download] anchor click, which writes to the user's default Downloads folder.
 */

export function supportsSaveFilePicker(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

export interface SavePickerType {
  description: string;
  accept: Record<string, string[]>;
}

/** Infer the picker type from the suggested filename extension. Defaults to PDF. */
function inferPickerType(suggestedName: string): SavePickerType {
  const lower = suggestedName.toLowerCase();
  if (lower.endsWith(".json")) return { description: "JSON File", accept: { "application/json": [".json"] } };
  if (lower.endsWith(".csv")) return { description: "CSV File", accept: { "text/csv": [".csv"] } };
  if (lower.endsWith(".txt")) return { description: "Text File", accept: { "text/plain": [".txt"] } };
  return { description: "PDF Document", accept: { "application/pdf": [".pdf"] } };
}

/**
 * Prompt the user to pick a save location, then write the blob there.
 * Resolves to "saved" on success, "cancelled" if the user aborts the picker.
 * Re-throws non-abort errors (permission denied, quota, disk full, etc.).
 *
 * The file type is inferred from the extension of `suggestedName` unless
 * `fileType` is passed explicitly.
 */
export async function saveBlobWithPicker(
  blob: Blob,
  suggestedName: string,
  fileType?: SavePickerType
): Promise<"saved" | "cancelled"> {
  if (typeof window === "undefined" || !window.showSaveFilePicker) {
    throw new Error("File System Access API not available");
  }

  let handle: FileSystemFileHandle;
  try {
    handle = await window.showSaveFilePicker({
      suggestedName,
      types: [fileType ?? inferPickerType(suggestedName)],
    });
  } catch (err) {
    // AbortError fires when the user cancels the native picker.
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    // Some browsers surface this as a plain Error with a matching name.
    if (err instanceof Error && (err.name === "AbortError" || /abort/i.test(err.message))) return "cancelled";
    throw err;
  }

  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
  return "saved";
}

/** Classic fallback: uses an invisible anchor + object URL. No save-location prompt. */
export async function saveBlobWithDownload(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    // Revoke on the next tick so the browser has time to consume the URL
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
