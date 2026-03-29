import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { S3Client, PutObjectCommand, CreateBucketCommand } from "npm:@aws-sdk/client-s3@3.540.0";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const minioUrl = Deno.env.get("MINIO_SERVER_URL");
    const accessKey = Deno.env.get("MINIO_ROOT_USER");
    const secretKey = Deno.env.get("MINIO_ROOT_PASSWORD");

    if (!minioUrl || !accessKey || !secretKey) {
      console.error("Missing MinIO env vars:", { hasUrl: !!minioUrl, hasKey: !!accessKey, hasSecret: !!secretKey });
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

    // Create S3 client for MinIO
    const s3 = new S3Client({
      endpoint: minioUrl,
      region: "us-east-1",
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle: true, // Required for MinIO
    });

    // Ensure bucket exists
    try {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
      console.log("Bucket created:", BUCKET);
    } catch (e: any) {
      if (e.name !== "BucketAlreadyOwnedByYou" && e.name !== "BucketAlreadyExists" && e.Code !== "BucketAlreadyOwnedByYou") {
        console.log("Bucket create response (may already exist):", e.name || e.Code);
      }
    }

    // Set public read policy via MinIO API directly
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
      // Use raw fetch for policy since SDK doesn't have a simple method
      const policyUrl = `${minioUrl}/${BUCKET}?policy`;
      await fetch(policyUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: policy,
      });
    } catch {
      // Policy may fail without auth but bucket might already be public
    }

    // Upload file
    const fileBytes = new Uint8Array(await file.arrayBuffer());

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
      Body: fileBytes,
      ContentType: file.type,
      ACL: "public-read",
    }));

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
