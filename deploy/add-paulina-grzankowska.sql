-- Idempotentne dodanie Pauliny Grzankowskiej jako użytkownika firmowego
insert into users (
  id,
  email,
  first_name,
  last_name,
  is_active,
  created_at,
  updated_at
)
values (
  gen_random_uuid(),
  'paulina.grzankowska@dpkomis.pl',
  'Paulina',
  'Grzankowska',
  false,
  now(),
  now()
)
on conflict (email) do update
set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  updated_at = now();

insert into user_roles (user_id, role_id)
select u.id, r.id
from users u
cross join roles r
where u.email = 'paulina.grzankowska@dpkomis.pl'
  and r.key = 'COMPANY_MEMBER'
on conflict do nothing;
