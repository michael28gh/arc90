-- Explicit brain-map cloud saves only. No health/journal/check-in synchronization.
begin;

create function public.brain_horizon_rank(value text) returns integer
language sql immutable strict set search_path = '' as $$
  select array_position(array['long','mid','short'], value);
$$;

create table public.brain_dumps (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  raw_text text not null check (char_length(raw_text) between 1 and 20000),
  status text not null default 'saved' check (status in ('draft','review','saved')),
  created_at timestamptz not null default now(),
  review jsonb check (review is null or (jsonb_typeof(review) = 'object' and octet_length(review::text) <= 131072)),
  unique (user_id, id)
);

create table public.goals (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  parent_goal_id uuid,
  horizon text not null check (public.brain_horizon_rank(horizon) is not null),
  status text not null default 'active' check (status in ('active','done','archived')),
  target_date date,
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  life_area text check (life_area is null or life_area in ('health','mind','career_school','money','build','people','spirit')),
  source_dump_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  constraint brain_goal_parent_fk foreign key (user_id, parent_goal_id)
    references public.goals(user_id, id) deferrable initially immediate,
  constraint brain_goal_source_fk foreign key (user_id, source_dump_id)
    references public.brain_dumps(user_id, id),
  check (parent_goal_id is distinct from id)
);

create table public.arc_habits (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  id text not null check (char_length(id) between 1 and 100),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  goal_id uuid,
  rhythm text not null default 'daily' check (rhythm in ('daily','weekdays','weekends','mwf','tuethu','weekly')),
  emoji text not null default '' check (char_length(emoji) <= 32),
  cat text not null default 'custom' check (char_length(cat) <= 80),
  min text not null default '2-minute version' check (char_length(min) <= 300),
  life_area text check (life_area is null or life_area in ('health','mind','career_school','money','build','people','spirit')),
  source_dump_id uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, goal_id) references public.goals(user_id, id),
  foreign key (user_id, source_dump_id) references public.brain_dumps(user_id, id)
);

create table public.arc_tasks (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  id text not null check (char_length(id) between 1 and 100),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  goal_id uuid,
  horizon text not null check (public.brain_horizon_rank(horizon) is not null),
  done boolean not null default false,
  due date,
  source_dump_id uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, goal_id) references public.goals(user_id, id),
  foreign key (user_id, source_dump_id) references public.brain_dumps(user_id, id)
);

create index brain_goals_parent_idx on public.goals(user_id, parent_goal_id);
create index brain_habits_goal_idx on public.arc_habits(user_id, goal_id);
create index brain_tasks_goal_idx on public.arc_tasks(user_id, goal_id);

alter table public.brain_dumps enable row level security;
alter table public.goals enable row level security;
alter table public.arc_habits enable row level security;
alter table public.arc_tasks enable row level security;
create policy brain_dumps_owner on public.brain_dumps for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy brain_goals_owner on public.goals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy brain_habits_owner on public.arc_habits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy brain_tasks_owner on public.arc_tasks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.brain_dumps, public.goals, public.arc_habits, public.arc_tasks from anon, authenticated;
grant select, insert, update on public.brain_dumps, public.goals, public.arc_habits, public.arc_tasks to authenticated;

-- Serialize graph mutations per owner, including direct REST writes.
create function public.brain_lock_owner() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 904));
  return null;
end;
$$;
create trigger brain_goals_lock before insert or update on public.goals
  for each statement execute function public.brain_lock_owner();
create trigger brain_tasks_lock before insert or update on public.arc_tasks
  for each statement execute function public.brain_lock_owner();
create trigger brain_habits_lock before insert or update on public.arc_habits
  for each statement execute function public.brain_lock_owner();

