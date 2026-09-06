-- Repair (and only as a last resort delete) SRS cards created before the fix in PR #6.
--
-- Pre-fix rows stored "Translate or use: 茶 (chá) - tea" as BOTH prompt and answer, so the
-- reveal showed nothing new. Rather than discarding the learner's scheduling history, split
-- each row into a hanzi prompt and a "pinyin — English" answer. Rows that cannot be parsed
-- (no hanzi or no English gloss) are deleted because they cannot be shown as flashcards.
--
-- Safe to re-run: repaired rows no longer match either predicate.
with parsed as (
  select
    id,
    regexp_match(
      regexp_replace(prompt, '^Translate or use:\s*', ''),
      '^(.+?)\s*\(([^)]+)\)\s*[-—–]\s*(.+)$'
    ) as parts
  from learn_chinese.srs_cards
  where prompt ~* '^Translate or use:' or prompt = answer
)
update learn_chinese.srs_cards as cards
set
  prompt = trim(parsed.parts[1]),
  answer = trim(parsed.parts[2]) || ' — ' || trim(parsed.parts[3]),
  updated_at = now()
from parsed
where cards.id = parsed.id
  and parsed.parts is not null
  and trim(parsed.parts[1]) ~ '[一-鿿]'
  and trim(parsed.parts[3]) ~ '[A-Za-z]';

delete from learn_chinese.srs_cards
where prompt = answer
   or prompt ~* '^Translate or use:'
   or answer ~ '^[一-鿿\s]+$';
