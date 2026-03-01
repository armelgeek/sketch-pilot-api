-- Migration pour ajouter le champ is_active aux modules

ALTER TABLE "modules" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;

-- Mettre à jour tous les modules existants pour qu'ils soient actifs par défaut
UPDATE "modules" SET "is_active" = true WHERE "is_active" IS NULL;