create function public.brain_check_graph() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if exists (
    select 1 from public.goals c join public.goals p
      on p.user_id = c.user_id and p.id = c.parent_goal_id
    where c.user_id = auth.uid()
      and public.brain_horizon_rank(p.horizon) <> public.brain_horizon_rank(c.horizon) - 1
  ) then raise exception 'Parent goal must be exactly one horizon higher' using errcode = '23514'; end if;
  if exists (
    with recursive chain as (
      select g.id, g.parent_goal_id, array[g.id] path, false cycle
      from public.goals g where g.user_id = auth.uid()
      union all
      select p.id, p.parent_goal_id, c.path || p.id, p.id = any(c.path)
      from chain c join public.goals p on p.id = c.parent_goal_id and p.user_id = auth.uid()
      where not c.cycle and cardinality(c.path) <= 5
    ) select 1 from chain where cycle or cardinality(path) > 5
  ) then raise exception 'Goal cycle or depth exceeds five' using errcode = '23514'; end if;
  if exists (
    select 1 from public.arc_tasks t join public.goals g on g.user_id = t.user_id and g.id = t.goal_id
    where t.user_id = auth.uid() and public.brain_horizon_rank(g.horizon) <> public.brain_horizon_rank(t.horizon) - 1
  ) then raise exception 'Task parent must be exactly one horizon higher' using errcode = '23514'; end if;
  if exists (
    select 1 from public.arc_habits h join public.goals g on g.user_id = h.user_id and g.id = h.goal_id
    where h.user_id = auth.uid() and g.horizon not in ('mid','short')
  ) then raise exception 'Habits require a mid or short goal' using errcode = '23514'; end if;
  return null;
end;
$$;
create constraint trigger brain_goals_graph after insert or update on public.goals
  deferrable initially immediate for each row execute function public.brain_check_graph();
create constraint trigger brain_tasks_graph after insert or update on public.arc_tasks
  deferrable initially immediate for each row execute function public.brain_check_graph();
create constraint trigger brain_habits_graph after insert or update on public.arc_habits
  deferrable initially immediate for each row execute function public.brain_check_graph();

-- Strict JSON shape/type checking before casts (JSON numbers are not text IDs).
create function public.brain_check_object(value jsonb, spec jsonb, required text[])
returns void language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb;
begin
  if jsonb_typeof(value) is distinct from 'object' then
    raise exception 'Expected JSON object' using errcode = '22023';
  end if;
  if not value ?& required then raise exception 'Missing required field' using errcode = '22023'; end if;
  for k, v in select * from jsonb_each(value) loop
    if not spec ? k or not (jsonb_typeof(v) = any(string_to_array(spec ->> k, '|'))) then
      raise exception 'Invalid field or type: %', k using errcode = '22023';
    end if;
    if k in ('due','target_date') and jsonb_typeof(v) = 'string' and (value->>k) !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Expected ISO date: %', k using errcode = '22023';
    end if;
  end loop;
end;
$$;

