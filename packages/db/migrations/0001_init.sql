-- PcyBox GoLive, initial schema.
-- Isolation model: the application connects as the database owner, and every
-- request made on behalf of a user runs inside a transaction that switches to
-- the golive_app role and sets golive.user_id. Row level security policies on
-- that role confine each user to the organizations and projects they belong to.
-- The worker and the authentication layer run as the owner, outside RLS.

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'golive_app') then
    create role golive_app nologin;
  end if;
end $$;
grant golive_app to current_user;

create schema if not exists golive;
grant usage on schema golive to golive_app;
grant usage on schema public to golive_app;

------------------------------------------------------------------ authentication
-- Managed by Better Auth. Column names follow its field names in snake_case.

create table users (
  id text primary key,
  name text not null,
  email text not null unique,
  email_verified boolean not null default false,
  image text,
  two_factor_enabled boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sessions (
  id text primary key,
  token text not null unique,
  user_id text not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sessions_user_idx on sessions(user_id);

create table accounts (
  id text primary key,
  account_id text not null,
  provider_id text not null,
  user_id text not null references users(id) on delete cascade,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index accounts_user_idx on accounts(user_id);

create table verifications (
  id text primary key,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index verifications_identifier_idx on verifications(identifier);

create table two_factors (
  id text primary key,
  secret text not null,
  backup_codes text not null,
  user_id text not null references users(id) on delete cascade,
  verified boolean default true,
  failed_verification_count integer default 0,
  locked_until timestamptz
);

------------------------------------------------------------------ tenancy

create table organizations (
  id text primary key default gen_random_uuid()::text,
  name text not null check (length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table org_members (
  org_id text not null references organizations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'guest')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on org_members(user_id);

create table projects (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references organizations(id) on delete cascade,
  name text not null,
  spec jsonb not null,
  revision integer not null default 1,
  -- Latest web observation per environment: { "prod": {...}, "preprod": {...} }.
  web jsonb,
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_org_idx on projects(org_id);

create table project_members (
  project_id text not null references projects(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  org_id text not null references organizations(id) on delete cascade,
  role text not null check (role in ('responsable', 'editeur', 'contributeur', 'lecteur', 'valideur')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on project_members(user_id);

create table invitations (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references organizations(id) on delete cascade,
  email text not null,
  org_role text not null check (org_role in ('admin', 'member', 'guest')),
  -- [{ "projectId": "...", "role": "editeur" }]
  projects jsonb not null default '[]',
  -- Access end date granted with the invitation (optional).
  access_expires_at timestamptz,
  token_hash text not null unique,
  invited_by text references users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by text references users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_org_idx on invitations(org_id);

------------------------------------------------------------------ audits and tasks

create table audits (
  id text primary key default gen_random_uuid()::text,
  project_id text not null references projects(id) on delete cascade,
  org_id text not null references organizations(id) on delete cascade,
  env text not null check (env in ('prod', 'preprod')),
  kind text not null check (kind in ('quick', 'full')),
  url text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  progress jsonb not null default '{}',
  requested_by text references users(id) on delete set null,
  observation jsonb,
  verdict text,
  score integer,
  fingerprint text,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index audits_project_idx on audits(project_id, created_at desc);
-- One audit at a time per project and environment.
create unique index audits_active_idx on audits(project_id, env) where status in ('queued', 'running');

create table tasks (
  project_id text not null references projects(id) on delete cascade,
  org_id text not null references organizations(id) on delete cascade,
  rule_id text not null,
  col text not null default 'todo' check (col in ('todo', 'doing', 'review', 'done')),
  assignee_id text references users(id) on delete set null,
  unconfirmed boolean not null default false,
  regression boolean not null default false,
  closed_by_audit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, rule_id)
);

create table domain_verifications (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references organizations(id) on delete cascade,
  hostname text not null,
  token text not null,
  method text,
  verified_at timestamptz,
  checked_at timestamptz,
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, hostname)
);

------------------------------------------------------------------ activity log (append only)

create table activity_log (
  id bigserial primary key,
  org_id text not null references organizations(id) on delete cascade,
  project_id text,
  actor_id text references users(id) on delete set null,
  action text not null,
  target text,
  meta jsonb not null default '{}',
  at timestamptz not null default now()
);
create index activity_org_idx on activity_log(org_id, at desc);

create function golive.forbid_change() returns trigger language plpgsql as $$
begin
  raise exception 'activity_log is append only';
end $$;
create trigger activity_log_immutable before update or delete on activity_log
  for each row execute function golive.forbid_change();

------------------------------------------------------------------ access functions

create function golive.uid() returns text language sql stable as $$
  select nullif(current_setting('golive.user_id', true), '')
$$;

create function golive.org_role(o text) returns text
  language sql stable security definer set search_path = public as $$
  select role from org_members where org_id = o and user_id = golive.uid()
$$;

-- Effective project role: an explicit, unexpired project membership wins;
-- organization owners and admins manage every project; members read them.
create function golive.project_role(p text) returns text
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select pm.role from project_members pm
       where pm.project_id = p and pm.user_id = golive.uid()
         and (pm.expires_at is null or pm.expires_at > now())),
    (select case m.role when 'owner' then 'responsable' when 'admin' then 'responsable' when 'member' then 'lecteur' end
       from projects pr join org_members m on m.org_id = pr.org_id and m.user_id = golive.uid()
       where pr.id = p)
  )
$$;

-- Bypasses RLS on purpose: a user must not claim ownership of an organization they cannot see.
create function golive.org_has_members(o text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_members where org_id = o)
$$;

grant execute on all functions in schema golive to golive_app;

------------------------------------------------------------------ row level security

alter table organizations enable row level security;
alter table org_members enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table invitations enable row level security;
alter table audits enable row level security;
alter table tasks enable row level security;
alter table domain_verifications enable row level security;
alter table activity_log enable row level security;

grant select on users to golive_app;
grant select, insert, update on organizations to golive_app;
grant select, insert, update, delete on org_members, projects, project_members, invitations, tasks, domain_verifications to golive_app;
grant select, insert, update on audits to golive_app;
grant select, insert on activity_log to golive_app;
grant usage on sequence activity_log_id_seq to golive_app;

create policy org_read on organizations for select to golive_app using (golive.org_role(id) is not null);
create policy org_write on organizations for update to golive_app using (golive.org_role(id) in ('owner', 'admin'));
-- Creating an organization is allowed; membership is inserted right after by the same transaction.
create policy org_create on organizations for insert to golive_app with check (true);

create policy members_read on org_members for select to golive_app using (golive.org_role(org_id) is not null);
create policy members_self_owner on org_members for insert to golive_app
  with check (user_id = golive.uid() and role = 'owner' and not golive.org_has_members(org_id));
create policy members_admin on org_members for all to golive_app
  using (golive.org_role(org_id) in ('owner', 'admin')) with check (golive.org_role(org_id) in ('owner', 'admin'));

-- The org clause also covers INSERT ... RETURNING, where the new row is not yet visible to project_role().
create policy projects_read on projects for select to golive_app
  using (golive.project_role(id) is not null or golive.org_role(org_id) in ('owner', 'admin', 'member'));
create policy projects_create on projects for insert to golive_app with check (golive.org_role(org_id) in ('owner', 'admin', 'member'));
create policy projects_update on projects for update to golive_app using (golive.project_role(id) in ('responsable', 'editeur', 'contributeur', 'valideur'));
create policy projects_delete on projects for delete to golive_app using (golive.project_role(id) = 'responsable');

create policy pm_read on project_members for select to golive_app using (golive.project_role(project_id) is not null);
create policy pm_write on project_members for all to golive_app
  using (golive.project_role(project_id) = 'responsable') with check (golive.project_role(project_id) = 'responsable');

create policy inv_read on invitations for select to golive_app using (golive.org_role(org_id) in ('owner', 'admin'));
create policy inv_write on invitations for all to golive_app
  using (golive.org_role(org_id) in ('owner', 'admin')) with check (golive.org_role(org_id) in ('owner', 'admin'));

create policy audits_read on audits for select to golive_app using (golive.project_role(project_id) is not null);
create policy audits_create on audits for insert to golive_app
  with check (golive.project_role(project_id) in ('responsable', 'editeur', 'contributeur', 'valideur'));
create policy audits_update on audits for update to golive_app
  using (golive.project_role(project_id) in ('responsable', 'editeur', 'contributeur', 'valideur'));

create policy tasks_read on tasks for select to golive_app using (golive.project_role(project_id) is not null);
create policy tasks_write on tasks for all to golive_app
  using (golive.project_role(project_id) in ('responsable', 'editeur', 'contributeur', 'valideur'))
  with check (golive.project_role(project_id) in ('responsable', 'editeur', 'contributeur', 'valideur'));

create policy domains_read on domain_verifications for select to golive_app using (golive.org_role(org_id) is not null);
create policy domains_write on domain_verifications for all to golive_app
  using (golive.org_role(org_id) in ('owner', 'admin', 'member')) with check (golive.org_role(org_id) in ('owner', 'admin', 'member'));

create policy activity_read on activity_log for select to golive_app using (golive.org_role(org_id) in ('owner', 'admin'));
create policy activity_write on activity_log for insert to golive_app with check (golive.org_role(org_id) is not null and actor_id = golive.uid());

-- Users can see the profiles of people who share an organization with them.
alter table users enable row level security;
create policy users_read on users for select to golive_app using (
  id = golive.uid() or exists (
    select 1 from org_members a join org_members b on a.org_id = b.org_id
    where a.user_id = golive.uid() and b.user_id = users.id
  )
);
