-- Migration pour ajouter les tables modules, lessons, games et game_sessions

CREATE TABLE "modules" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cover_url" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "modules_name_unique" UNIQUE("name")
);

CREATE TABLE "lessons" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"module_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lessons_name_unique" UNIQUE("name")
);

CREATE TABLE "games" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"file" text,
	"lesson_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "games_title_unique" UNIQUE("title")
);

CREATE TABLE "game_prerequisites" (
	"game_id" text NOT NULL,
	"prerequisite_game_id" text NOT NULL,
	CONSTRAINT "game_prerequisites_game_id_prerequisite_game_id_pk" PRIMARY KEY("game_id","prerequisite_game_id")
);

CREATE TABLE "game_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"game_id" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"success" boolean,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"session_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraints
DO $$ BEGIN
 ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "games" ADD CONSTRAINT "games_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "game_prerequisites" ADD CONSTRAINT "game_prerequisites_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "game_prerequisites" ADD CONSTRAINT "game_prerequisites_prerequisite_game_id_games_id_fk" FOREIGN KEY ("prerequisite_game_id") REFERENCES "games"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
