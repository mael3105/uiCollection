# uiCollection v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une page privée (connexion) sur GitHub Pages où l'on ajoute des URL ; Supabase les stocke et déclenche un robot GitHub Actions qui capture le haut de page sans popups et renseigne le nom du site.

**Architecture:** Toute la logique de données vit dans Postgres (normalisation, doublons, réservation des tâches, déclenchement du robot via `pg_net`), testée en pgTAP sur un Supabase local. Le robot (`worker/`) est un script Node + Playwright qui réserve les lignes `pending`, capture, dépose la vignette dans Storage et met à jour la ligne. La page (`site/`) est du HTML/JS sans build, qui parle à Supabase avec la clé `anon` sous RLS.

**Tech Stack:** Postgres/Supabase (Auth, Storage, Realtime, pg_net, Vault), pgTAP via Supabase CLI, Node 20+, Playwright (Chromium), `@supabase/supabase-js` v2, Vitest, GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-27-ui-collection-v1-design.md`

## Global Constraints

- Racine du projet : `/Users/mael/Documents/perso/projets/uiCollection`. Dépôt GitHub public `uiCollection` ; compte supposé `mael3105` (vu dans `gh`), donc page sur `https://mael3105.github.io/uiCollection/`.
- Textes d'interface et messages d'erreur en **français**.
- Aucun secret dans le dépôt. Seule la clé `anon` et l'URL Supabase sont dans `site/config.js`. `service_role` uniquement en secret GitHub ; jeton GitHub uniquement dans Vault Supabase.
- `supabase-js` côté page chargé depuis jsDelivr en ESM, version exacte épinglée : `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm`. Même version en dépendance npm du robot.
- Statuts : exactement `pending`, `processing`, `ready`, `failed`. Libellés : « en attente », « capture en cours », « prête », « échec ».
- Capture : profil desktop 1440×900, locale `fr-FR`, JPEG qualité 80, fenêtre visible uniquement. 90 s max par page, 2 essais par passage.
- Vignette stockée à `thumbnails/<id>.jpg` (bucket privé `thumbnails`), écrasée en cas de recapture.
- Paramètres de suivi retirés à la normalisation : `utm_*`, `fbclid`, `gclid`, `mc_cid`, `mc_eid`, `ref`.
- Prérequis local : Docker Desktop lancé (pour `supabase start`), `gh auth login` refait (le jeton actuel est invalide).
- Commits Conventional Commits (`feat:`, `chore:`, `test:`…).

## Review Focus

