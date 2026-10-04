-- Run as postgres against a disposable Supabase DB after migration 004.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/brain_dump_rls.sql
begin;
insert into auth.users(id) values
  ('b0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002');

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare p jsonb; ack jsonb;
begin
  p := '{
    "dump":{"id":"d0000000-0000-4000-8000-000000000001","raw_text":"Private A","status":"saved","review":{"items":[]}},
    "goals":[
      {"id":"a0000000-0000-4000-8000-000000000002","title":"Milestone","horizon":"mid","parent_goal_id":"a0000000-0000-4000-8000-000000000001"},
      {"id":"a0000000-0000-4000-8000-000000000001","title":"Direction","horizon":"long"}],
    "habits":[{"id":"legacy-1","name":"Practice","goal_id":"a0000000-0000-4000-8000-000000000002","rhythm":"mwf"}],
    "tasks":[{"id":"task-1","title":"Start","horizon":"short","done":false,"due":"2026-10-01","goal_id":"a0000000-0000-4000-8000-000000000002"}]
  }';
  ack := public.save_brain_map(p);
  if ack <> '{"ok":true,"dump_id":"d0000000-0000-4000-8000-000000000001","goals":2,"habits":1,"tasks":1}'::jsonb then
    raise exception 'Unexpected acknowledgement: %', ack;
  end if;
  perform public.save_brain_map(p);
  if (select count(*) from public.goals) <> 2 or (select count(*) from public.arc_habits) <> 1 then
    raise exception 'Retry was not idempotent';
  end if;
  -- Failure after earlier inserts must roll back the entire RPC subtransaction.
  begin
    perform public.save_brain_map(jsonb_set(jsonb_set(p,'{dump,id}','"d0000000-0000-4000-8000-000000000099"'),
      '{tasks,0,goal_id}','"a0000000-0000-4000-8000-000000000099"'));
    raise exception 'Missing goal was accepted';
  exception when foreign_key_violation then null;
  end;
  if exists(select 1 from public.brain_dumps where id='d0000000-0000-4000-8000-000000000099') or
     exists(select 1 from public.goals where source_dump_id='d0000000-0000-4000-8000-000000000099') then
    raise exception 'Partial save survived failure';
  end if;
  begin
    perform public.save_brain_map(jsonb_set(p,'{tasks,0,done}','"false"'));
    raise exception 'String boolean accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_brain_map(jsonb_set(p,'{dump,user_id}','"b0000000-0000-4000-8000-000000000002"'));
    raise exception 'Payload ownership accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_brain_map(jsonb_set(p,'{dump,raw_text}',to_jsonb(repeat('x',20001))));
    raise exception 'Oversized text accepted';
  exception when check_violation then null;
  end;
  begin
    update public.goals set parent_goal_id='a0000000-0000-4000-8000-000000000002'
      where id='a0000000-0000-4000-8000-000000000001';
    raise exception 'Cycle accepted';
  exception when check_violation then null;
  end;
  begin
    update public.goals set horizon='short' where id='a0000000-0000-4000-8000-000000000002';
    raise exception 'Skipped horizon accepted';
  exception when check_violation then null;
  end;
  begin
    update public.arc_habits set goal_id='a0000000-0000-4000-8000-000000000001';
    raise exception 'Habit linked to long goal';
  exception when check_violation then null;
  end;
  -- Omitted records survive; explicit nulls unlink in the same RPC.
  perform public.save_brain_map(jsonb_set(jsonb_set(p,'{goals}','[]'),'{tasks}','[]'));
  if (select count(*) from public.goals) <> 2 or (select count(*) from public.arc_tasks) <> 1 then
    raise exception 'Omitted records were deleted';
  end if;
  perform public.save_brain_map(jsonb_set(jsonb_set(p,'{habits,0,goal_id}','null'),'{tasks,0,goal_id}','null'));
  if exists(select 1 from public.arc_habits where goal_id is not null) or
     exists(select 1 from public.arc_tasks where goal_id is not null) then
    raise exception 'Explicit unlink failed';
  end if;
  begin
    perform public.save_brain_map(jsonb_set(p,'{goals}',
      '[{"id":"a0000000-0000-4000-8000-000000000001","title":"One","horizon":"long"},
        {"id":"A0000000-0000-4000-8000-000000000001","title":"Two","horizon":"long"}]'::jsonb));
    raise exception 'Case-variant duplicate goal UUIDs accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_brain_map(jsonb_set(p,'{goals,0,id}','null'));
    raise exception 'Null goal ID accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_brain_map(jsonb_set(p,'{tasks,0,due}','"2026-2-1"'));
    raise exception 'Non-ISO due date accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_brain_map(jsonb_set(p,'{dump,review}','[]'));
    raise exception 'Array review accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    update public.arc_tasks set goal_id='a0000000-0000-4000-8000-000000000001' where id='task-1';
    raise exception 'Direct task linked across a horizon';
  exception when check_violation then null;
  end;
  begin
    update public.goals set user_id='b0000000-0000-4000-8000-000000000002'
      where id='a0000000-0000-4000-8000-000000000001';
    raise exception 'Direct owner change accepted';
  exception when insufficient_privilege then null;
  end;
  for i in 1..20 loop
    if not public.consume_brain_dump_quota() then raise exception 'Quota refused call %', i; end if;
  end loop;
  if public.consume_brain_dump_quota() then raise exception 'Quota allowed call 21'; end if;
  begin
    update public.brain_dump_rate_limits set used=1;
    raise exception 'Quota could be reset by caller';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}';
