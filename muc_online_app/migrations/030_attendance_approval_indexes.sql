-- Portable read-path indexes for approval plan decoration.
CREATE INDEX IF NOT EXISTS attendance_approval_plan_history_instance ON attendance_approval_plan_history(instance_id, id DESC);
CREATE INDEX IF NOT EXISTS attendance_approval_plan_person ON attendance_approval_plans(person_id);
CREATE INDEX IF NOT EXISTS attendance_approval_plan_queue_generation ON attendance_approval_plan_queue(generation);
