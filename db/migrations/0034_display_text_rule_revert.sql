-- Revert 0035/0036 first (their CHECK constraints depend on this function).
begin;
drop function if exists public.oria_display_text_ok(text, integer, boolean);
commit;
