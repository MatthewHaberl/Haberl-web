-- ============================================================================
-- Migration 135: each founder reads the workbook in their own language.
-- ----------------------------------------------------------------------------
-- Matthew works in English, Zacques in Afrikaans. Both read the SAME question —
-- the content module carries every string in both languages — so a difference
-- in their answers is a real disagreement and not a translation artefact.
--
-- The preference lives on the participant row rather than in the browser, so it
-- follows the person between their phone and the office machine. `language` is
-- deliberately NOT in the founders_guard_participant() column list (migration
-- 134): a participant changing their own language is exactly the kind of edit
-- to their own row that the guard is meant to allow.
-- ============================================================================

alter table public.founders_participants
  add column if not exists language text not null default 'en'
    check (language in ('en', 'af'));

update public.founders_participants
   set language = 'af'
 where email = 'zacques05@gmail.com';
