-- Remove malformed SRS cards created before the fix in PR #6.
--
-- Two categories of bad rows:
--
-- 1. prompt = answer (identical fields, reveal shows nothing new).
--    These were generated when deriveReviewItems pulled from examples/keyPoints/
--    microExercise (teaching aids with no prompt/answer split) or when
--    normalizeReviewItem stripped the English translation, leaving both sides
--    holding the same Chinese-only string.
--
-- 2. answer is purely CJK with no English (the reveal is useless).
--    Same root cause — the answer never contained a separable English meaning.
--
-- Fresh, correctly-formatted cards will be generated during the user's next
-- tutor session. SRS scheduling state (ease, interval) for these cards is lost,
-- but since the cards were unreviewed/un-reviewable that is acceptable.

delete from learn_chinese.srs_cards
where prompt = answer
   or answer ~ '^[\u4e00-\u9fff\u3400-\u4dbf\s]+$';
