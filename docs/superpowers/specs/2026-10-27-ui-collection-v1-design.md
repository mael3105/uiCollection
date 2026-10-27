# uiCollection v1 : collecte d'URL avec vignette

Date : 2026-10-27
Statut : à valider

## Intention

uiCollection deviendra une bibliothèque d'inspiration documentée : des pages web (accueil, pricing, fiche produit…) analysées et classées, qui alimenteront la génération de sites par des agents. L'analyse détaillée (DESIGN.md via Dembrandt ou designlang, en cours d'évaluation dans `-sandbox/capture`) viendra plus tard.

La v1 sert à **commencer à collecter dès maintenant**, sans attendre l'outil complet, sur une base (Supabase) que les versions suivantes enrichiront au lieu de la remplacer.

Un seul utilisateur, le propriétaire, ajoute environ 10 URL par jour depuis son Mac portable ou son iPhone, dans Chrome ou Safari.

## Objectifs

- Ajouter une URL en un geste depuis Mac et iPhone, Chrome et Safari.
- Chaque ajout concerne **uniquement cette URL**, sans exploration du reste du site.
- Obtenir automatiquement, quelques minutes après l'ajout, une **vignette du haut de la page** et le **nom du site**.
- La vignette est propre : pas de bannière cookies, pas de modale newsletter, offre commerciale ou widget de chat.
- Consulter la bibliothèque : grille de vignettes, recherche par nom ou URL.
- Signaler une URL déjà présente au lieu de la recapturer.

## Hors périmètre de la v1

Prévu pour les versions suivantes, à garder possible dans le modèle de données :

- Taxonomie et attributs : type de site (Portfolio, SaaS, Hospitality, eCommerce, Agence, Corporate…), type de page (Home, Contact, Product, Feature, Pricing…), style global (Tech, Vintage, Luxe, Experimental/WebGL, Authentique…). Ils seront **proposés par l'outil puis corrigés par l'utilisateur**, jamais saisis au moment du partage.
- Analyse DESIGN.md, captures pleine page et mobile.
- Serveur distant 24 h/24 (remplacera ou complétera le robot GitHub Actions).
- Notifications push.

## Anti-objectifs

- N'importe qui, bot ou agent, peut ajouter des URL. (Exigence de l'utilisateur.)
- Une URL partagée est perdue. L'URL doit être enregistrée avant toute capture ; un échec de capture ne doit jamais faire disparaître l'entrée.
- Ajouter une URL exige de remplir un formulaire (taxonomie, notes…).

## Décisions de l'utilisateur

- Page hébergée sur **GitHub Pages**. Que le code soit public n'est pas un problème ; ce qui doit être protégé, c'est l'écriture.
- Données dans **Supabase**, compte existant, **projet dédié `uiCollection`** (pas de partage avec un autre projet).
- Authentification Supabase par **e-mail et mot de passe** (pas de lien magique).
- Capture **déclenchée par Supabase à chaque ajout**, pas par une minuterie.
- La vignette peut arriver après quelques minutes, mais sans popups.
- Doublons signalés, pas recapturés.
- Projet dans `/Users/mael/Documents/perso/projets/uiCollection`.

## Architecture

```
Mac (favori) / iPhone (Raccourci) / champ de la page
        │  ouvre https://<compte>.github.io/uiCollection/?add=<url>
        ▼
Page statique (GitHub Pages) ── supabase-js ──► Supabase
                                                ├─ Auth (e-mail + mot de passe, inscriptions désactivées)
                                                ├─ table pages (RLS : propriétaire uniquement)
                                                ├─ Storage : bucket privé thumbnails
                                                └─ Database Webhook (INSERT, et UPDATE vers status=pending)
                                                        │ POST repository_dispatch
                                                        ▼
                                          GitHub Actions : robot de capture (Playwright)
                                                        │ clé service_role
                                                        └─► met à jour la ligne + dépose la vignette
```

### Dépôt GitHub (public, nommé `uiCollection`)

- `site/` : la page (HTML, CSS, JS sans étape de build). `supabase-js` v2 chargé depuis jsDelivr, version épinglée. Publiée par un workflow GitHub Pages.
- `worker/` : script Node (Node 20, `playwright`) du robot de capture.
- `supabase/` : migrations SQL (table, RLS, bucket, policies) pour que la base soit reproductible.
- `.github/workflows/` : `pages.yml` (publication), `capture.yml` (robot).

