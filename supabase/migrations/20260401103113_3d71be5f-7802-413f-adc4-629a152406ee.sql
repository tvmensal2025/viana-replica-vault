INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  true,
  104857600,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','audio/mpeg','audio/ogg','audio/mp4','audio/wav','audio/webm','video/mp4','video/webm','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read whatsapp-media"
ON storage.objects FOR SELECT
USING (bucket_id = 'whatsapp-media');

CREATE POLICY "Service role upload whatsapp-media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'whatsapp-media');