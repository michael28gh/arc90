-- Run as postgres against a disposable Supabase DB after migration 006.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/brain_task_state.sql
begin;
insert into auth.users(id) values
  ('b0000000-0000-4000-8000-000000000003'),
  ('b0000000-0000-4000-8000-000000000004');

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into public.arc_tasks(id,title,horizon) values ('task-state-a','Owner A task','short');

do $$
declare ack jsonb; oversized jsonb;
begin
  ack := public.save_brain_task_state('[{"id":"task-state-a","due_local":"2026-10-01T18:45:30.123456","deleted":false}]');
  if ack <> '{"ok":true,"updated":1}'::jsonb or
     (select due_local from public.arc_tasks where id = 'task-state-a') <> timestamp '2026-10-01 18:45:30.123456' then
    raise exception 'Local deadline did not round-trip';
  end if;
  perform public.save_brain_task_state('[{"id":"task-state-a","due_local":null,"deleted":true}]');
  perform public.save_brain_task_state('[{"id":"task-state-a","due_local":"2026-10-02T09:00","deleted":false}]');
  if (select deleted from public.arc_tasks where id = 'task-state-a') is not true or
     (select due_local from public.arc_tasks where id = 'task-state-a') <> timestamp '2026-10-02 09:00' then
    raise exception 'Tombstone was lost or local deadline was not updated';
  end if;
  update public.arc_tasks set deleted = false where id = 'task-state-a';
  if (select deleted from public.arc_tasks where id = 'task-state-a') is not true then
    raise exception 'Direct update resurrected a tombstoned task';
  end if;
  begin
    perform public.save_brain_task_state('[{"id":"task-state-a","due_local":"2026-10-03T10:00","deleted":false},{"id":"missing-task","due_local":null,"deleted":false}]');
    raise exception 'Missing task was accepted';
  exception when no_data_found then null;
  end;
  if (select due_local from public.arc_tasks where id = 'task-state-a') <> timestamp '2026-10-02 09:00' then
    raise exception 'Failed metadata batch partially updated a task';
  end if;
  ack := public.save_brain_task_state('[{"id":"never-uploaded","due_local":null,"deleted":true}]');
  if ack <> '{"ok":true,"updated":0}'::jsonb then
    raise exception 'Missing tombstone was not accepted as a no-op';
  end if;
  begin
    perform public.save_brain_task_state('[{"id":"task-state-a","due_local":"2026-10-02T09:00Z","deleted":false}]');
    raise exception 'Timezone suffix was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_brain_task_state('[{"id":"task-state-a","due_local":"2026-02-30T09:00","deleted":false}]');
    raise exception 'Impossible date was accepted';
  exception when datetime_field_overflow then null;
  end;
  begin
    perform public.save_brain_task_state('[{"id":"task-state-a","due_local":null,"deleted":false,"user_id":"b0000000-0000-4000-8000-000000000004"}]');
    raise exception 'Extra ownership field was accepted';
  exception when invalid_parameter_value then null;
  end;
  select jsonb_agg(jsonb_build_object('id', 'missing-' || i, 'due_local', null, 'deleted', false))
    into oversized from generate_series(1, 201) i;
  begin
    perform public.save_brain_task_state(oversized);
    raise exception '201 rows were accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_brain_task_state(jsonb_build_array(jsonb_build_object(
      'id', repeat('x', 220001), 'due_local', null, 'deleted', false)));
    raise exception 'Oversized batch was accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into public.arc_tasks(id,title,horizon) values ('task-state-b','Owner B task','short');
do $$
begin
  begin
    perform public.save_brain_task_state('[{"id":"task-state-a","due_local":"2026-11-01T08:00","deleted":false}]');
    raise exception 'Cross-user metadata update was accepted';
  exception when no_data_found then null;
  end;
  if (select count(*) from public.arc_tasks where id = 'task-state-a') <> 0 then
    raise exception 'Owner B can read owner A task';
  end if;
  if (select due_local from public.arc_tasks where id = 'task-state-b') is not null then
    raise exception 'Owner B task changed unexpectedly';
  end if;
end;
$$;

set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
do $$
declare ack jsonb;
begin
  if (select deleted from public.arc_tasks where id = 'task-state-a') is not true or
     (select due_local from public.arc_tasks where id = 'task-state-a') <> timestamp '2026-10-02 09:00' then
    raise exception 'Cross-user attempt changed owner A task';
  end if;
  ack := public.save_brain_task_state('[{"id":"task-state-b","due_local":null,"deleted":true}]');
  if ack <> '{"ok":true,"updated":0}'::jsonb then
    raise exception 'Cross-user tombstone was not a no-op';
  end if;
end;
$$;

set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000004","role":"authenticated"}';
do $$
begin
  if (select deleted from public.arc_tasks where id = 'task-state-b') is not false or
     (select due_local from public.arc_tasks where id = 'task-state-b') is not null then
    raise exception 'Cross-user tombstone changed owner B task';
  end if;
end;
$$;

set local role anon;
set local request.jwt.claims = '{}';
do $$
begin
  begin
    perform public.save_brain_task_state('[]');
    raise exception 'Anonymous execution was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;
