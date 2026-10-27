# Mise en place d'uiCollection

À faire une seule fois, dans l'ordre. Les commandes se lancent depuis la racine du projet.

## 1. Supabase

- [ ] Créer le projet **uiCollection** sur [supabase.com/dashboard](https://supabase.com/dashboard). Le plan gratuit limite à 2 projets actifs : en mettre un en pause si besoin. Noter le mot de passe de la base.
- [ ] Relier le projet et appliquer le schéma :
  ```
  npx supabase login
  npx supabase link --project-ref <référence du projet>
  npx supabase db push
  ```
  La référence est dans l'URL du tableau de bord : `supabase.com/dashboard/project/<référence>`.
- [ ] **Authentication → Sign In / Providers** : laisser « Email » activé, **désactiver « Allow new users to sign up »**.
- [ ] **Authentication → Users → Add user → Create new user** : ton e-mail, ton mot de passe, cocher « Auto Confirm User ».
- [ ] **Project Settings → API** : noter l'URL du projet, la clé `anon` (publique) et la clé `service_role` (secrète).

## 2. GitHub

- [ ] Créer sur github.com un dépôt **public** vide nommé `uiCollection` (sans README).
- [ ] Pousser le code :
  ```
  git remote add origin git@github.com:mael3105/uiCollection.git
  git push -u origin main
  ```
- [ ] **Settings → Pages → Build and deployment → Source : GitHub Actions**.
- [ ] **Settings → Secrets and variables → Actions → New repository secret** :
  - `SUPABASE_URL` : l'URL du projet
  - `SUPABASE_SERVICE_ROLE_KEY` : la clé `service_role`
- [ ] Dans `site/config.js`, remplacer les deux valeurs par l'URL du projet et la clé `anon`, puis commit et push. La page est publiée sur `https://mael3105.github.io/uiCollection/`.

## 3. Déclenchement du robot par Supabase

- [ ] Créer un jeton sur [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new) :
  - Repository access : **Only select repositories → uiCollection**
  - Permissions → Repository permissions → **Contents : Read and write**
  - Noter sa date d'expiration : à son expiration, les captures ne se lancent plus.
- [ ] Dans Supabase, **SQL Editor**, exécuter :
  ```sql
  select vault.create_secret('mael3105/uiCollection', 'github_repo');
  select vault.create_secret('<le jeton>', 'github_dispatch_token');
  ```
  Pour remplacer le jeton plus tard : `select vault.update_secret((select id from vault.secrets where name = 'github_dispatch_token'), '<nouveau jeton>');`

## 4. Ajouter des pages

### Mac : favori « + Collection » (Chrome et Safari)

Adresse du favori :

```
javascript:(()=>{window.open('https://mael3105.github.io/uiCollection/?add='+encodeURIComponent(location.href),'_blank')})()
```

- **Chrome** : clic droit sur la barre de favoris → Ajouter une page → nom « + Collection », URL : l'adresse ci-dessus.
- **Safari** : ajouter n'importe quelle page aux favoris (barre des favoris), puis clic droit → Modifier l'adresse → coller l'adresse ci-dessus, renommer « + Collection ».

Un clic ouvre uiCollection dans un nouvel onglet et ajoute la page en cours.

### iPhone : Raccourci « Ajouter à uiCollection » (Safari et Chrome)

Dans l'app Raccourcis → **+** :

1. Toucher ⓘ → activer **Afficher dans la feuille de partage**, type d'entrée : **URL**.
2. Action **Encoder en URL**, entrée : *Entrée du raccourci*.
3. Action **Texte** : `https://mael3105.github.io/uiCollection/?add=` suivi de la variable *Texte encodé*.
4. Action **Ouvrir les URL**, entrée : *Texte*.
5. Nommer le raccourci « Ajouter à uiCollection ».

Il apparaît dans le menu Partager de Safari et de Chrome. Le Raccourci s'affiche aussi sur le Mac via iCloud.

### iPhone : icône sur l'écran d'accueil

Ouvrir la page dans Safari → Partager → **Sur l'écran d'accueil**. Depuis cette icône, la session ne s'efface pas après 7 jours sans visite.

## Vérifier

- Ajouter une page : la carte apparaît « en attente », puis « prête » avec sa vignette en 2 à 3 minutes.
- **Actions** du dépôt : un passage « Capture des pages » déclenché par `repository_dispatch`.
- Lancer « Maintien du projet Supabase » à la main une fois (Actions → Run workflow) : il doit réussir.
