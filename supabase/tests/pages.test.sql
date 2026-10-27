begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Normalisation
select is(public.normalize_url('https://Example.com/Pricing/?utm_source=x&plan=pro#top'), 'https://example.com/Pricing?plan=pro', 'retire suivi, fragment et slash final');
select is(public.normalize_url('https://example.com'), 'https://example.com/', 'racine avec slash');
select is(public.normalize_url('http://www.example.com/a/'), 'http://www.example.com/a', 'garde http et www');
select is(public.normalize_url('https://example.com/?ref=hn&fbclid=1'), 'https://example.com/', 'query vide supprimée');
select throws_ok($$select public.normalize_url('mailto:a@b.c')$$, 'invalid_url', 'refuse mailto');
select throws_ok($$select public.normalize_url('bonjour')$$, 'invalid_url', 'refuse un mot');

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local');

-- Utilisateur A
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is((select is_duplicate from public.add_page('https://a.com/pricing')), false, 'premier ajout');
select is((select is_duplicate from public.add_page('https://A.com/pricing/?utm_medium=x')), true, 'doublon reconnu');
select is((select count(*)::int from public.pages), 1, 'une seule ligne pour A');

-- Utilisateur B
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.pages), 0, 'B ne voit pas les pages de A');
select is((select is_duplicate from public.add_page('https://a.com/pricing')), false, 'B peut ajouter la même URL');

-- Robot
reset role;
set local role service_role;
select is((select count(*)::int from public.claim_pending_pages()), 2, 'réserve les 2 lignes en attente');
select is((select count(*)::int from public.claim_pending_pages()), 0, 'seconde réservation vide');

update public.pages set updated_at = now() - interval '16 minutes'
  where owner_id = '11111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.claim_pending_pages()), 1, 'reprend une ligne processing périmée');
select is((select attempts from public.pages where owner_id = '11111111-1111-1111-1111-111111111111'), 2, 'compte les tentatives');

-- Droits
reset role;
select is(has_function_privilege('anon', 'public.claim_pending_pages(integer)', 'execute'), false, 'anon ne peut pas réserver');
select is(has_function_privilege('authenticated', 'public.claim_pending_pages(integer)', 'execute'), false, 'authenticated ne peut pas réserver');

set local role anon;
select is((select count(*)::int from public.pages), 0, 'anon ne lit rien');
reset role;

select * from finish();
rollback;
