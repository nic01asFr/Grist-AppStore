# SCOUT IA — Grist AppStore

Widget Grist de saisie vocale terrain avec IA (transcription + extraction de champs structurés).

## Utilisation dans Grist (recommandé)

1. Ouvrir un document Grist
2. Ajouter un widget personnalisé → URL : `https://nic01asFr.github.io/Grist-AppStore/`
3. Accès complet requis
4. **Activer la permission Microphone** : icône crayon du widget → cocher "Microphone"
5. Au premier lancement : création automatique de la table `Visites_terrain` ou mapping

## Mode standalone PWA

Accessible sur `https://nic01asFr.github.io/Grist-AppStore/` directement.

> **Prérequis CORS** : le mode standalone utilise l'API REST Grist depuis un autre domaine.
> Cela nécessite que votre instance Grist autorise les requêtes cross-origin (header `Access-Control-Allow-Origin`).
> `grist.numerique.gouv.fr` ne supporte pas CORS externe — utilisez une instance auto-hébergée ou le mode widget natif.

Sur Android Chrome : Menu → *Ajouter à l'écran d'accueil* → icône, plein écran, hors ligne.

## Problèmes connus

| Problème | Cause | Solution |
|---|---|---|
| `Permissions policy violation: microphone` | Grist bloque le micro par défaut dans les iframes | Activer "Microphone" dans les paramètres du widget |
| `CORS: Authorization not allowed` | Le serveur Grist n'autorise pas les requêtes cross-origin | Utiliser le widget natif dans Grist, ou une instance avec CORS configuré |
| `Failed to load icon-192.png` | Icônes PWA manquantes | Ajouter `icons/icon-192.png` et `icons/icon-512.png` (192×192 et 512×512) |

## Stack

- HTML/CSS/JS vanilla (zéro dépendance runtime)
- [`grist-plugin-api.js`](https://docs.getgrist.com/grist-plugin-api.js)
- Capacitor (build APK via GitHub Actions)
- SSPCloud LLM API / Albert API (OpenAI-compatible)

## Développement local

```bash
python -m http.server 9090
# Grist Custom Widget → http://localhost:9090/
```