create function public.save_brain_map(payload jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid(); d jsonb; row_data jsonb; dump_id uuid; key text;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if payload is null or octet_length(payload::text) > 262144 then
    raise exception 'Payload too large or missing' using errcode = '22023';
  end if;
  perform public.brain_check_object(payload,
    '{"dump":"object","goals":"array","habits":"array","tasks":"array"}', array['dump','goals','habits','tasks']);
  foreach key in array array['goals','habits','tasks'] loop
    if jsonb_array_length(payload -> key) > 200 then raise exception 'Too many rows' using errcode = '22023'; end if;
    if (select count(*) <> count(distinct case when key = 'goals' then lower(x->>'id') else x->>'id' end)
        from jsonb_array_elements(payload->key) x) then
      raise exception 'Missing or duplicate IDs' using errcode = '22023';
    end if;
  end loop;
  d := payload -> 'dump';
  perform public.brain_check_object(d,
    '{"id":"string","raw_text":"string","status":"string","review":"object|null"}', array['id','raw_text','status']);
  dump_id := (d->>'id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 904));
  set constraints public.brain_goal_parent_fk, public.brain_goals_graph, public.brain_tasks_graph, public.brain_habits_graph deferred;
  insert into public.brain_dumps(id, user_id, raw_text, status, review)
    values(dump_id, uid, d->>'raw_text', d->>'status', nullif(d->'review','null'::jsonb))
    on conflict (id) do update set raw_text = excluded.raw_text, status = excluded.status, review = excluded.review;

  for row_data in select * from jsonb_array_elements(payload->'goals') loop
    perform public.brain_check_object(row_data,
      '{"id":"string","title":"string","horizon":"string","parent_goal_id":"string|null","status":"string","target_date":"string|null","color":"string|null","life_area":"string|null","source_dump_id":"string|null"}',
      array['id','title','horizon']);
    insert into public.goals(id,user_id,title,horizon,parent_goal_id,status,target_date,color,life_area,source_dump_id)
      values((row_data->>'id')::uuid,uid,row_data->>'title',row_data->>'horizon',(row_data->>'parent_goal_id')::uuid,
        coalesce(row_data->>'status','active'),(row_data->>'target_date')::date,row_data->>'color',row_data->>'life_area',
        case when row_data ? 'source_dump_id' then (row_data->>'source_dump_id')::uuid else dump_id end)
      on conflict (id) do update set title=excluded.title,horizon=excluded.horizon,
        parent_goal_id=case when row_data ? 'parent_goal_id' then excluded.parent_goal_id else goals.parent_goal_id end,
        status=excluded.status,target_date=excluded.target_date,color=excluded.color,life_area=excluded.life_area,source_dump_id=excluded.source_dump_id;
  end loop;
  for row_data in select * from jsonb_array_elements(payload->'habits') loop
    perform public.brain_check_object(row_data,
      '{"id":"string","name":"string","goal_id":"string|null","rhythm":"string","emoji":"string","cat":"string","min":"string","life_area":"string|null","source_dump_id":"string|null"}', array['id','name']);
    insert into public.arc_habits(user_id,id,name,goal_id,rhythm,emoji,cat,min,life_area,source_dump_id)
      values(uid,row_data->>'id',row_data->>'name',(row_data->>'goal_id')::uuid,
        coalesce(row_data->>'rhythm','daily'),coalesce(row_data->>'emoji',''),coalesce(row_data->>'cat','custom'),
        coalesce(row_data->>'min','2-minute version'),row_data->>'life_area',
        case when row_data ? 'source_dump_id' then (row_data->>'source_dump_id')::uuid else dump_id end)
      on conflict (user_id,id) do update set name=excluded.name,
        goal_id=case when row_data ? 'goal_id' then excluded.goal_id else arc_habits.goal_id end,
        rhythm=excluded.rhythm,emoji=excluded.emoji,cat=excluded.cat,min=excluded.min,life_area=excluded.life_area,source_dump_id=excluded.source_dump_id;
  end loop;
  for row_data in select * from jsonb_array_elements(payload->'tasks') loop
    perform public.brain_check_object(row_data,
      '{"id":"string","title":"string","goal_id":"string|null","horizon":"string","done":"boolean","due":"string|null","source_dump_id":"string|null"}', array['id','title','horizon']);
    insert into public.arc_tasks(user_id,id,title,goal_id,horizon,done,due,source_dump_id)
      values(uid,row_data->>'id',row_data->>'title',(row_data->>'goal_id')::uuid,row_data->>'horizon',
        coalesce((row_data->>'done')::boolean,false),(row_data->>'due')::date,
        case when row_data ? 'source_dump_id' then (row_data->>'source_dump_id')::uuid else dump_id end)
      on conflict (user_id,id) do update set title=excluded.title,
        goal_id=case when row_data ? 'goal_id' then excluded.goal_id else arc_tasks.goal_id end,
        horizon=excluded.horizon,done=excluded.done,due=excluded.due,source_dump_id=excluded.source_dump_id;
  end loop;
  set constraints public.brain_goal_parent_fk, public.brain_goals_graph, public.brain_tasks_graph, public.brain_habits_graph immediate;
  return jsonb_build_object('ok',true,'dump_id',dump_id,
    'goals',jsonb_array_length(payload->'goals'),'habits',jsonb_array_length(payload->'habits'),
    'tasks',jsonb_array_length(payload->'tasks'));
end;
$$;

create table public.brain_dump_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  used integer not null check (used between 1 and 20),
  primary key(user_id,day)
);
alter table public.brain_dump_rate_limits enable row level security;
create policy brain_quota_owner on public.brain_dump_rate_limits for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.brain_dump_rate_limits from anon, authenticated;
grant select on public.brain_dump_rate_limits to authenticated;

-- Definer is required only here: callers cannot directly reset their own quota.
create function public.consume_brain_dump_quota() returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); consumed integer;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.brain_dump_rate_limits(user_id,day,used)
    values(uid,(now() at time zone 'UTC')::date,1)
    on conflict(user_id,day) do update set used=public.brain_dump_rate_limits.used+1
      where public.brain_dump_rate_limits.used < 20
    returning used into consumed;
  return consumed is not null;
end;
$$;

revoke all on function public.save_brain_map(jsonb), public.consume_brain_dump_quota(),
  public.brain_horizon_rank(text), public.brain_check_object(jsonb,jsonb,text[]),
  public.brain_lock_owner(), public.brain_check_graph() from public, anon;
grant execute on function public.save_brain_map(jsonb), public.consume_brain_dump_quota(),
  public.brain_horizon_rank(text), public.brain_check_object(jsonb,jsonb,text[]) to authenticated;
commit;
