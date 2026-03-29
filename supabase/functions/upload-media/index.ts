import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUCKET = "media-templates";
const MAX_SIZE = 25 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  audio: ["audio/mpeg", "audio/ogg", "audio/mp4", "audio/wav", "audio/webm"],
  video: ["video/mp4", "video/webm"],
  document: [
    "application/pdf", "application/msword",
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
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/wav": "wav", "audio/webm": "webm",
    "video/mp4": "mp4", "video/webm": "webm",
    "application/pdf": "pdf", "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  };
  return map[mime] || "bin";
}

// ── S3v4 Signing (minimal implementation for MinIO) ──

async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function toAmzDate(d: Date): { amzDate: string; dateStamp: string } {
  const iso = d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Promise<Uint8Array> {
  let kDate = await hmacSha256(new TextEncoder().encode("AWS4" + key), dateStamp);
  let kRegion = await hmacSha256(kDate, region);
  let kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

async function signS3Request(
  method: string,
  endpoint: string,
  path: string,
  accessKey: string,
  secretKey: string,
  body: Uint8Array,
  contentType?: string,
  queryString = ""
): Promise<SignedRequest> {
  const region = "us-east-1";
  const service = "s3";
  const now = new Date();
  const { amzDate, dateStamp } = toAmzDate(now);
  
  const url = new URL(endpoint);
  const host = url.host;
  
  const payloadHash = await sha256Hex(body);
  
  const headers: Record<string, string> = {
    "host": host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
  };
  if (contentType) headers["content-type"] = contentType;
  
  // Canonical request
  const signedHeaderKeys = Object.keys(headers).sort();
  const signedHeaders = signedHeaderKeys.join(";");
  const canonicalHeaders = signedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join("");
  
  const canonicalRequest = [
    method,
    path,
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  
  const canonicalRequestHash = await sha256Hex(new TextEncoder().encode(canonicalRequest));
  
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join("\n");
  
  const signingKey = await getSignatureKey(secretKey, dateStamp, region, service);
  const signatureBytes = await hmacSha256(signingKey, stringToSign);
  const signature = [...signatureBytes].map(b => b.toString(16).padStart(2, "0")).join("");
  
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  const fullUrl = `${endpoint}${path}${queryString ? "?" + queryString : ""}`;
  
  return {
    url: fullUrl,
    headers: {
      ...headers,
      "Authorization": authorization,
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const minioUrl = Deno.env.get("MINIO_SERVER_URL")?.replace(/\/$/, "");
    const accessKey = Deno.env.get("MINIO_ROOT_USER");
    const secretKey = Deno.env.get("MINIO_ROOT_PASSWORD");

    if (!minioUrl || !accessKey || !secretKey) {
      return new Response(
        JSON.stringify({ error: "MinIO credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("MinIO endpoint:", minioUrl);
    console.log("Access key length:", accessKey.length, "Secret key length:", secretKey.length);

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
        JSON.stringify({ error: "File too large (max 25MB)" }),
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

    // 1. Create bucket (ignore if exists)
    try {
      const createBucketReq = await signS3Request(
        "PUT", minioUrl, `/${BUCKET}`, accessKey, secretKey, new Uint8Array(0)
      );
      const cbRes = await fetch(createBucketReq.url, {
        method: "PUT",
        headers: createBucketReq.headers,
      });
      const cbText = await cbRes.text();
      console.log("Create bucket status:", cbRes.status, cbText.slice(0, 200));
    } catch (e) {
      console.log("Create bucket error (may already exist):", e.message);
    }

    // 2. Set public policy
    try {
      const policy = JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Principal: { AWS: ["*"] },
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${BUCKET}/*`],
        }],
      });
      const policyBytes = new TextEncoder().encode(policy);
      const policyReq = await signS3Request(
        "PUT", minioUrl, `/${BUCKET}`, accessKey, secretKey, policyBytes, "application/json", "policy"
      );
      const pRes = await fetch(policyReq.url, {
        method: "PUT",
        headers: policyReq.headers,
        body: policyBytes,
      });
      await pRes.text();
    } catch {
      // policy may already be set
    }

    // 3. Upload file
    const uploadReq = await signS3Request(
      "PUT", minioUrl, `/${BUCKET}/${objectKey}`, accessKey, secretKey, fileBytes, file.type
    );
    
    const uploadRes = await fetch(uploadReq.url, {
      method: "PUT",
      headers: uploadReq.headers,
      body: fileBytes,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error("MinIO upload failed:", uploadRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Upload to MinIO failed", detail: errText.slice(0, 500) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await uploadRes.text();

    const publicUrl = `${minioUrl}/${BUCKET}/${objectKey}`;
    console.log("Upload successful:", publicUrl);

    return new Response(
      JSON.stringify({ url: publicUrl, key: objectKey, type: file.type, size: file.size }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("upload-media error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
