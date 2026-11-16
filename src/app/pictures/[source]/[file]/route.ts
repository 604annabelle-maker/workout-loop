import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The exercise drawings (Everkinetic, CC BY-SA 4.0), over https, for How to
 * in the dynamic email. Gmail fetches these through its own image servers, so
 * her phone never opens a link. They never change, so they are cached for a
 * year. next.config.ts names the directory so the deployment carries it.
 */
const DRAWINGS = path.join("assets", "exercise-drawings");

/** A plain file name in the drawings, never a path that walks out of it. */
function drawingFile(file: string): string | null {
  const name = path.basename(file);
  if (name !== file || !/^[\w.-]+\.png$/i.test(name)) return null;
  return path.join(process.cwd(), DRAWINGS, name);
}

export async function GET(_request: Request, { params }: { params: Promise<{ source: string; file: string }> }) {
  const { source, file } = await params;
  const where = source === "d" ? drawingFile(file) : null;
  if (!where) return new Response("Not found", { status: 404 });

  try {
    const body = await readFile(where);
    return new Response(new Uint8Array(body), {
      headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
