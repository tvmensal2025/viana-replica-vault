import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_SIZE = 100 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  audio: ["audio/mpeg", "audio/ogg", "audio/mp4", "audio/wav", "audio/webm"],
  video: ["video/mp4", "video/webm"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
};

function getAllowedTypes(): string[] {
  return Object.values(ALLOWED_TYPES).flat();
}

function getExtension(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  };
  return map[mime] || "bin";
}

/**
 * Generate HMAC-SHA256 signature for S3-compatible auth (AWS Signature V4 simplified).
 * We use a simpler approach: direct PUT with presigned-style or basic auth.
 * Since MinIO supports basic auth via Access-Key headers, we use that.
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const minioUrl = (Deno.env.get("MINIO_SERVER_URL") ?? "").trim().replace(/\/+$/, "");
    const accessKey = (Deno.env.get("MINIO_ROOT_USER") ?? "").trim();
    const secretKey = (Deno.env.get("MINIO_ROOT_PASSWORD") ?? "").trim();
    const BUCKET = Deno.env.get("MINIO_BUCKET") || "media-templates";

    if (!minioUrl || !accessKey || !secretKey) {
      return new Response(
        JSON.stringify({ error: "MinIO credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (file.size > MAX_SIZE) {
      return new Response(
        JSON.stringify({ error: "File too large (max 100MB)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allowed = getAllowedTypes();
    if (!allowed.includes(file.type)) {
      return new Response(
        JSON.stringify({ error: `File type not allowed: ${file.type}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ext = getExtension(file.type);
    const objectKey = `${crypto.randomUUID()}-${Date.now()}.${ext}`;
    const fileBytes = new Uint8Array(await file.arrayBuffer());

    // Use S3 PUT Object via fetch with AWS Signature V4
    const putUrl = `${minioUrl}/${BUCKET}/${objectKey}`;
    const now = new Date();
    const dateStamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const shortDate = dateStamp.substring(0, 8);
    const region = "us-east-1";
    const service = "s3";

    // AWS Signature V4
    const encoder = new TextEncoder();

    async function hmacSHA256(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
      const cryptoKey = await crypto.subtle.importKey(
        "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      return await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(msg));
    }

    async function sha256(data: Uint8Array): Promise<string> {
      const hash = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    const payloadHash = await sha256(fileBytes);

    const parsedUrl = new URL(putUrl);
    const hostHeader = parsedUrl.host;
    const canonicalUri = parsedUrl.pathname;

    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonicalHeaders =
      `content-type:${file.type}\n` +
      `host:${hostHeader}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${dateStamp}\n`;

    const canonicalRequest = [
      "PUT",
      canonicalUri,
      "", // query string
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const credentialScope = `${shortDate}/${region}/${service}/aws4_request`;
    const canonicalRequestHash = await sha256(encoder.encode(canonicalRequest));

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      dateStamp,
      credentialScope,
      canonicalRequestHash,
    ].join("\n");

    // Derive signing key
    const kDate = await hmacSHA256(encoder.encode("AWS4" + secretKey), shortDate);
    const kRegion = await hmacSHA256(kDate, region);
    const kService = await hmacSHA256(kRegion, service);
    const kSigning = await hmacSHA256(kService, "aws4_request");

    const signatureBytes = await hmacSHA256(kSigning, stringToSign);
    const signature = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    console.log("Uploading to MinIO:", putUrl);

    const res = await fetch(putUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": dateStamp,
        "Authorization": authHeader,
      },
      body: fileBytes,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("MinIO PUT error:", res.status, errBody);

      if (errBody.includes("NoSuchBucket")) {
        return new Response(
          JSON.stringify({ error: `Bucket '${BUCKET}' not found on MinIO` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (res.status === 403) {
        return new Response(
          JSON.stringify({ error: "MinIO access denied - check credentials" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `MinIO upload failed (${res.status}): ${errBody.substring(0, 200)}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const publicUrl = `${minioUrl}/${BUCKET}/${objectKey}`;

    return new Response(
      JSON.stringify({ url: publicUrl, key: objectKey, type: file.type, size: file.size }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("upload-media error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
