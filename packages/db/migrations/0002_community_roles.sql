-- Community edition: organization members work on every project of their organization.
-- Owners and administrators manage projects; members edit them.
-- An explicit project membership (used by the Premium editions) still takes precedence.
create or replace function golive.project_role(p text) returns text
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select pm.role from project_members pm
       where pm.project_id = p and pm.user_id = golive.uid()
         and (pm.expires_at is null or pm.expires_at > now())),
    (select case m.role when 'owner' then 'responsable' when 'admin' then 'responsable' when 'member' then 'editeur' end
       from projects pr join org_members m on m.org_id = pr.org_id and m.user_id = golive.uid()
       where pr.id = p)
  )
$$;
