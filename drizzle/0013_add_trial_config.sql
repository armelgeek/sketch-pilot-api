-- Migration for trial_config table
DO $$ BEGIN
  -- Create trial_config table
  CREATE TABLE IF NOT EXISTS "trial_config" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "is_enabled" boolean DEFAULT true NOT NULL,
    "duration_in_days" integer DEFAULT 14 NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  );

  -- Insert default trial configuration if not exists
  INSERT INTO "trial_config" (id, is_enabled, duration_in_days, created_at, updated_at)
  SELECT gen_random_uuid(), true, 14, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM trial_config);
END $$;
