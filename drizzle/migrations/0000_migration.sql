create type public.app_role as enum ('admin','user');
create table public.user_roles (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade not null, role app_role not null, unique(user_id, role));
grant select on public.user_roles to authenticated; grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create or replace function public.has_role(_user_id uuid, _role app_role) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, email text, name text, created_at timestamptz not null default now());
grant select, update on public.profiles to authenticated; grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profile read" on public.profiles for select to authenticated using (id=auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "profile update" on public.profiles for update to authenticated using (id=auth.uid());

create table public.licenses (user_id uuid primary key, starts_at timestamptz not null default now(), ends_at timestamptz not null default now() + interval '30 days', active boolean not null default false, updated_at timestamptz not null default now());
grant select, insert, update, delete on public.licenses to authenticated; grant all on public.licenses to service_role;
alter table public.licenses enable row level security;
create policy "license read" on public.licenses for select to authenticated using (user_id=auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "license admin write" on public.licenses for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.bot_configs (
 user_id uuid primary key,
 wapi_instance_id text not null default '', wapi_token text not null default '', wapi_base_url text not null default 'https://api.w-api.app/v1',
 openai_key text not null default '', grok_key text not null default '', gemini_key text not null default '',
 ai_provider text not null default 'openai', ai_model text not null default 'gpt-4o-mini',
 prompt text not null default '', fish_api_key text not null default '', fish_voice_id text not null default '',
 audio_replies boolean not null default false, bot_active boolean not null default false,
 webhook_secret uuid not null default gen_random_uuid() unique, updated_at timestamptz not null default now());
grant select, insert, update on public.bot_configs to authenticated; grant all on public.bot_configs to service_role;
alter table public.bot_configs enable row level security;
create policy "cfg own" on public.bot_configs for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

create table public.ai_memory (id bigserial primary key, user_id uuid not null, phone text not null, role text not null, content text not null, created_at timestamptz not null default now());
create index on public.ai_memory(user_id, phone, created_at);
grant select, delete on public.ai_memory to authenticated; grant all on public.ai_memory to service_role;
grant usage on sequence public.ai_memory_id_seq to service_role;
alter table public.ai_memory enable row level security;
create policy "mem own" on public.ai_memory for select to authenticated using (user_id=auth.uid());
create policy "mem del" on public.ai_memory for delete to authenticated using (user_id=auth.uid());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,email,name) values (new.id,new.email,coalesce(new.raw_user_meta_data->>'name',''));
 insert into public.licenses(user_id) values (new.id);
 insert into public.bot_configs(user_id) values (new.id);
 if not exists (select 1 from public.user_roles where role='admin') then insert into public.user_roles(user_id,role) values(new.id,'admin'); end if;
 insert into public.user_roles(user_id,role) values(new.id,'user');
 return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();