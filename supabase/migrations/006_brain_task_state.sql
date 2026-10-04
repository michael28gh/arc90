begin;

alter table public.arc_tasks
  add column due_local timestamp without time zone,
  add column deleted boolean not null default false;

create function public.brain_task_keep_deleted() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.deleted then new.deleted := true; end if;
  return new;
end;
$$;
create trigger brain_task_keep_deleted before update on public.arc_tasks
  for each row execute function public.brain_task_keep_deleted();
revoke all on function public.brain_task_keep_deleted() from public, anon;

create function public.save_brain_task_state(states jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  state jsonb;
  task_id text;
  due_text text;
  next_due timestamp without time zone;
  next_deleted boolean;
  affected integer;
  updated integer := 0;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(states) is distinct from 'array' then
    raise exception 'Expected task state array' using errcode = '22023';
  end if;
  if jsonb_array_length(states) > 200 or octet_length(states::text) > 220000 then
    raise exception 'Task state batch too large' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text, 904));
  for state in select value from jsonb_array_elements(states) loop
    perform public.brain_check_object(state,
      '{"id":"string","due_local":"string|null","deleted":"boolean"}',
      array['id','due_local','deleted']);
    task_id := state->>'id';
    if char_length(task_id) not between 1 and 100 then
      raise exception 'Invalid task ID' using errcode = '22023';
    end if;

    due_text := state->>'due_local';
    if due_text is not null then
      if due_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]{1,6})?)?$' then
        raise exception 'Expected local ISO timestamp' using errcode = '22023';
      end if;
      if substring(due_text from 12 for 2)::integer > 23
        or substring(due_text from 15 for 2)::integer > 59
        or (char_length(due_text) >= 19 and substring(due_text from 18 for 2)::integer > 59) then
        raise exception 'Expected local ISO timestamp' using errcode = '22023';
      end if;
      next_due := due_text::timestamp without time zone;
    else
      next_due := null;
    end if;
    next_deleted := (state->>'deleted')::boolean;

    update public.arc_tasks
       set due_local = next_due,
           deleted = public.arc_tasks.deleted or next_deleted
     where user_id = uid and id = task_id;
    get diagnostics affected = row_count;
    if affected <> 1 then
      if next_deleted then continue; end if;
      raise exception 'Owned task not found: %', task_id using errcode = 'P0002';
    end if;
    updated := updated + 1;
  end loop;
  return jsonb_build_object('ok', true, 'updated', updated);
end;
$$;

revoke all on function public.save_brain_task_state(jsonb) from public, anon;
grant execute on function public.save_brain_task_state(jsonb) to authenticated;
commit;
