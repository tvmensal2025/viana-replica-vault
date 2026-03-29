SELECT cron.schedule(
  'crm-auto-progress-daily',
  '0 9 * * *',
  $$
  SELECT extensions.http_post(
    'https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/crm-auto-progress',
    '{}',
    'application/json',
    ARRAY[
      extensions.http_header('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsemFzZmhjeGN6bmFwcnJyYWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NzAsImV4cCI6MjA4Njg1MDU3MH0.OJzRdi_Z_1TFZjQXmK8rJofBeHVZc27VSo2vMMw9Spo')
    ]
  );
  $$
);