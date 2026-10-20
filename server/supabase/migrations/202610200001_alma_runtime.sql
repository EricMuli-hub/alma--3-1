-- Alma currently stores its application state as one versioned JSONB document.
-- The document contains the existing users, institutions, credentials, grants,
-- consents, verification counters and hash-chained audit ledger.
create table if not exists public.alma_runtime (
  id boolean primary key default true check (id),
  state jsonb not null default '{"users":[],"insts":[],"creds":[],"grants":[],"blocks":[],"mail":[],"keys":[],"alerts":[],"consents":[],"down":{},"meta":{}}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  lock_token uuid,
  lock_until timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.alma_runtime (id) values (true) on conflict (id) do nothing;

alter table public.alma_runtime enable row level security;
revoke all on table public.alma_runtime from public, anon, authenticated;
grant select, update on table public.alma_runtime to service_role;

create or replace function public.alma_acquire_runtime(p_token uuid, p_lease_seconds integer default 300)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  if p_token is null or p_lease_seconds < 1 or p_lease_seconds > 600 then
    raise exception 'invalid runtime lock request';
  end if;
  update public.alma_runtime
     set lock_token = p_token,
         lock_until = now() + make_interval(secs => p_lease_seconds)
   where id = true and (lock_token is null or lock_until < now() or lock_token = p_token);
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

create or replace function public.alma_release_runtime(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  update public.alma_runtime set lock_token = null, lock_until = null
   where id = true and lock_token = p_token;
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

create or replace function public.alma_save_runtime(p_token uuid, p_revision bigint, p_state jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare next_revision bigint;
begin
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'invalid Alma state';
  end if;
  update public.alma_runtime
     set state = p_state,
         revision = revision + 1,
         updated_at = now(),
         lock_until = now() + interval '5 minutes'
   where id = true and lock_token = p_token and lock_until > now() and revision = p_revision
   returning revision into next_revision;
  if next_revision is null then
    raise exception 'runtime lock expired or state revision changed';
  end if;
  return next_revision;
end;
$$;

revoke all on function public.alma_acquire_runtime(uuid, integer) from public, anon, authenticated;
revoke all on function public.alma_release_runtime(uuid) from public, anon, authenticated;
revoke all on function public.alma_save_runtime(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.alma_acquire_runtime(uuid, integer) to service_role;
grant execute on function public.alma_release_runtime(uuid) to service_role;
grant execute on function public.alma_save_runtime(uuid, bigint, jsonb) to service_role;
