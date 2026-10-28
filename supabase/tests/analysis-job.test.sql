begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'c@test.local');

set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select public.add_page('https://linear.app/pricing');

select is((select job from public.pages), 'capture', 'une nouvelle page attend une capture complète');
update public.pages set status = 'pending', job = 'analysis';
select is((select job from public.pages), 'analysis', 'le propriétaire demande une analyse seule');
select throws_ok($$update public.pages set job = 'autre'$$, '23514', null, 'seuls capture et analysis sont acceptés');
reset role;

select * from finish();
rollback;
