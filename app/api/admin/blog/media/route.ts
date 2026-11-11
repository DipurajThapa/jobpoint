import { env } from "cloudflare:workers";
import { blogAdmin } from "@/lib/blog/store";
import { readLimitedForm } from "@/lib/intake-security";
import { PortalError } from "@/lib/portal/db";
import { imageSize } from "image-size";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const actor = await blogAdmin(request, true); if (actor instanceof Response) return actor;
  try {
    const form = await readLimitedForm(request, 20 * 1024 * 1024 + 20_000), file = form.get("file");
    const description = String(form.get("description") || "").trim().slice(0, 600);
    if (!(file instanceof File) || !file.size || !description) throw new PortalError("MEDIA", "Select a file and describe the image or video.");
    const bytes = new Uint8Array(await file.arrayBuffer()); let mime = "", width = 0, height = 0;
    // Recognise image containers before parsing; SVG/HTML/unknown files are rejected.
    const sig = (at: number, size: number) => new TextDecoder().decode(bytes.slice(at, at + size));
    if ((bytes[0] === 0xff && bytes[1] === 0xd8) || sig(1, 3) === "PNG" || (sig(0, 4) === "RIFF" && sig(8, 4) === "WEBP")) {
      if (bytes.length > 8 * 1024 * 1024) throw new PortalError("SIZE", "Images must be 8 MB or smaller.", 413);
      const size = imageSize(bytes); width = size.width; height = size.height; mime = size.type === "jpg" ? "image/jpeg" : `image/${size.type}`;
    } else if (sig(4, 4) === "ftyp" && /^(isom|iso2|mp41|mp42|avc1|M4V |MSNV)/.test(sig(8, 4))) mime = "video/mp4";
    else if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3 && sig(0, Math.min(bytes.length, 256)).includes("webm")) mime = "video/webm";
    if (!mime) throw new PortalError("FORMAT", "Use a JPEG, PNG, WebP, MP4 or WebM file.");
    // The browser reads video dimensions from metadata before upload. No executable markup is accepted.
    if (mime.startsWith("video/")) { width = Number(form.get("width")); height = Number(form.get("height")); }
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 10000 || height > 10000) throw new PortalError("DIMENSIONS", "The media dimensions could not be read.");
    if (form.get("banner") === "yes" && (width !== 1920 || height !== 1080)) throw new PortalError("BANNER", "Banner files must be 1920 × 1080 pixels.");
    const id = crypto.randomUUID(), key = `blog-media/${id}`;
    await env.BUCKET!.put(key, bytes, { httpMetadata: { contentType: mime } });
    try { await env.DB!.prepare("INSERT INTO blog_assets (id, r2_key, mime, size, width, height, description, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, key, mime, bytes.length, width, height, description, new Date().toISOString(), actor).run(); }
    catch (e) { await env.BUCKET!.delete(key); throw e; }
    return Response.json({ src: `/api/blog/media/${id}`, kind: mime.startsWith("video/") ? "video" : "image", width, height, description }, { status: 201 });
  } catch (e) { return Response.json({ error: e instanceof PortalError ? e.message : "The file could not be uploaded or read." }, { status: e instanceof PortalError ? e.status : 400 }); }
}
