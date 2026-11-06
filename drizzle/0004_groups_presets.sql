-- The five groups every installation starts with. Drizzle applies a
-- migration once, so they are not brought back after the owner deletes them.
INSERT INTO "groups" ("name") VALUES ('Семья'), ('Друзья'), ('Знакомые'), ('Теннис'), ('Аналитики') ON CONFLICT DO NOTHING;
