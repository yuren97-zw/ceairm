-- Read-path index for the approval-plan initial inventory timestamp.
-- 41k attendance events previously required a full jsonb extraction scan (~300ms) per plan.
CREATE INDEX IF NOT EXISTS attendance_event_instance
 ON attendance_events ((coalesce(payload_json::jsonb->>'processInstanceId', payload_json::jsonb->>'process_instance_id')));
