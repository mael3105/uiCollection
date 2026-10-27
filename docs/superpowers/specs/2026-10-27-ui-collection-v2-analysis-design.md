# uiCollection v2 — analyse, DESIGN.md, piles par site, fiche détaillée

Demande (27/10/2026) : préparer la génération d'un DESIGN.md et les données qui enrichissent chaque URL ; empiler les pages d'un même site ; un bouton sur la capture pour ouvrir le site, le clic sur la carte ouvrant la fiche d'analyse ; la fiche permet d'éditer les infos ; des idées pour partager une sélection à des agents.

La personne a laissé avancer sans questions : chaque choix ci-dessous est **une décision de Claude**, à relire.

## 1. Données récoltées par URL

Le robot extrait l'analyse dans la même session Playwright que la vignette (aucun outil externe : Dembrandt et designlang prenaient jusqu'à 4 min par URL et le banc n'a jamais départagé). Résultat stocké en `pages.analysis` (jsonb, versionné par `analysis.version`), calculé sur le haut de page après nettoyage :

- **meta** : description, langue, `theme-color`, image og, URL canonique, `generator`.
- **tech** : signatures de frameworks/CMS/bibliothèques (Next.js, Nuxt, Astro, Gatsby, WordPress, Webflow, Framer, Wix, Squarespace, Shopify, HubSpot, React, Vue, Svelte, GSAP, Lenis, Three.js/WebGL, Lottie, Tailwind).
- **colors** : couleurs de fond, de texte et de bordure des éléments visibles, pondérées par surface ; rôles déduits : `background`, `surface`, `text`, `text-muted`, `primary` (couleur saturée la plus présente sur les boutons et liens d'action), `accent`.
- **typography** : par rôle (`display` = h1, `headline` = h2, `title` = h3, `body` = p, `label` = boutons, `caption` = petits textes) : famille, taille, graisse, interlignage, approche ; et les familles réellement chargées.
- **rounded**, **spacing**, **shadows** : valeurs les plus fréquentes, ramenées en échelle (`sm`, `md`, `lg`…).
- **components** : bouton principal, bouton secondaire, champ de saisie, s'ils existent dans le haut de page.
- **layout** : hauteur de page, largeur de contenu, thème clair/sombre, présence de vidéo/canvas/WebGL, plan des titres (h1–h3, 20 max).

Les vignettes existantes n'ont pas d'analyse : « Refaire la capture » la calcule.

## 2. DESIGN.md

Format : spécification Google Labs `DESIGN.md` (alpha) — front matter YAML (`version`, `name`, `description`, `colors`, `typography`, `rounded`, `spacing`, `components`) puis les sections dans l'ordre imposé (Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts).

Le fichier est **généré par la page**, à la demande, depuis `analysis` + les infos éditées (nom, typologie, notes) : il reste à jour quand on corrige la fiche, et le même module servira à l'export pour les agents. La prose est factuelle (ce qui a été mesuré) ; « Do's and Don'ts » est déclaré dans `omitted` tant qu'aucune rédaction par un modèle n'existe. Étape suivante possible : une passe Claude dans le robot pour rédiger Overview/Do's and Don'ts et proposer la typologie (nécessite une clé API).

## 3. Piles par site

Les pages d'un même domaine (sans `www.`) forment une pile dès qu'il y en a deux : la carte montre la capture la plus récente avec deux feuillets décalés et « N pages ». Clic sur la pile → la planche n'affiche que ce site, avec un retour « Toutes les pages ». Une recherche active affiche les résultats à plat.

## 4. Carte et fiche

- La capture porte un bouton « Ouvrir le site » (nouvel onglet). Le reste de la carte ouvre la fiche.
- Fiche : panneau latéral (plein écran sur mobile), adressable par `#page=<id>` (retour arrière du navigateur ferme la fiche).
- Champs éditables : nom affiché (`display_name`, prioritaire sur le nom détecté, jamais écrasé par une recapture), type de site, type de page, styles (plusieurs), notes. Listes de valeurs proposées : celles données par la personne, champ libre possible.
- Lecture : capture, URL, palette, typographies, technologies, plan des titres, avertissements de capture ; DESIGN.md en aperçu avec « Copier » et « Télécharger ».
- Actions : ouvrir le site, refaire la capture, supprimer.

## Hors périmètre

Proposition automatique de la typologie, captures mobiles, export pour agents (idées seulement).
