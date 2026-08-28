insert into reminders (task_id, kind, scheduled_at)
select
  task.id,
  'OVERDUE_DAILY',
  case
    when (candidate.local_candidate at time zone assignee.time_zone) > anchor.anchor_at
      then candidate.local_candidate at time zone assignee.time_zone
    else (candidate.local_candidate + interval '1 day') at time zone assignee.time_zone
  end
from tasks as task
inner join users as assignee on assignee.id = task.assignee_id
cross join lateral (
  select greatest(task.due_at, now()) as anchor_at
) as anchor
cross join lateral (
  select
    date_trunc('day', anchor.anchor_at at time zone assignee.time_zone)
      + make_interval(hours => assignee.overdue_reminder_hour) as local_candidate
) as candidate
where task.due_at is not null
  and task.status in ('OPEN', 'WAITING')
  and not exists (
    select 1
    from reminders as existing
    where existing.task_id = task.id
      and existing.kind = 'OVERDUE_DAILY'
      and existing.status in ('SCHEDULED', 'PROCESSING')
  )
on conflict do nothing;
