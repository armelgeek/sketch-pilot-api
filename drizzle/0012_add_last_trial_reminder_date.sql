-- Migration: Add lastTrialReminderDate to users table
ALTER TABLE users ADD COLUMN last_trial_reminder_date TIMESTAMP;
