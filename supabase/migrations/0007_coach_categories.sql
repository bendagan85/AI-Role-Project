-- 0007_coach_categories.sql
-- Adds a `category` column to tenants so the landing page can group
-- coaches into "Training" / "Nutrition" / "Other" sections.
--
-- The category is set automatically by an AI classifier (see
-- src/lib/rag/classify.ts) when a coach saves their persona/system
-- prompt, or when the seed script provisions a demo coach.

alter table tenants
  add column if not exists category text not null default 'other'
    check (category in ('training', 'nutrition', 'other'));

create index if not exists tenants_category_idx on tenants(category);
