-- Hands the contacts and groups that exist before sign-in to the owner.
-- The email comes from the OWNER_EMAIL setting: scripts/migrate.ts puts it
-- into the session setting "crm.owner_email" before the migrations run.
-- Nothing is deleted or added except one row in "users"; only the new
-- column "owner_id" is filled in. Notes and links to groups are not touched:
-- they follow their contacts.
DO $$
DECLARE
  v_email text := lower(nullif(btrim(current_setting('crm.owner_email', true)), ''));
  v_owner_id text;
BEGIN
  IF v_email IS NULL THEN
    -- No owner: fine only while there is nothing to hand over
    IF EXISTS (SELECT 1 FROM contacts) OR EXISTS (SELECT 1 FROM groups) THEN
      RAISE EXCEPTION 'OWNER_EMAIL is not set: existing contacts and groups need an owner';
    END IF;
    RETURN;
  END IF;

  SELECT id INTO v_owner_id FROM users WHERE lower(email) = v_email;
  IF v_owner_id IS NULL THEN
    v_owner_id := gen_random_uuid()::text;
    INSERT INTO users (id, name, email, email_verified)
    VALUES (v_owner_id, '', v_email, true);
  END IF;

  UPDATE contacts SET owner_id = v_owner_id WHERE owner_id IS NULL;
  UPDATE groups SET owner_id = v_owner_id WHERE owner_id IS NULL;
END
$$;