Le dépôt public donne des minutes GitHub Actions illimitées. Aucun secret dans le code : la clé `anon` Supabase présente dans la page est publique par nature, la sécurité repose sur la RLS. La clé `service_role` n'existe que dans les secrets GitHub.

### Données : table `pages`

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `owner_id` | uuid | défaut `auth.uid()` |
| `url` | text | URL telle que partagée |
| `url_normalized` | text, unique par propriétaire | sert à détecter les doublons |
| `status` | text | `pending`, `processing`, `ready`, `failed` |
| `site_name` | text, null | |
| `page_title` | text, null | |
| `final_url` | text, null | après redirections |
| `thumbnail_path` | text, null | chemin dans le bucket |
| `capture_warnings` | jsonb | ex. popups non fermées, scroll virtuel |
| `error` | text, null | dernière erreur de capture |
| `attempts` | int | défaut 0 |
| `created_at`, `captured_at`, `updated_at` | timestamptz | |

Normalisation (faite côté page avant l'insertion, et répétée par une fonction SQL pour ne pas dépendre du client) : hôte en minuscules, `www.` conservé, fragment `#…` supprimé, paramètres de suivi supprimés (`utm_*`, `fbclid`, `gclid`, `mc_cid`, `mc_eid`, `ref`), slash final supprimé sauf pour la racine. Le schéma `http` est conservé tel quel.

Taxonomie : pas de colonnes en v1. Elle sera ajoutée par migration le moment venu.

### Sécurité

- Inscriptions désactivées dans Supabase Auth ; l'unique compte est créé à la main dans le tableau de bord.
- RLS sur `pages` : select, insert, update, delete seulement si `owner_id = auth.uid()`.
- Bucket `thumbnails` privé ; lecture limitée au propriétaire, la page affiche les vignettes via des URL signées (générées par lot).
- Le robot utilise `service_role` (contourne la RLS), stockée en secret GitHub.
- Le webhook Supabase appelle l'API GitHub avec un jeton fine-grained limité au dépôt `uiCollection` (permission Contents : lecture et écriture, requise pour `repository_dispatch`).

### Session

Supabase garde la session indéfiniment (renouvellement automatique). Limite connue : Safari efface le stockage d'un site non visité depuis 7 jours, ce qui oblige à se reconnecter ; l'icône sur l'écran d'accueil de l'iPhone n'est pas concernée. Le mot de passe est enregistré dans le trousseau ou le gestionnaire de Chrome.

## Parcours

### Ajouter une URL

Trois entrées, toutes aboutissant à `?add=<url encodée>` :

1. **Favori « + Collection » (Mac, Chrome et Safari)** : `javascript:` qui ouvre la page dans un nouvel onglet avec l'URL courante. L'ouverture d'un onglet, plutôt qu'un appel direct depuis le site visité, évite les blocages de sécurité (CSP) des sites.
2. **Raccourci Apple « Ajouter à uiCollection » (iPhone, menu Partager)** : reçoit une URL, ouvre la page avec `?add=`. Il ouvre Safari, donc la limite des 7 jours s'applique ici.
3. **Champ dans la page** : coller une URL puis Ajouter.

Avec `?add=` :
- Connecté : la page normalise, insère, puis affiche « Ajoutée » et la carte en tête, en statut « en attente ». Le paramètre est retiré de l'adresse pour qu'un rechargement ne réajoute rien.
- Doublon : « Déjà dans la collection » et la carte existante est mise en évidence. Aucune capture relancée.
- Non connecté : écran de connexion, puis l'ajout se fait automatiquement après connexion.
- URL invalide (pas http/https) : message d'erreur, rien n'est inséré.

### Capture

1. Le webhook (INSERT, ou UPDATE quand `status` repasse à `pending`) envoie `repository_dispatch` (`event_type: capture`).
2. Le workflow `capture.yml` (groupe de concurrence unique, sans annulation) traite **toutes** les lignes `pending`, pas seulement celle du déclencheur : les déclenchements rapprochés sont ainsi absorbés et une ligne oubliée est rattrapée au passage suivant. Chaque ligne est réservée de façon atomique (`pending` → `processing`).
3. Par page, profil desktop 1440×900, `fr-FR`, avec la logique éprouvée de `-sandbox/capture/capture.mjs` :
   - chargement (`domcontentloaded`, puis `networkidle` au mieux), attente courte ;
   - **cookies** : clic sur « Refuser » en priorité, sinon « Accepter », dans tous les frames, puis masquage CSS des CMP courantes ;
   - **popups** (nouveau) : touche Échap ; clic sur les boutons de fermeture visibles (rôle bouton ou lien dont le nom ou `aria-label` correspond à fermer, close, ×, non merci, no thanks, plus tard, dismiss) ; masquage des éléments `position: fixed` ou `sticky` qui recouvrent une part importante de la fenêtre avec un `z-index` élevé, hors en-tête de site ; retrait du blocage de défilement (`overflow: hidden` sur `html`/`body`) ; masquage des widgets de chat connus ;
   - court défilement aller-retour pour déclencher les animations d'apparition, attente des polices, nouvelle passe cookies + popups (certaines apparaissent tard) ;
   - capture JPEG qualité 80 de la fenêtre (le haut de page).
4. Nom du site : `og:site_name`, sinon `application-name`, sinon le segment le plus court du `<title>` découpé sur ` | `, ` - `, ` — `, ` · `, sinon le nom d'hôte sans `www.`. `page_title` reçoit le `<title>` complet.
5. Dépôt de la vignette dans `thumbnails/<id>.jpg` (écrasée en cas de recapture), puis ligne → `ready` avec `captured_at`.
6. Échec : une nouvelle tentative dans le même passage ; si elle échoue, `failed` avec le message d'erreur. Délai maximal par page : 90 s.

Délai attendu entre l'ajout et la vignette : environ 2 à 3 minutes (démarrage du robot et du navigateur). Le navigateur Playwright est mis en cache entre deux passages.

### Consulter

- Grille de cartes, les plus récentes en premier : vignette, nom du site, URL (lien vers le site, nouvel onglet), date d'ajout, pastille de statut (« en attente », « capture en cours », « prête », « échec » avec le message).
- Recherche instantanée sur nom du site, titre et URL.
- Mise à jour en direct via Supabase Realtime : une carte passe de « en attente » à « prête » sans recharger la page. C'est la « notification » de la v1.
- Par carte : « Refaire la capture » (remet `pending`, vide `error`) et « Supprimer » (avec confirmation dans la page, supprime aussi la vignette).
- Fonctionne à 400 px de large et en mode sombre.

## Mise en place (étapes manuelles du propriétaire, guidées)

Le constructeur ne peut pas agir dans les consoles ; il prépare les fichiers et fournit une liste pas à pas :

1. Créer le projet Supabase dédié `uiCollection` (le plan gratuit limite à 2 projets actifs : en mettre un autre en pause si besoin), exécuter les migrations, désactiver les inscriptions, créer le compte utilisateur.
2. Créer le dépôt GitHub `uiCollection`, activer Pages (source : GitHub Actions), ajouter les secrets `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`.
3. Créer le jeton fine-grained et configurer le Database Webhook dans Supabase.
4. Installer le favori (Mac, Chrome et Safari) et le Raccourci (iPhone), ajouter la page à l'écran d'accueil.

## Risques connus

- **Mise en veille Supabase** : un projet gratuit inactif 7 jours est mis en pause, et l'ajout échouerait. Parade : un workflow hebdomadaire qui fait une requête de lecture. (C'est la seule minuterie, elle ne sert pas à la capture.)
- Popups : la fermeture est au mieux. Le bouton « Refaire la capture » et `capture_warnings` permettent de repérer les cas résistants.
- Protections anti-bot : certains sites refuseront le navigateur automatisé depuis les IP de GitHub ; la carte passe en « échec », l'URL reste conservée.
- Le webhook peut échouer silencieusement (GitHub indisponible, jeton expiré) : la ligne reste `pending` et sera rattrapée par la capture suivante ou par « Refaire la capture ». Le jeton fine-grained a une date d'expiration à surveiller.

## Laissé au constructeur

Design visuel de la page, structure du code, messages d'interface (en français), choix exact des sélecteurs de popups, tests du robot.

## Choix faits par Claude (à vérifier)

- Connexion obligatoire même pour consulter (pas de lecture publique).
- Vignette desktop seulement en v1 (pas de mobile).
- Favori qui ouvre un nouvel onglet plutôt que de remplacer la page visitée.
- Ajout d'un bouton « Supprimer », non demandé explicitement.
- Liste des paramètres de suivi supprimés à la normalisation.
- Workflow hebdomadaire anti-mise en veille.
- Page sans framework ni étape de build.
