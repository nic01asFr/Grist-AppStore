# Grist AppStore

Applications terrain pour [Grist](https://www.getgrist.com/) — capteurs mobiles, IA embarquée, synchronisation temps réel.

**Catalogue** : [nic01asFr.github.io/Grist-AppStore](https://nic01asFr.github.io/Grist-AppStore/)

## Applications

### SCOUT IA — Saisie vocale terrain

Enregistrement vocal sur le terrain → transcription live par chunks → extraction LLM streamée → record structuré dans Grist.

| Surface | URL |
|---|---|
| App mobile (PWA) | [/app/](https://nic01asFr.github.io/Grist-AppStore/app/) |
| Widget Grist | [/grist-widget/](https://nic01asFr.github.io/Grist-AppStore/grist-widget/) |
| Fiche détaillée | [/apps/scout-ia.html](https://nic01asFr.github.io/Grist-AppStore/apps/scout-ia.html) |
| APK Android | [Releases](https://github.com/nic01asFr/Grist-AppStore/releases) |

Capteurs : microphone, GPS. IA : STT (SSPCloud/Albert), LLM extraction (streaming). Table Grist : `Visites_terrain` (auto-créée).

### SCOUT Vision — Détection vidéo temps réel

Flux caméra → détection d'objets embarquée (TensorFlow.js COCO-SSD, 80 classes) → overlay bounding boxes → streaming géolocalisé vers Grist.

| Surface | URL |
|---|---|
| App mobile (PWA) | [/app-video/](https://nic01asFr.github.io/Grist-AppStore/app-video/) |
| Widget Grist | [/grist-widget-video/](https://nic01asFr.github.io/Grist-AppStore/grist-widget-video/) |
| Fiche détaillée | [/apps/scout-vision.html](https://nic01asFr.github.io/Grist-AppStore/apps/scout-vision.html) |
| APK Android | [Releases](https://github.com/nic01asFr/Grist-AppStore/releases) (tag `vision-v*`) |

Capteurs : caméra, GPS continu (vitesse, cap). IA : COCO-SSD embarqué (WebGL). Table Grist : `Detections_video` (auto-créée). Déduplification IoU + cooldown.

## Structure du repo

```
├── index.html                  Catalogue (charge store.json dynamiquement)
├── store.json                  Registre des apps (métadonnées, URLs, capabilities)
│
├── app/                        SCOUT IA — app mobile
│   ├── index.html              Application complète (HTML/JS vanilla)
│   ├── manifest.json           PWA manifest
│   └── sw.js                   Service worker (cache offline)
│
├── app-video/                  SCOUT Vision — app mobile
│   ├── index.html              Application complète
│   ├── manifest.json           PWA manifest
│   └── sw.js                   Service worker
│
├── apps/                       Pages de présentation par app
│   ├── scout-ia.html
│   └── scout-vision.html
│
├── grist-widget/               SCOUT IA — widget bureau pour Grist
│   └── index.html
│
├── grist-widget-video/         SCOUT Vision — widget bureau pour Grist
│   └── index.html
│
├── shared/                     Modules partagés (primitives réutilisables)
│   ├── grist-client.js         Transport HTTP (Capacitor/fetch) + client Grist (CRUD)
│   ├── storage.js              Persistance (Preferences/localStorage) + queue offline (IndexedDB)
│   ├── sensors.js              Capteurs (GPS, caméra, micro, réseau, mouvement, orientation)
│   ├── batch-sync.js           Sync batch (buffer, flush, dédup IoU, offline fallback)
│   └── ui-kit.css              Design system (variables, composants, dark theme)
│
├── icons/                      Icônes SVG par app
│   ├── scout-ia.svg
│   └── scout-vision.svg
│
├── capacitor.config.yaml       Config Capacitor — SCOUT IA (appId, webDir, plugins)
├── capacitor-video.config.yaml Config Capacitor — SCOUT Vision
│
└── .github/workflows/
    ├── build-apk-unified.yml   CI : tag v* ou vision-v* → APK Android (paramétré)
    └── deploy-pages.yml        CI : push main → GitHub Pages
```

## Primitives partagées (`shared/`)

Les apps importent les modules via `<script src="../shared/xxx.js">`. Les classes et fonctions exposées :

| Module | Exports | Rôle |
|---|---|---|
| `grist-client.js` | `IS_CAP`, `IN_GRIST`, `apiFetch()`, `GristClient` | Transport HTTP + CRUD Grist (dual-mode widget/REST) |
| `storage.js` | `AppStorage`, `OfflineQueue` | Config locale + queue offline IndexedDB |
| `sensors.js` | `GPSTracker`, `CameraStream`, `AudioRecorder`, `NetworkMonitor`, `MotionSensor`, `OrientationSensor` | Capteurs mobiles (start/stop/data) |
| `batch-sync.js` | `BatchSync`, `DetectionDedup` | Buffer → flush batch → retry → offline fallback |
| `ui-kit.css` | Variables CSS, composants | Toast, pills, modal, formulaires, toggles, loading |

## APK Android

Le workflow CI `build-apk-unified.yml` compile une APK pour chaque app :

```bash
# SCOUT IA
git tag v0.3.0 && git push origin v0.3.0

# SCOUT Vision
git tag vision-v1.0.0 && git push origin vision-v1.0.0

# Ou manuellement via Actions → Build APK → choisir l'app
```

L'APK utilise Capacitor 6. Le workflow copie `shared/` dans le webDir, injecte les permissions Android (micro/caméra/GPS), et build via Gradle.

Installation : Paramètres → Sécurité → Sources inconnues → installer l'APK.

## Développement local

```bash
python -m http.server 9090
# SCOUT IA :     http://localhost:9090/app/
# SCOUT Vision : http://localhost:9090/app-video/
# Catalogue :    http://localhost:9090/
```

## Écosystème

Ce repo fait partie d'un écosystème Grist plus large :

| Repo | Rôle |
|---|---|
| [Widgets-Grist](https://github.com/nic01asFr/Widgets-Grist) | TaskFlow : Kanban, Gantt, Calendar |
| [mcp-server-grist](https://github.com/nic01asFr/mcp-server-grist) | Serveur MCP (50+ outils API Grist) |
| [GristCoder](https://github.com/nic01asFr/GristCoder) | Construction d'apps Grist par IA (Claude + MCP) |
| [grist-navigation-widgets](https://github.com/nic01asFr/grist-navigation-widgets) | Navigation + Panoramax |
| [widgets-documentation](https://github.com/nic01asFr/widgets-documentation) | Documentation complète API widgets |

## Stack

- HTML/CSS/JS vanilla (zéro dépendance runtime)
- [grist-plugin-api.js](https://docs.getgrist.com/grist-plugin-api.js)
- Capacitor 6 (APK Android, HTTP natif, Preferences)
- TensorFlow.js + COCO-SSD (détection embarquée)
- SSPCloud / Albert API (STT, LLM — souverain)
- GitHub Actions (CI/CD) + GitHub Pages (hébergement)
