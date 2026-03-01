-- Migration: Fix users.plan_id foreign key constraint
-- Met à NULL tous les plan_id invalides ou vides
UPDATE users
SET plan_id = NULL
WHERE plan_id IS NULL
   OR plan_id = ''
   OR plan_id NOT IN (SELECT id FROM subscription_plans);

-- Rends la colonne plan_id nullable (si ce n'est pas déjà le cas)
ALTER TABLE users ALTER COLUMN plan_id DROP NOT NULL;

-- Ajoute ou réactive la contrainte de clé étrangère
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'users_plan_id_subscription_plans_id_fk'
      AND table_name = 'users'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_plan_id_subscription_plans_id_fk
      FOREIGN KEY (plan_id) REFERENCES subscription_plans(id);
  END IF;
END$$;
