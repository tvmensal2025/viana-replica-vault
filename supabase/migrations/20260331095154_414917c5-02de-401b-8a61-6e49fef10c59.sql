-- Fix orphaned customer records: link them to their consultant based on registered_by_igreen_id
UPDATE customers c
SET consultant_id = con.id
FROM consultants con
WHERE c.consultant_id IS NULL
  AND c.registered_by_igreen_id IS NOT NULL
  AND c.registered_by_igreen_id = con.igreen_id;