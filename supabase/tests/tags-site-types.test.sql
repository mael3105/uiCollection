begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values ('5a5a5a5a-0000-4000-8000-000000000029', 'tags@test.local');

set local role authenticated;
set local request.jwt.claims to '{"sub":"5a5a5a5a-0000-4000-8000-000000000029","role":"authenticated"}';
select public.add_page('https://stripe.com/');

select is((select tags from public.pages), '{}'::text[], 'une nouvelle page n''a pas de tag');
update public.pages set tags = array['grille', 'dégradé'];
select is((select tags from public.pages), array['grille', 'dégradé'], 'le propriétaire pose plusieurs tags');
select throws_ok($$update public.pages set tags = (select array_agg('t' || i) from generate_series(1, 31) i)$$, '23514', null, 'tags limités à 30');
select throws_ok($$update public.pages set tags = array[repeat('x', 41)]$$, '23514', null, 'un tag fait au plus 40 caractères');
reset role;

select * from finish();
rollback;
