"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Logo and stamp uploads for issuing entities.
 *
 * The bucket is public because a letterhead logo is printed on documents that
 * go to buyers and customs — there is nothing to protect — and because
 * react-pdf has to fetch it with no session when a document renders on the
 * server. Writes are still team-only; see the storage policies in
 * …_issuing_entities.sql.
 *
 * Images only. This is not a general upload path: the file lands in a public
 * bucket and is embedded in documents, so anything that is not a picture has
 * no business here.
 */

const BUCKET = "entity-assets";
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];
/** A letterhead logo is a small mark, not a photograph. */
const MAX_SIZE_BYTES = 2 * 1024 * 1024;

function extensionFor(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

/** Uploads one image and returns its public URL, ready to store on the entity. */
export async function uploadEntityAsset(file: File): Promise<string> {
  if (!ALLOWED.includes(file.type)) {
    throw new Error("Use a PNG, JPEG or WebP image.");
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error("That image is over 2 MB — a letterhead logo should be far smaller.");
  }

  const supabase = createClient();
  // Random name, not the user's: the bucket is public, so a predictable path
  // would let anyone guess at other entities' assets, and two uploads called
  // "logo.png" must not collide.
  const path = `${crypto.randomUUID()}.${extensionFor(file.type)}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Upload succeeded but no public URL came back.");
  return data.publicUrl;
}
