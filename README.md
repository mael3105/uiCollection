# uiCollection

Bibliothèque d'inspiration : on partage l'URL d'une page, un robot en fait une vignette (haut de page, sans bannière cookies ni popup) et retrouve le nom du site.

- Page en ligne : https://mael3105.github.io/uiCollection/
- Mise en service (Supabase, GitHub, favori, Raccourci iOS) : [SETUP.md](SETUP.md)

## Travailler en local

Prérequis : Node 20+, Docker Desktop lancé, `npm install` une fois.

```bash
npm run db:start        # Supabase local (Docker) — Studio sur http://127.0.0.1:54323
npm run dev             # la page sur http://localhost:4173
npm run capture:local   # capture les pages en attente, puis s'arrête
npm run db:stop         # arrête Supabase local (les données sont conservées)
```

Servie depuis `localhost`, la page utilise automatiquement la base locale (voir `site/config.js`) ; en ligne, le projet Supabase distant. Les données locales sont séparées des données en ligne.

En local, rien ne déclenche la capture : après avoir ajouté des URL, lancez `npm run capture:local`.

**Compte de connexion local.** Les inscriptions sont fermées : créez un utilisateur dans Studio → Authentication → Add user (cocher « Auto Confirm User »). Un `npx supabase db reset` efface la base locale, utilisateurs compris.

## Mettre à jour le schéma en ligne

Chaque fichier de `supabase/migrations/` s'applique une fois au projet distant, **avant** de pousser le code qui s'en sert : coller son contenu dans le SQL Editor de Supabase, ou lancer `npx supabase db push` depuis un Terminal connecté (`npx supabase login`, puis `npx supabase link`).

## Tests

```bash
npm test          # Vitest : robot (Playwright) et utilitaires de la page
npm run db:test   # pgTAP : schéma, RLS, file d'attente (Supabase local requis)
```

## Organisation

- `site/` — la page (HTML/JS sans build), publiée sur GitHub Pages par `.github/workflows/pages.yml`.
- `supabase/migrations/` — schéma, RLS, déclencheur qui appelle GitHub à chaque ajout ; `supabase/tests/` — tests pgTAP.
- `worker/` — robot de capture, lancé par `.github/workflows/capture.yml`.
- `.github/workflows/keepalive.yml` — ping hebdomadaire pour que le projet Supabase gratuit ne soit pas mis en pause.
