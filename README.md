# SCOUT IA — Grist AppStore

Widget Grist de saisie vocale terrain avec IA (transcription + extraction de champs structurés).

## Fonctionnement

- **Dans Grist** : widget personnalisé, connexion native via `grist-plugin-api`
- **Hors Grist (PWA / APK)** : onboarding avec URL Grist, clé API, Doc ID — connexion via Grist REST API

## Distribution

### PWA (recommandé)

Hébergée sur GitHub Pages : `https://nic01asFr.github.io/Grist-AppStore/`

Sur Android Chrome : Menu → *Ajouter à l'écran d'accueil* → icône, plein écran, hors ligne.

### APK Android

Télécharger le dernier `.apk` depuis les [Releases GitHub](../../releases).

Nécessite : *Sources inconnues* activées dans les paramètres Android.

## Utilisation dans Grist

1. Ouvrir un document Grist
2. Ajouter un widget personnalisé (Custom Widget)
3. URL : `https://nic01asFr.github.io/Grist-AppStore/`
4. Accès complet requis
5. Au premier lancement : création automatique de la table `Visites_terrain` ou mapping vers une table existante

## Stack

- HTML/CSS/JS vanilla (zéro dépendance runtime)
- [`grist-plugin-api.js`](https://docs.getgrist.com/grist-plugin-api.js)
- Capacitor (build APK via GitHub Actions)
- SSPCloud LLM API / Albert API (OpenAI-compatible)

## Développement local

```bash
python -m http.server 9090
# puis Grist Custom Widget → http://localhost:9090/
```
