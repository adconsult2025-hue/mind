-- Cleanup and constraint enforcement for quote_items

-- 1) Remove orphaned rows or rows with NULL quote_id
DELETE FROM quote_items qi
WHERE qi.quote_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM quotes q WHERE q.id = qi.quote_id);

-- 2) Ensure join index exists (improves ON DELETE CASCADE)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_quote_items_quote_id'
      AND n.nspname = 'public'
  ) THEN
    -- In Neon you can use CONCURRENTLY; if you are in a transaction, remove CONCURRENTLY
    CREATE INDEX CONCURRENTLY idx_quote_items_quote_id ON quote_items(quote_id);
  END IF;
END$$;

-- 3) Set NOT NULL on quote_items.quote_id
ALTER TABLE quote_items
  ALTER COLUMN quote_id SET NOT NULL;

-- 4) (Re)define the FK constraint explicitly with ON DELETE CASCADE
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quote_items_quote_id_fkey'
  ) THEN
    ALTER TABLE quote_items DROP CONSTRAINT quote_items_quote_id_fkey;
  END IF;

  ALTER TABLE quote_items
    ADD CONSTRAINT quote_items_quote_id_fkey
    FOREIGN KEY (quote_id)
    REFERENCES quotes(id)
    ON DELETE CASCADE;
END$$;

-- 5) (Optional but recommended) Basic rules on key columns
ALTER TABLE quote_items
  ALTER COLUMN sku  SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN qty  SET DEFAULT 1,
  ALTER COLUMN price SET DEFAULT 0,
  ALTER COLUMN discount SET DEFAULT 0;
