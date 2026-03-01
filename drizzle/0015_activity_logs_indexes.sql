-- Indexes for activity_logs filters performance
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs (action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_resource ON activity_logs (resource);
CREATE INDEX IF NOT EXISTS idx_activity_logs_status ON activity_logs (status);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs (user_id);
-- Optionally, index timestamp for faster sorting
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs (timestamp);
