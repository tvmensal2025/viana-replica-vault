import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AwsClient } from "https://deno.land/x/aws_fetch@v0.3.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUCKET = "media-templates";
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const minioUrl = Deno.env.get("MINIO_SERVER_URL");
    const accessKey = Deno.env.get("MINIO_ROOT_USER");
    const secretKey = Deno.env.get("MINIO_ROOT_PASSWORD");

    if (!minioUrl || !accessKey || !secretKey) {
      return new Response(
        JSON.stringify({ error: "MinIO credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse multipart form data
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
    const uuid = crypto.randomUUID();
    const objectKey = `${uuid}-${Date.now()}.${ext}`;

    const aws = new AwsClient({
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      service: "s3",
      region: "us-east-1",
    });

    const fileBytes = new Uint8Array(await file.arrayBuffer());

    // Ensure bucket exists (ignore error if already exists)
    try {
      await aws.fetch(`${minioUrl}/${BUCKET}`, { method: "PUT" });
    } catch {
      // bucket may already exist
    }

    // Set bucket policy to public read
    const policy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: ["*"] },
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${BUCKET}/*`],
        },
      ],
    });

    try {
      await aws.fetch(`${minioUrl}/${BUCKET}?policy`, {
        method: "PUT",
        body: policy,
      });
    } catch {
      // policy may already be set
    }

    // Upload file
    const uploadUrl = `${minioUrl}/${BUCKET}/${objectKey}`;
    const uploadRes = await aws.fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: fileBytes,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error("MinIO upload failed:", errText);
      return new Response(
        JSON.stringify({ error: "Upload to MinIO failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const publicUrl = `${minioUrl}/${BUCKET}/${objectKey}`;

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