1. **Même page partagée avec un suffixe différent** (`?utm_source=…`, `#section`, slash final, majuscules dans l'hôte) → reconnue comme doublon, aucune nouvelle capture. Test : Task 1, `normalize_url` + `add_page` doublon.
2. **Session expirée au moment d'un partage `?add=`** → l'URL survit à l'écran de connexion et est ajoutée juste après. Test : Task 4, `takePendingAdd`.
3. **Rafale d'ajouts (10 URL en une minute) ou robot planté en cours de route** → chaque ligne capturée une seule fois ; une ligne restée `processing` plus de 15 min est reprise. Test : Task 1, `claim_pending_pages` (seconde réservation vide, reprise des lignes périmées).
4. **Site qui bloque le robot ou expire** → carte « échec » avec message, URL conservée, « Refaire la capture » relance. Test : Task 3, `processPage` avec capture qui échoue deux fois.
5. **Popup plein écran sans bouton de fermeture, ou en-tête collant du site** → la popup est masquée, l'en-tête du site reste visible. Test : Task 2, fixtures `overlay-no-button.html` et `sticky-header.html`.

---

## File Structure

```
uiCollection/
├── package.json                 # type: module ; scripts test, db:test ; devDeps vitest, supabase, playwright
├── .gitignore                   # node_modules, .env, supabase/.branches, supabase/.temp
├── supabase/
│   ├── config.toml              # généré par `supabase init`
│   ├── migrations/20261027000000_pages.sql   # table, fonctions, RLS, storage, realtime, trigger
│   └── tests/pages.test.sql     # pgTAP
├── worker/
│   ├── src/site-name.js         # extractSiteName (pur)
│   ├── src/clean-page.js        # dismissConsent, dismissPopups (Playwright)
│   ├── src/capture-page.js      # capturePage
│   ├── src/process-page.js      # processPage (orchestration, dépendances injectées)
│   ├── src/main.js              # point d'entrée du workflow
│   └── test/…                   # *.test.js + fixtures/*.html
├── site/
│   ├── index.html, styles.css, app.js, config.js
│   └── lib/add-param.js, lib/pending-add.js, lib/filter-pages.js
│   └── test/…                   # *.test.js (Vitest, environnement node)
├── .github/workflows/pages.yml, capture.yml, keepalive.yml
└── SETUP.md                     # mise en place pas à pas + favori + Raccourci
```

---

### Task 0: Dépôt et outillage

**Files:**
- Create: `package.json`, `.gitignore`, `supabase/config.toml` (via CLI)

**Interfaces:**
- Produces: scripts `npm test` (Vitest sur `worker/test` et `site/test`), `npm run db:test` (`supabase test db`).

- [ ] **Step 1:** `git init` dans la racine ; créer `package.json` (`"type": "module"`, `"engines": {"node": ">=20"}`), devDependencies `vitest`, `supabase`, `playwright`, `@supabase/supabase-js@2.45.4` ; `npm install` ; `npx playwright install chromium`.
- [ ] **Step 2:** `npx supabase init` puis `npx supabase start`. Expected : URL API locale et clés `anon`/`service_role` affichées.
- [ ] **Step 3:** `npm test` → Vitest démarre sans test trouvé (sortie « No test files found », code acceptable via `--passWithNoTests`).
- [ ] **Step 4: Commit** `chore: initialise le dépôt uiCollection` (inclut le spec et ce plan déjà présents dans `docs/`).

---

### Task 1: Schéma Postgres

**Files:**
- Create: `supabase/migrations/20261027000000_pages.sql`
- Test: `supabase/tests/pages.test.sql`

**Interfaces:**
- Produces :
  - table `public.pages` (colonnes du spec ; `status text not null default 'pending' check (status in (...))`, `capture_warnings jsonb not null default '[]'`, `attempts int not null default 0`, `owner_id uuid not null default auth.uid() references auth.users on delete cascade`), index unique `(owner_id, url_normalized)`.
  - `public.normalize_url(p_url text) returns text` immutable ; lève `invalid_url` si ce n'est pas `http(s)://hôte…`.
  - trigger BEFORE INSERT OR UPDATE OF url : `url_normalized := normalize_url(url)`.
  - `public.add_page(p_url text) returns table(id uuid, is_duplicate boolean)` security invoker, pour le client.
  - `public.claim_pending_pages(p_limit int default 20) returns setof public.pages` security definer, `execute` réservé à `service_role`.
  - trigger AFTER INSERT OR UPDATE OF status, `when (new.status = 'pending')` : `net.http_post` vers `https://api.github.com/repos/<github_repo>/dispatches`, corps `{"event_type":"capture","client_payload":{"id":"<id>"}}`, en-têtes `Authorization: Bearer <github_dispatch_token>`, `Accept: application/vnd.github+json`, `User-Agent: uiCollection`. Les deux valeurs lues dans `vault.decrypted_secrets` (noms `github_repo`, `github_dispatch_token`) ; si l'une manque, ne rien faire.
  - RLS sur `pages` : 4 policies `owner_id = auth.uid()` pour `authenticated`.
  - bucket `thumbnails` (privé) ; policies `select` et `delete` sur `storage.objects` pour `authenticated` quand `bucket_id = 'thumbnails'` et qu'une ligne `pages` avec `id::text = split_part(name, '.', 1)` appartient à `auth.uid()`.
  - `alter publication supabase_realtime add table public.pages`.

- [ ] **Step 1: Écrire les tests pgTAP** dans `pages.test.sql` (créer deux utilisateurs de test dans `auth.users`, simuler la session avec `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>"}'`) :

```sql
select is(normalize_url('https://Example.com/Pricing/?utm_source=x&plan=pro#top'), 'https://example.com/Pricing?plan=pro');
select is(normalize_url('https://example.com'), 'https://example.com/');
select is(normalize_url('http://www.example.com/a/'), 'http://www.example.com/a');
select is(normalize_url('https://example.com/?ref=hn&fbclid=1'), 'https://example.com/');
select throws_ok($$select normalize_url('mailto:a@b.c')$$, 'invalid_url');
select throws_ok($$select normalize_url('bonjour')$$, 'invalid_url');
-- en tant qu'utilisateur A
select is((select is_duplicate from add_page('https://a.com/pricing')), false);
select is((select is_duplicate from add_page('https://A.com/pricing/?utm_medium=x')), true);
select is((select count(*)::int from pages), 1);
-- en tant qu'utilisateur B : ne voit rien de A, peut ajouter la même URL pour lui
select is((select count(*)::int from pages), 0);
select is((select is_duplicate from add_page('https://a.com/pricing')), false);
-- en tant que service_role : 2 lignes pending
select is((select count(*)::int from claim_pending_pages()), 2);
select is((select count(*)::int from claim_pending_pages()), 0);
-- une ligne processing dont updated_at < now() - interval '15 minutes' est reprise
update pages set updated_at = now() - interval '16 minutes' where url = 'https://a.com/pricing' and owner_id = '<A>';
select is((select count(*)::int from claim_pending_pages()), 1);
select is((select attempts from pages where owner_id = '<A>'), 2);
-- anon ne peut ni lire ni appeler claim
select throws_ok($$set local role anon; select claim_pending_pages()$$, '42501');
```

- [ ] **Step 2:** `npm run db:test` → FAIL (fonctions absentes).
- [ ] **Step 3: Écrire la migration.** `claim_pending_pages` : un seul `update … where id in (select id from pages where status = 'pending' or (status = 'processing' and updated_at < now() - interval '15 minutes') order by created_at for update skip locked limit p_limit) returning *`, qui pose `status = 'processing'`, `attempts = attempts + 1`, `updated_at = now()`. `add_page` : `insert … on conflict (owner_id, url_normalized) do nothing`, puis renvoie l'`id` existant ou nouveau et `is_duplicate`. Trigger `updated_at = now()` sur tout UPDATE (sauf quand `claim` le pose déjà).
- [ ] **Step 4:** `npx supabase db reset && npm run db:test` → tous les tests PASS. Vérifier aussi qu'un INSERT sans secrets Vault ne lève pas d'erreur (couvert par les `add_page` ci-dessus).
- [ ] **Step 5: Commit** `feat: schéma pages, normalisation et réservation des captures`.

---

### Task 2: Nettoyage de page (cookies et popups)

**Files:**
- Create: `worker/src/clean-page.js`, `worker/src/site-name.js`
- Test: `worker/test/clean-page.test.js`, `worker/test/site-name.test.js`, `worker/test/fixtures/{cookie-banner,newsletter-modal,overlay-no-button,sticky-header,late-popup}.html`

**Interfaces:**
- Produces :
  - `dismissConsent(page) -> Promise<'refus' | 'acceptation' | null>` (logique et regex `REFUSE`/`ACCEPT` reprises de `-sandbox/capture/capture.mjs`, avec injection de `HIDE_CSS`).
  - `dismissPopups(page) -> Promise<string[]>` : renvoie des avertissements en français (ex. `"popup masquée sans bouton de fermeture"`).
  - `cleanPage(page) -> Promise<{ consent, warnings }>` : consent → popups → défilement aller-retour court → `document.fonts.ready` → seconde passe consent + popups.
  - `extractSiteName({ ogSiteName, applicationName, title, hostname }) -> string`.

- [ ] **Step 1: Tests `extractSiteName`** :

```js
expect(extractSiteName({ ogSiteName: 'Stripe', title: 'Pricing | Stripe', hostname: 'stripe.com' })).toBe('Stripe')
expect(extractSiteName({ applicationName: 'Linear', title: 'x', hostname: 'linear.app' })).toBe('Linear')
expect(extractSiteName({ title: 'Tarifs et forfaits complets — Notion', hostname: 'www.notion.so' })).toBe('Notion')
expect(extractSiteName({ title: 'Hôtel Particulier · Accueil', hostname: 'h.fr' })).toBe('Accueil') // segment le plus court
expect(extractSiteName({ title: '', hostname: 'www.aesop.com' })).toBe('aesop.com')
expect(extractSiteName({ ogSiteName: '  ', title: 'Seul titre', hostname: 'a.fr' })).toBe('Seul titre')
```

- [ ] **Step 2: Tests Playwright** (Chromium lancé une fois par fichier, fixtures ouvertes en `file://`) :
  - `cookie-banner.html` (boutons « Tout accepter » et « Tout refuser ») → `dismissConsent` renvoie `'refus'`, la bannière n'est plus visible.
  - `newsletter-modal.html` (modale fixe plein écran, bouton `aria-label="Fermer"`, `body { overflow: hidden }`) → après `dismissPopups`, la modale est invisible et `getComputedStyle(document.body).overflow !== 'hidden'`.
  - `overlay-no-button.html` (div fixe 80 % de la fenêtre, `z-index: 9999`, aucun bouton) → invisible ; avertissement non vide.
  - `sticky-header.html` (header `position: sticky; top: 0; height: 80px` contenant un lien « Fermer le menu » non visible) → le header reste visible.
  - `late-popup.html` (modale insérée après 1,5 s) → après `cleanPage`, invisible.
- [ ] **Step 3:** `npm test -- worker` → FAIL.
- [ ] **Step 4: Implémenter.** Fermeture : Échap, puis boutons/liens visibles dont le nom accessible correspond à `/(fermer|close|×|✕|non merci|no thanks|plus tard|later|dismiss)/i`, dans tous les frames. Masquage : éléments `position: fixed|sticky` dont la boîte couvre ≥ 30 % de la fenêtre **et** `z-index ≥ 100`, en excluant les éléments `header`, `nav`, `[role=banner]` et ceux de hauteur ≤ 25 % ancrés en haut. Puis `overflow` remis à `auto` sur `html` et `body` si `hidden`. Ajouter à `HIDE_CSS` : `#hubspot-messages-iframe-container, .drift-frame-controller, #tidio-chat, .zsiq_floatmain`.
- [ ] **Step 5:** `npm test -- worker` → PASS.
- [ ] **Step 6: Commit** `feat(worker): fermeture des cookies et popups`.

---

### Task 3: Capture et traitement d'une ligne

**Files:**
- Create: `worker/src/capture-page.js`, `worker/src/process-page.js`, `worker/src/main.js`
- Test: `worker/test/capture-page.test.js`, `worker/test/process-page.test.js`

**Interfaces:**
- Consumes : `cleanPage`, `extractSiteName` (Task 2) ; RPC `claim_pending_pages` (Task 1).
- Produces :
  - `capturePage(browser, url, { timeoutMs = 90000 } = {}) -> Promise<{ jpeg: Buffer, siteName, pageTitle, finalUrl, warnings: string[] }>` ; contexte neuf par appel, fermé en `finally`.
  - `processPage(row, { capture, upload, update, maxAttempts = 2 }) -> Promise<'ready' | 'failed'>` où `capture(url)` = `capturePage` lié, `upload(path, buffer)`, `update(id, fields)`.
  - `main()` : lit `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` ; appelle `claim_pending_pages` en boucle jusqu'à liste vide ; traite séquentiellement ; `upload` = `storage.from('thumbnails').upload('<id>.jpg', buf, { upsert: true, contentType: 'image/jpeg' })`.

- [ ] **Step 1: Test `capturePage`** sur `newsletter-modal.html` servie en `file://` : `jpeg` commence par `0xFF 0xD8`, `pageTitle` = le `<title>` de la fixture, `siteName` = son `og:site_name`.
- [ ] **Step 2: Tests `processPage`** avec fakes :
  - succès → `upload` appelé avec `('<id>.jpg', buffer)`, `update` appelé une fois avec `{ status: 'ready', site_name, page_title, final_url, thumbnail_path: '<id>.jpg', capture_warnings, error: null, captured_at: <ISO> }`, renvoie `'ready'`.
  - `capture` échoue puis réussit → `capture` appelé 2 fois, renvoie `'ready'`.
  - `capture` échoue 2 fois avec `new Error('net::ERR_BLOCKED\nstack…')` → aucun `upload`, `update` avec `{ status: 'failed', error: 'net::ERR_BLOCKED' }`, renvoie `'failed'`.
  - `upload` échoue → `'failed'`, l'erreur est enregistrée.
- [ ] **Step 3:** `npm test -- worker` → FAIL.
- [ ] **Step 4: Implémenter** les trois fichiers (logique de navigation de `capture.mjs` : `domcontentloaded`, `networkidle` au mieux 10 s, 1,5 s d'attente, `cleanPage`, capture fenêtre `{ type: 'jpeg', quality: 80, animations: 'disabled' }`).
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6: Vérification locale de bout en bout** : `insert into pages(owner_id, url)` en SQL sur le Supabase local avec une vraie URL (ex. `https://linear.app/pricing`), puis `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node worker/src/main.js`. Expected : la ligne passe à `ready`, l'objet `thumbnails/<id>.jpg` existe (Studio local), l'image ne montre ni bannière ni popup.
- [ ] **Step 7: Commit** `feat(worker): capture et mise à jour des pages`.

---

### Task 4: La page

**Files:**
- Create: `site/index.html`, `site/styles.css`, `site/app.js`, `site/config.js`, `site/lib/add-param.js`, `site/lib/pending-add.js`, `site/lib/filter-pages.js`
- Test: `site/test/add-param.test.js`, `site/test/pending-add.test.js`, `site/test/filter-pages.test.js`

**Interfaces:**
- Consumes : `add_page`, table `pages`, bucket `thumbnails` (Task 1).
- Produces :
  - `readAddParam(href: string) -> string | null`, `stripAddParam(href: string) -> string`, `isHttpUrl(value: string) -> boolean`.
  - `savePendingAdd(storage, url) -> void`, `takePendingAdd(storage) -> string | null` (lit puis efface la clé `uicollection.pendingAdd` ; toute exception de stockage → `null`/no-op).
  - `filterPages(pages, query) -> pages` : insensible à la casse et aux accents, sur `site_name`, `page_title`, `url` ; requête vide → tout.
  - `site/config.js` exporte `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

- [ ] **Step 1: Tests** :

```js
expect(readAddParam('https://x.io/uiCollection/?add=https%3A%2F%2Fa.com%2Fp%3Fq%3D1')).toBe('https://a.com/p?q=1')
expect(readAddParam('https://x.io/uiCollection/')).toBe(null)
expect(stripAddParam('https://x.io/uiCollection/?add=abc')).toBe('https://x.io/uiCollection/')
expect(isHttpUrl('https://a.com')).toBe(true); expect(isHttpUrl('mailto:a@b.c')).toBe(false); expect(isHttpUrl('a.com')).toBe(false)
// pending-add avec un faux storage {getItem,setItem,removeItem}
savePendingAdd(s, 'https://a.com'); expect(takePendingAdd(s)).toBe('https://a.com'); expect(takePendingAdd(s)).toBe(null)
expect(takePendingAdd({ getItem() { throw new Error() } })).toBe(null)
expect(filterPages(rows, 'hotel').map(r => r.id)).toEqual(['h1'])   // rows[h1].site_name = 'Hôtel Particulier'
expect(filterPages(rows, '').length).toBe(rows.length)
```

- [ ] **Step 2:** `npm test -- site` → FAIL ; **Step 3:** implémenter `site/lib/*` ; **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Construire la page** (`app.js`, `index.html`, `styles.css`), avec le skill `frontend-design:frontend-design` pour le visuel :
  - non connecté : formulaire e-mail + mot de passe (`autocomplete="email"` / `"current-password"`), `signInWithPassword` ; si `?add=` présent, `savePendingAdd(sessionStorage, url)` avant d'afficher le formulaire.
  - connecté : `takePendingAdd` puis `readAddParam` ; si une URL est trouvée : `history.replaceState` avec `stripAddParam`, `isHttpUrl` sinon message « Cette adresse n'est pas une URL web (http ou https). », puis `rpc('add_page')` → toast « Ajoutée » ou « Déjà dans la collection » + carte existante mise en évidence et amenée à l'écran.
  - champ « Coller une URL » + bouton « Ajouter », même chemin.
  - grille triée `created_at desc`, vignettes via `createSignedUrls` par lot (durée 1 h), recherche via `filterPages`, pastilles de statut (libellés des Global Constraints), message d'erreur affiché sur les cartes `failed`.
  - Realtime : `channel('pages').on('postgres_changes', { event: '*', schema: 'public', table: 'pages' })` met à jour la carte concernée.
  - « Refaire la capture » : `update({ status: 'pending', error: null })`. « Supprimer » : confirmation dans la carte (« Supprimer définitivement ? » Oui / Annuler), puis `storage.remove(['<id>.jpg'])` et `delete`.
  - bouton « Se déconnecter ». 400 px de large et mode sombre (`prefers-color-scheme`).
- [ ] **Step 6: Vérification locale** : `site/config.js` pointé sur le Supabase local, créer un utilisateur dans Studio, `npx serve site`. Avec Playwright MCP ou à la main : ouvrir `/?add=https%3A%2F%2Flinear.app%2Fpricing` non connecté → se connecter → la carte apparaît « en attente » et l'URL de la barre n'a plus `?add=` ; relancer avec `?utm_source=x` → « Déjà dans la collection » ; lancer `node worker/src/main.js` → la carte passe à « prête » sans recharger, vignette visible ; « Refaire la capture » → « en attente » ; « Supprimer » → carte retirée. Capture d'écran à 400 px et en sombre.
- [ ] **Step 7: Commit** `feat(site): page de collection`.

---

### Task 5: Workflows, mise en place et mise en ligne

**Files:**
- Create: `.github/workflows/pages.yml`, `.github/workflows/capture.yml`, `.github/workflows/keepalive.yml`, `SETUP.md`
- Modify: `site/config.js` (valeurs du projet distant)

**Interfaces:**
- Consumes : `worker/src/main.js` (Task 3), `site/` (Task 4), migration (Task 1).

- [ ] **Step 1: Workflows.**
  - `pages.yml` : sur push `main` touchant `site/**`, `actions/upload-pages-artifact` du dossier `site`, puis `actions/deploy-pages`.
  - `capture.yml` : `on: repository_dispatch: types: [capture]` et `workflow_dispatch` ; `concurrency: { group: capture, cancel-in-progress: false }` ; Node 20, `npm ci`, cache `~/.cache/ms-playwright` sur la clé de version Playwright, `npx playwright install --with-deps chromium`, `node worker/src/main.js` avec les secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` ; `timeout-minutes: 30`.
  - `keepalive.yml` : `schedule: cron '0 6 * * 1'` + `workflow_dispatch` ; une requête `curl` en lecture sur `$SUPABASE_URL/rest/v1/pages?select=id&limit=1` avec la clé `service_role`.
- [ ] **Step 2: `SETUP.md`**, liste pas à pas en français, une case par action du propriétaire, dans l'ordre du spec (projet Supabase dédié + `npx supabase link` + `npx supabase db push` ; désactiver les inscriptions ; créer l'utilisateur ; `gh repo create uiCollection --public --source . --push` ; Pages source « GitHub Actions » ; secrets ; jeton fine-grained limité au dépôt avec Contents en lecture et écriture ; les deux secrets Vault `github_repo` = `mael3105/uiCollection` et `github_dispatch_token` ; le favori ; le Raccourci ; l'ajout à l'écran d'accueil). Inclure le favori exact :

```
javascript:(()=>{window.open('https://mael3105.github.io/uiCollection/?add='+encodeURIComponent(location.href),'_blank')})()
```

  et le Raccourci : « Recevoir URL depuis Feuille de partage » → « Encoder en URL » → « Ouvrir les URL » `https://mael3105.github.io/uiCollection/?add=<URL encodée>`.
- [ ] **Step 3: Commit** `chore: workflows et guide de mise en place`.
- [ ] **Step 4: Mise en place avec le propriétaire** : dérouler `SETUP.md` ensemble (les étapes console sont les siennes), mettre à jour `site/config.js`, commit `chore: configuration du projet Supabase`, push.
- [ ] **Step 5: Vérification en ligne** : depuis le Mac, favori sur une vraie page → carte « en attente » puis « prête » en moins de 5 min ; `gh run list --workflow capture.yml` montre un run déclenché par `repository_dispatch` ; depuis l'iPhone, Raccourci depuis Safari et Chrome → même résultat. Lancer `keepalive.yml` à la main → succès.

---

## Self-Review

- Couverture du spec : ajout (Tasks 1, 4, 5), doublons (1, 4), capture sans popups (2, 3), nom du site (2), déclenchement par Supabase (1, 5), échecs et reprise (1, 3, 4), consultation, recherche, temps réel, suppression (4), sécurité RLS, bucket privé, inscriptions désactivées (1, 5), anti-veille (5), session et Raccourci (4, 5).
- Écart assumé par rapport au spec : la normalisation n'est faite **que** dans Postgres (via `add_page`), pas aussi dans la page. Une seule implémentation évite deux règles divergentes ; le comportement visible est identique.
- Le déclencheur est un trigger SQL `pg_net` dans la migration plutôt qu'un webhook configuré dans le tableau de bord : même mécanisme sous le capot, mais versionné et reproductible.
