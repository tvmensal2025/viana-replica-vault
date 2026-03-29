import { supabase } from "@/integrations/supabase/client";

export interface UploadResult {
  url: string;
  key: string;
  type: string;
  size: number;
}

/**
 * Upload a file to MinIO via the upload-media edge function.
 * Returns the public URL of the uploaded file.
 */
export async function uploadMedia(
  file: File,
  onProgress?: (pct: number) => void
): Promise<UploadResult> {
  // Signal start
  onProgress?.(5);

  const formData = new FormData();
  formData.append("file", file);

  onProgress?.(15);

  const { data: { session } } = await supabase.auth.getSession();

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/upload-media`;

  onProgress?.(25);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: formData,
  });

  onProgress?.(85);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(err.error || "Upload failed");
  }

  const result: UploadResult = await res.json();

  onProgress?.(100);

  return result;
}

/**
 * Get a user-friendly accept string for a file input based on media type.
 */
export function getAcceptString(mediaType: string): string {
  switch (mediaType) {
    case "image":
      return "image/jpeg,image/png,image/webp,image/gif";
    case "audio":
      return "audio/mpeg,audio/ogg,audio/mp4,audio/wav,audio/webm";
    case "video":
      return "video/mp4,video/webm";
    case "document":
      return "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return "*/*";
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
