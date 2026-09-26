# JEC TubePilot v4 — SEO YouTube piloté par Gemini

Extension Chrome pour chaînes YouTube (pensée d'abord pour les chaînes **musique**). Vous importez votre vidéo dans YouTube Studio. **Gemini écoute et regarde le fichier lui-même**, même si la vidéo est privée. TubePilot vérifie ensuite les mots-clés sur les **vraies recherches YouTube** et analyse les concurrents. Il écrit le titre, la description avec **timeline / chapitres**, les tags et les hashtags, puis **les insère tout seul dans Studio**. Tout respecte le règlement YouTube / Google.

## Nouveautés de la v4.2 — votre Gemini Pro, sans clé API

- **Mode par défaut : 💎 Gemini Pro — mon abonnement.** TubePilot pilote lui-même **gemini.google.com** : aucune clé AI Studio, aucun copier-coller, aucun fichier à importer à la main.
  1. Vous importez la vidéo dans YouTube Studio, ou vous cliquez « 🎧 Analyser ce clip avec Gemini » sur une page YouTube.
  2. TubePilot ouvre Gemini dans une **petite fenêtre dans le coin de l'écran**. Il y colle la consigne pro avec :
     - le **lien** de la vidéo, si elle est publique ou non répertoriée (vérifié automatiquement) ;
     - sinon **l'audio** extrait de votre fichier sur votre ordinateur, **joint automatiquement**.
  3. Gemini écoute la chanson et renvoie son analyse en JSON : style, rythme, refrain, meilleurs moments, timeline.
  4. TubePilot cherche les **vraies recherches YouTube** dans le pays du style, puis envoie une **2e demande dans la même conversation**. Gemini écrit le SEO et cherche lui-même sur Google les hashtags en tendance.
  5. Le JSON est récupéré, **YouTube Studio est rempli** (titre, description avec timeline 🔥, tags), puis **la fenêtre Gemini se ferme**.
- Si Gemini a besoin de vous (compte à reconnecter, fichier refusé), sa fenêtre s'agrandit au premier plan avec un message. TubePilot continue tout seul ensuite.
- Réglages (panneau › ⚙️ Moteur IA & clés) :
  - **2 étapes** (meilleur SEO) ou **1 seule demande** (plus rapide) ;
  - petite fenêtre ou onglet en arrière-plan ;
  - fermeture automatique ;
  - adresse d'un 2e compte Google (`/u/1/app`).
- Le modèle (Pro ou Flash) se choisit **une fois dans Gemini** : il est retenu.
- Le mode **API Gemini** (clé AI Studio) reste disponible pour ceux qui le préfèrent.

## Nouveautés de la v4.1

- **Tous les rythmes du monde.** Gemini reçoit un guide d'écoute : Golfe / khaliji (samri, khabiti, adani, sheilat), Arabie saoudite, Yémen (sana'ani, adani, hadrami), Irak (choubi, maqam, rap irakien), Levant, Égypte (maqsum, saïdi, mahraganat), Maghreb, Turquie, Afrique, rap / trap / drill, RnB, jazz, fusions. Pour chaque chanson, il suit une méthode :
  - il compte le tempo ;
  - il repère la pulsation (binaire, ternaire, swing, aksak), les percussions, le maqam et le dialecte ;
  - il compare 2 à 4 styles candidats, avec leur probabilité.

  Le style est **toujours détecté sur la chanson**, jamais deviné d'après le nom de la chaîne.
- **Timeline au format `00:05 Refrain`**, avec les **meilleurs moments marqués 🔥** : refrain le plus fort, drop, solo, montée. Exemple : `00:45 🔥 اللازمة`. La timeline reste valide pour les chapitres YouTube.
- **Mots-clés du bon pays.** Les recherches sont faites dans le pays et la langue du style entendu : khaliji → Arabie saoudite, Koweït, Émirats ; rap irakien → Irak ; chaabi → Maroc. Avec la clé YouTube, les **2 meilleurs mots-clés sont comparés sur YouTube** et le plus fort devient le mot-clé principal.
- **Hashtags et recherches en tendance** :
  - YouTube Tendances Musique du pays (hashtags, tags, mots des titres) ;
  - recherche Google faite par Gemini (ce qui monte en ce moment, avec les sources).

  Gemini n'en garde que ceux qui correspondent vraiment à la chanson.
