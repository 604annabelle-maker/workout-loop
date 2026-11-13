import { readFile } from "node:fs/promises";
import { pictureFile } from "@/lib/picture-library";

/**
 * The exercise pictures, over https.
 *
 * The dynamic email can only show pictures it loads from a web address (the
 * plain version carries them as attachments instead). Gmail fetches these
 * through its own image servers, so her phone never opens a link. They never
 * change, so they are cached for a year.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ source: string; file: string }> }) {
  const { source, file } = await params;
  // Drawings for v1 emails, photos for v2's How to.
  const where = source === "d" || source === "p" ? pictureFile(source, file) : null;
  if (!where) return new Response("Not found", { status: 404 });

  try {
    const body = await readFile(where);
    return new Response(new Uint8Array(body), {
      headers: {
        "content-type": file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
