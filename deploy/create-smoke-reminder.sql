\set ON_ERROR_STOP on

begin;

with target_user as (
  select id
  from users
  where first_name = 'Mateusz' and last_name = 'Meloch' and is_active = true
  limit 1
), created_task as (
  insert into tasks (
    title,
    description,
    author_id,
    assignee_id,
    status,
    visibility,
    priority,
    due_at
  )
  select
    '[TEST] Automatyczne przypomnienie ' || to_char(now() at time zone 'Europe/Warsaw', 'HH24:MI:SS'),
    'Kontrolowany test workera, centrum powiadomień i dostawy Telegram.',
    id,
    id,
    'OPEN',
    'PRIVATE',
    'NORMAL',
    now() + interval '59 minutes 59 seconds'
  from target_user
  returning id, author_id, due_at
), created_reminder as (
  insert into reminders (task_id, kind, scheduled_at)
  select id, 'ONE_HOUR_BEFORE', due_at - interval '1 hour'
  from created_task
  returning id, task_id
), created_audit as (
  insert into audit_events (actor_id, task_id, action, metadata)
  select author_id, id, 'TASK_CREATED', jsonb_build_object('source', 'SMOKE_TEST')
  from created_task
)
select task_id, id as reminder_id
from created_reminder;

commit;
