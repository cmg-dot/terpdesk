-- Standalone Interpreter toolkit, slice D (the personal glossary on Prep). Applied by hand like 0006 to 0014: to terpdesk_demo first, and to
-- production only when asked. Idempotent and additive: ONE NEW table and two indexes, no change to any existing table, so code that
-- predates it, and a database without it, keep working (the Prep page shows "not set up yet" for the glossary tab only).
--
-- interpreter_glossary_terms   an interpreter's own terminology bank (ASL and spoken languages). Private: no agency view, email or audit row
--                              ever carries a term, a rendering or a note.
--   term         the source term ("English / Source term"), 200 characters
--   rendering    the target rendering ("ASL Gloss / Target rendering"): for ASL a gloss or a short sign note, for a spoken language the
--                equivalent term, 300 characters
--   source_lang /
--   target_lang  the language pair, from the fixed list in src/lib/validation/glossaryTerm.ts (validated by the server)
--   setting      optional, one of the request forms' settings (src/lib/requestOptions.ts FILTER_SETTINGS), validated by the server
--   note         optional context note, 300 characters; the form says "No client names or patient details"

CREATE TABLE IF NOT EXISTS interpreter_glossary_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interpreter_id uuid NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
  term varchar(200) NOT NULL CHECK (length(btrim(term)) > 0),
  rendering varchar(300) NOT NULL CHECK (length(btrim(rendering)) > 0),
  source_lang varchar(40) NOT NULL DEFAULT 'English',
  target_lang varchar(40) NOT NULL DEFAULT 'ASL',
  setting varchar(40),
  note varchar(300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interpreter_glossary_terms_interpreter_setting_idx
  ON interpreter_glossary_terms (interpreter_id, setting);

-- The same pair of words in the same pair of languages is one entry (case does not matter).
CREATE UNIQUE INDEX IF NOT EXISTS interpreter_glossary_terms_unique_entry_idx
  ON interpreter_glossary_terms (interpreter_id, source_lang, target_lang, lower(term), lower(rendering));