- **Accroches de pro.** 8 leviers (recherche + émotion, adresse directe, partage, moment d'écoute, curiosité vraie, fusion, question, mot-clé pur). Les titres sont écrits dans le dialecte du public. Un « nom d'artiste de la chaîne » peut être ajouté dans le profil.
- **Clés Gemini et YouTube directement dans le panneau** (🔑 Clés API), avec le choix du modèle Pro ou Flash.

## Ce qui change par rapport à JEC YouTube Booster v3.6

| | JEC Booster v3.6 | **TubePilot v4** |
|---|---|---|
| Accès à Gemini | pilotage de la page gemini.google.com (fragile, JSON à recoller) | **API Gemini officielle** + réponses en **JSON structuré** (schéma imposé) |
| Vidéo privée / non répertoriée | Gemini ne peut pas l'ouvrir → enregistrement de l'aperçu | **Le fichier importé est envoyé directement à Gemini** (audio + image) |
| Analyse musicale | texte libre | style, sous-style, région, **BPM (Gemini + mesuré sur l'ordinateur)**, mesure, tonalité / maqam, rythme, instruments, voix, ambiance, énergie, **refrain et son horodatage**, paroles, meilleur extrait pour un Short |
| Timeline | — | **chapitres valides garantis** (0:00, ≥ 3, ≥ 10 s chacun) insérés dans la description ; liste des morceaux pour un mix |
| Mots-clés | suggestions | suggestions **A→Z** + popularité, **demande / concurrence / score** (vues du top 15, taille des chaînes, titres exacts, fraîcheur), tags des concurrents |
| Titres | 6 titres | 6-12 titres à leviers différents, **notés en direct** (façon vidIQ), 3 titres pour « Tester et comparer » |
| Règlement | consignes dans le prompt | **contrôle automatique** : longueurs, majuscules, « officiel », sub4sub, bourrage, 500 caractères de tags, 3-5 hashtags (> 60 = tous ignorés), chapitres, rappel « contenu synthétique » (IA), reprises — avec liens vers l'Aide YouTube |
| Pages YouTube | fiche vidéo | carte sur chaque vidéo : **tags**, vues/heure, âge, engagement, vues/abonnés, accroches détectées |
| Concurrents | liste | vidéos qui **surperforment** (×N la médiane de la chaîne), formules d'accroche, **jours/heures de publication**, tags les plus utilisés |

## Installation

1. Décompressez `jec-tubepilot-4.2.0.zip` dans un dossier que vous gardez.
2. Ouvrez `chrome://extensions` → activez **Mode développeur** → **Charger l'extension non empaquetée** → choisissez le dossier `jec-tubepilot`.
3. Épinglez l'icône (violet/rose). La page **Réglages** s'ouvre toute seule.
4. Rechargez vos onglets YouTube et YouTube Studio (F5).

## Moteur IA et clés

**Par défaut, aucune clé n'est nécessaire.** Il suffit d'être connecté à **gemini.google.com** dans Chrome (votre abonnement Gemini Pro).

**Mode API, optionnel : clé Gemini**
- Ouvrez <https://aistudio.google.com/apikey> avec votre compte Google → *Create API key* → copiez la clé (`AIza…`).
- Collez-la dans le panneau (🔑 Clés API) ou dans Réglages → **Tester la clé**. Les modèles de votre compte sont chargés, et le meilleur « Pro » et le meilleur « Flash » sont choisis tout seuls.
- ℹ️ L'abonnement **Gemini Pro** (gemini.google.com) et l'**API** sont deux choses séparées chez Google. L'API a un quota gratuit. Si le modèle Pro atteint sa limite du jour, choisissez un modèle Flash dans Réglages. Votre abonnement reste utilisable avec le **mode manuel** (voir plus bas).

**Clé YouTube Data API v3** (optionnelle : concurrents, tendances YouTube, statistiques)
- <https://console.cloud.google.com/apis/library/youtube.googleapis.com> → **Activer**.
- <https://console.cloud.google.com/apis/credentials> → **Créer des identifiants** → **Clé API**.
- Collez-la dans le panneau (🔑 Clés API) ou dans Réglages, section 2.
- Quota : 10 000 unités / jour. Une analyse de concurrence coûte environ 102 unités, une page de tendances 1 unité. Tout est mis en cache.

Puis, dans Réglages → **Profils** : pour chaque chaîne, indiquez son **ID `UC…`** (visible dans l'adresse de Studio), ses langues (ex. `ar, fr`), son pays (`MA`), son style, son public et votre bloc de signature (liens). Dans Studio, le bon profil est choisi automatiquement.

## Utilisation

### ⚡ Pilote automatique (dans YouTube Studio)
1. **Créer → Importer des vidéos** → choisissez votre fichier (ou glissez-le).
2. Une carte **JEC TubePilot** apparaît sous le champ Titre, avec l'avancement : envoi à Gemini → écoute & analyse → recherches YouTube → concurrents → rédaction SEO.
3. Ensuite, sans rien toucher :
   - le **titre** (s'il est encore le nom du fichier), la **description** et les **tags** (s'ils sont vides) sont remplis ;
   - ce que vous avez tapé vous-même n'est **jamais remplacé** ;
   - les titres proposés sont notés : **un clic = appliqué** ;
   - **Tout insérer** applique le titre n°1, la description et les tags ;
   - le **score d'optimisation** (titre / description / tags) se met à jour pendant que vous écrivez.
4. Vérifiez, puis **Suivant** / **Enregistrer**.

Pour une vidéo déjà en ligne : ouvrez sa page **Détails**. Trois boutons sont proposés : **📁 Choisir le fichier de cette vidéo**, **🔗 Via le lien public** (vidéos publiques seulement) et **⚡ Express** (sans écoute).

Pendant la saisie des tags, les **vraies recherches YouTube** s'affichent sous le champ (un clic = ajouté).

### 🧭 Panneau latéral (clic sur l'icône)
- **🎬 Vidéo** : lancer ou relancer l'analyse (fichier Studio, fichier de l'ordinateur, lien public, express). Vous pouvez donner des indications à Gemini : mot-clé, notes, paroles. Le panneau affiche tout ce que Gemini a entendu (style, BPM, tonalité, refrain, structure, paroles). Titres notés, testeur de titre, description et tags modifiables (compteurs 5000 / 500), hashtags, chapitres, commentaire à épingler, miniature (textes + prompt d'image), idée de Short, contrôle du règlement. Bouton **Tout insérer dans Studio**. **🔁 Régénérer** produit de nouveaux titres sans réécouter.
- **🔑 Mots-clés** : recherche A→Z, popularité, bouton 📊 (demande, concurrence, score, top 15 vidéos, accroches, mots et tags des concurrents), **Formules d'accroche + titres originaux** par Gemini, panier de tags à insérer dans Studio.
- **🥊 Concurrents** : suivez des chaînes (`@handle`, lien ou `UC…`, ou bouton « Suivre la chaîne » sur une page vidéo). Vous voyez leurs vidéos qui surperforment, ce qui marche dans leurs titres, quand elles publient et leurs tags.
- **🔥 Tendances** : les 50 vidéos en tendance d'un pays (Musique par défaut), triées par vues/heure, avec les sujets qui reviennent.
- **🗂️ Historique** : toutes vos fiches SEO.

### 💎 Mode abonnement Gemini Pro (sans clé API)
Dans le panneau, ouvrez **Utiliser mon abonnement Gemini Pro** :
1. **Copier le prompt**.
2. **Ouvrir Gemini**, joignez la vidéo ou le MP3, choisissez le modèle le plus puissant, puis collez le prompt.
3. Copiez la réponse et collez-la dans le panneau.

La fiche est construite de la même façon, avec les mêmes contrôles.

## Règles Google / YouTube appliquées

- Titre ≤ 100 caractères (idéal 30-70), mot-clé au début. L'accroche doit être **vraie** : pas de piège à clics trompeur.
- Pas de titre en MAJUSCULES, pas de « !!! », 0 à 2 emojis. « Officiel » est réservé à une chaîne officielle d'artiste. Aucun artiste ni marque absents de la vidéo.
- Description ≤ 5000 caractères, mot-clé dans les 2 premières lignes. Pas de liste de mots-clés ni de bourrage (détecté).
- Tags ≤ 500 caractères, comptés comme YouTube (virgules et guillemets compris).
- 3 à 5 hashtags. Au-delà de 60, YouTube les ignore tous.
- Chapitres : 0:00 en premier, au moins 3, chacun ≥ 10 s.
- Musique ou voix IA réaliste : rappel de cocher **Contenu modifié ou synthétique**.
- Reprise : l'original est crédité et un rappel Content ID s'affiche.

Aide YouTube : [spam et pratiques trompeuses](https://support.google.com/youtube/answer/2801973) · [hashtags](https://support.google.com/youtube/answer/6390658) · [chapitres](https://support.google.com/youtube/answer/9884579) · [contenu synthétique](https://support.google.com/youtube/answer/14328491).

## Limites (honnêtement)

- Aucun outil n'a accès au **vrai volume de recherche YouTube**. La popularité est un indice calculé sur les suggestions réelles, et la demande sur les vues du top 15.
- L'analyse d'un **lien** YouTube par Gemini ne marche que pour une vidéo **publique**. Pour une vidéo privée, TubePilot envoie le fichier.
- Le quota gratuit de Gemini dépend du modèle. Les modèles « Pro » ont une petite limite par jour.
- YouTube Studio change parfois son interface. Si l'insertion échoue, utilisez les boutons **Copier** du panneau.

## Confidentialité

Vos clés restent dans le stockage local de Chrome. Le fichier est lu sur votre ordinateur et envoyé **uniquement à Google** (API Gemini). Par défaut, il est supprimé chez Google juste après l'analyse. Aucun serveur tiers.

## Développement

```bash
npm test                    # tests unitaires + chaîne complète (API simulées)
node tests/e2e/run.mjs      # Chromium + extension + maquettes de Studio / YouTube (Playwright)
npm run icons               # régénère les icônes depuis icons/icon.svg
npm run zip                 # dist/jec-tubepilot-<version>.zip
```

Organisation :

- `lib/` : logique partagée (format, règles YouTube, scores SEO, client Gemini, YouTube Data API, mots-clés, prompts et schémas JSON, audio/BPM, assemblage, chaîne complète).
- `content/` : scripts injectés dans Studio et YouTube.
- `engine/` : page invisible qui envoie le fichier importé à Gemini depuis Studio.
- `sidepanel/`, `options/` : interface.
- `background/sw.js` : service worker.
