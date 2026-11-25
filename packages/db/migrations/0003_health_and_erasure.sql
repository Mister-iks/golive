-- Worker heartbeat, read by /api/health so monitoring sees a stopped worker.
create table if not exists golive.worker_heartbeat (
  id text primary key,
  seen_at timestamptz not null default now(),
  version text
);

-- Right to erasure: when an account is deleted, its entries in the activity log
-- stay (the history must not be rewritten) but lose the link to the person.
-- That single change is the only update the log accepts; deletions stay refused.
create or replace function golive.forbid_change() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and old.actor_id is not null and new.actor_id is null
     and new.id = old.id and new.org_id = old.org_id and new.project_id is not distinct from old.project_id
     and new.action = old.action and new.target is not distinct from old.target
     and new.meta = old.meta and new.at = old.at then
    return new;
  end if;
  raise exception 'activity_log is append only';
end $$;
