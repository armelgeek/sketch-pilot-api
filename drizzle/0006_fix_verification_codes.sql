-- Drop the existing verification_codes table
DROP TABLE IF EXISTS "verification_codes" CASCADE;

-- Recreate the verification_codes table with correct data types
CREATE TABLE "verification_codes" (
    "id" text PRIMARY KEY DEFAULT gen_random_uuid(),
    "code" varchar(6) NOT NULL,
    "child_id" text NOT NULL,
    "expires_at" timestamp NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "verification_codes_child_id_children_id_fk" 
        FOREIGN KEY ("child_id") 
        REFERENCES "public"."children"("id") 
        ON DELETE CASCADE
        ON UPDATE NO ACTION
);
