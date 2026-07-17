begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'receipts',
  'receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.storage_group_id(p_object_name text)
returns uuid
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_segment text;
begin
  v_segment := split_part(p_object_name, '/', 1);

  if v_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;

  return v_segment::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

revoke all on function private.storage_group_id(text) from public, anon;
grant execute on function private.storage_group_id(text) to authenticated;

create policy "receipts_storage_select_group_members"
on storage.objects for select to authenticated
using (
  bucket_id = 'receipts'
  and (select private.is_group_member(private.storage_group_id(name)))
);

create policy "receipts_storage_insert_group_members"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'receipts'
  and name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
  and (select private.is_group_member(private.storage_group_id(name)))
);

create policy "receipts_storage_update_group_members"
on storage.objects for update to authenticated
using (
  bucket_id = 'receipts'
  and (select private.is_group_member(private.storage_group_id(name)))
)
with check (
  bucket_id = 'receipts'
  and name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
  and (select private.is_group_member(private.storage_group_id(name)))
);

create policy "receipts_storage_delete_group_members"
on storage.objects for delete to authenticated
using (
  bucket_id = 'receipts'
  and (select private.is_group_member(private.storage_group_id(name)))
);

commit;
