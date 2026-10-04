begin;

create function public.save_brain_maps(payloads jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid(); item jsonb; dump jsonb; saved integer := 0;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(payloads) is distinct from 'array' or jsonb_array_length(payloads) not between 1 and 100
    or octet_length(payloads::text) > 1048576 then
    raise exception 'Invalid batch size' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 904));
  -- All source dumps must exist before a goal, habit, or task refers to one.
  for item in select value from jsonb_array_elements(payloads) loop
    perform public.brain_check_object(item,
      '{"dump":"object","goals":"array","habits":"array","tasks":"array"}',
      array['dump','goals','habits','tasks']);
    dump := item->'dump';
    perform public.brain_check_object(dump,
      '{"id":"string","raw_text":"string","status":"string","review":"object|null"}',
      array['id','raw_text','status']);
    insert into public.brain_dumps(id,user_id,raw_text,status,review)
      values((dump->>'id')::uuid,uid,dump->>'raw_text',dump->>'status',nullif(dump->'review','null'::jsonb))
      on conflict (id) do update set raw_text=excluded.raw_text,status=excluded.status,review=excluded.review;
  end loop;
  for item in select value from jsonb_array_elements(payloads) loop
    perform public.save_brain_map(item);
    saved := saved + 1;
  end loop;
  return jsonb_build_object('ok',true,'dumps',saved);
end;
$$;

revoke all on function public.save_brain_maps(jsonb) from public, anon;
grant execute on function public.save_brain_maps(jsonb) to authenticated;
commit;
