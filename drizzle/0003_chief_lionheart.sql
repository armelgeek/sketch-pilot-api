CREATE TABLE "avatars" (
	"id" text PRIMARY KEY NOT NULL,
	"image" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "children" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text NOT NULL,
	"firstname" text NOT NULL,
	"lastname" text NOT NULL,
	"birthday" timestamp,
	"avatar_url" text,
	"first_login" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"resource_type" text NOT NULL,
	"actions" jsonb NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(6) NOT NULL,
	"child_id" uuid NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "permissions" CASCADE;--> statement-breakpoint
DROP TABLE "role_permissions" CASCADE;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_resources" ADD CONSTRAINT "role_resources_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;