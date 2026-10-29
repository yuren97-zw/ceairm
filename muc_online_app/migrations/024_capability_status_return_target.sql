-- Optional work placement on normal status completion; no historical rewrite.
alter table capability_status_records add column if not exists return_target text
  check(return_target is null or return_target in ('一组','二组','三组','四组','SPECIAL','WAITING'));
