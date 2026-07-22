begin;

alter table public.profiles
add column if not exists theme_key text not null default 'sage';

alter table public.profiles
drop constraint if exists profiles_theme_key_check;

alter table public.profiles
add constraint profiles_theme_key_check check (
  theme_key in ('sage', 'petrol', 'lilac', 'rose', 'peach', 'sand')
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  false,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.storage_avatar_user_id(p_object_name text)
returns uuid
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_segment text;
begin
  v_segment := pg_catalog.split_part(p_object_name, '/', 1);

  if v_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;

  return v_segment::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

revoke all on function private.storage_avatar_user_id(text) from public, anon;
grant execute on function private.storage_avatar_user_id(text) to authenticated;

create policy "avatars_storage_select_self_or_shared_group"
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (
    (select auth.uid()) = private.storage_avatar_user_id(name)
    or (select private.users_share_group(private.storage_avatar_user_id(name)))
  )
);

create policy "avatars_storage_insert_self"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (select auth.uid()) = private.storage_avatar_user_id(name)
  and name ~* '^[0-9a-f-]{36}/avatar-[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
);

create policy "avatars_storage_update_self"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (select auth.uid()) = private.storage_avatar_user_id(name)
)
with check (
  bucket_id = 'avatars'
  and (select auth.uid()) = private.storage_avatar_user_id(name)
  and name ~* '^[0-9a-f-]{36}/avatar-[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
);

create policy "avatars_storage_delete_self"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (select auth.uid()) = private.storage_avatar_user_id(name)
);

comment on column public.profiles.theme_key
is 'Pastel visual theme selected by the profile owner.';

commit;