do $$
declare affected integer;
begin
  if exists(select 1 from public.brain_dumps) or exists(select 1 from public.goals) or
     exists(select 1 from public.arc_habits) or exists(select 1 from public.arc_tasks) or
     exists(select 1 from public.brain_dump_rate_limits) then
    raise exception 'User B can read user A rows';
  end if;
  update public.brain_dumps set raw_text='stolen' where id='d0000000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'User B modified user A'; end if;
  begin
    insert into public.brain_dumps(id,user_id,raw_text) values
      ('d0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001','forged');
    raise exception 'Cross-owner insert accepted';
  exception when insufficient_privilege then null;
  end;
  insert into public.brain_dumps(id,raw_text) values('d0000000-0000-4000-8000-000000000002','Private B');
  begin
    insert into public.goals(id,title,horizon,parent_goal_id) values
      ('a0000000-0000-4000-8000-000000000003','Cross-user parent','mid','a0000000-0000-4000-8000-000000000001');
    raise exception 'Cross-user parent FK accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.goals(id,title,horizon,source_dump_id) values
      ('a0000000-0000-4000-8000-000000000003','Cross-user source','mid','d0000000-0000-4000-8000-000000000001');
    raise exception 'Cross-user source FK accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.arc_habits(id,name,goal_id) values
      ('legacy-1','Cross-user habit','a0000000-0000-4000-8000-000000000002');
    raise exception 'Cross-user habit FK accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.arc_tasks(id,title,horizon,goal_id) values
      ('task-1','Cross-user task','short','a0000000-0000-4000-8000-000000000002');
    raise exception 'Cross-user task FK accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    perform public.save_brain_map('{
      "dump":{"id":"d0000000-0000-4000-8000-000000000001","raw_text":"overwrite A","status":"saved"},
      "goals":[],"habits":[],"tasks":[]}');
    raise exception 'RPC cross-user UUID overwrite accepted';
  exception when insufficient_privilege then null;
  end;
  insert into public.arc_habits(id,name) values('legacy-1','B same local ID');
  if not public.consume_brain_dump_quota() then raise exception 'User quotas are not independent'; end if;
end;
$$;

set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
begin
  if (select raw_text from public.brain_dumps where id='d0000000-0000-4000-8000-000000000001') <> 'Private A' or
     (select name from public.arc_habits where id='legacy-1') <> 'Practice' then
    raise exception 'User A content was changed';
  end if;
end;
$$;

set local role anon;
set local request.jwt.claims = '{}';
do $$
begin
  begin
    perform public.save_brain_map('{}');
    raise exception 'Anonymous RPC accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.consume_brain_dump_quota();
    raise exception 'Anonymous quota accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.brain_dumps;
    raise exception 'Anonymous read accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;
