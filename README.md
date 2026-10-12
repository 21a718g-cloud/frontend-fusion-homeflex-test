# Separate Fusion + HomeFlex test site

DRAFT / REVIEW REQUIRED. This separate public test copy leaves live Fusion unchanged. Default data is blank. Synthetic demo only. Test workspace and HomeFlex catalogue have separate storage/cache names from live Fusion; same-origin scripts can still access them. HomeFlex JSON backup remains portable. No real album data or secrets in this repository.

# Frontend Fusion Cloud OS

An original, dependency-free HTML/CSS/vanilla-JavaScript offline desktop prototype. It is not an operating system, a Puter implementation, a Puter affiliate, or a cloud service. No Puter source, logos, branding or hosted services are used.

## Run locally

1. Extract this ZIP.
2. In the project folder run `python3 -m http.server 8080`.
3. Open `http://localhost:8080/` in Chrome or Edge.
4. Wait for **Ready offline**, then reload once. Use the browser's Install app option, or the Install app button if an install prompt is available.

Opening `index.html` as `file://` is not an offline-installable PWA. For phone access/install, deploy the static files to an HTTPS origin. No deployment is included or authorised by this package. First visit must complete online. Websites launched from shortcuts still need internet.

## Usage

- Desktop: double-click a shortcut, or focus it and press Enter/Space. On a small touch screen, tap once.
- Windows: drag title bars, drag bottom-right resize grip, minimize/maximize/close. On small screens windows become maximized panels.
- Taskbar: active app click minimizes, minimized app click restores. Right-click or Shift+F10 opens actions. Move Left/Right is a keyboard alternative to pointer reorder.
- Search: Ctrl/Cmd+K, or `/` outside text fields. Arrow keys choose, Enter runs, Escape closes. Only executed results create recent-search history, at most 12 queries.
- Files: select then use visible actions, or right-click for actions. Double-click opens on desktop; tap opens on mobile. Binary imports download on open.
- Notes: create explicitly; title/content autosave after a short delay.
- Backups: Settings > Export workspace. JSON includes text files, notes, metadata, shortcuts, settings, history, pins, windows and your profile (including the avatar). It **does not include binary file or wallpaper bytes**. Download important binary files separately.

## Storage and security boundaries

One state object, schemaVersion 2, LocalStorage key `frontend-fusion-homeflex-test`. Binary assets use IndexedDB `frontend-fusion-homeflex-test-assets`. User data is origin/browser/profile specific. Clearing site data or browser eviction can remove it. No account, telemetry, sync, cookies, passwords, third-party scripts, external fonts or embedded login pages.

HTTP(S) launchers reject other URL schemes and embedded credentials. User text uses textContent/DOM APIs, not interpolated HTML. Imports are treated as untrusted data and normalized before replacement confirmation. This is not a security audit or formal accessibility certification.

## Updates

Change `CACHE` in sw.js for each asset update. All shell files must install successfully before a new worker is ready. The app asks before activating an update and reload. Cache cleanup removes only this app's `fusion-homeflex-test-shell-` caches. Don't deploy at the same origin/scope as another app using the same storage key or cache prefix.

## Files

index.html, style.css, app.js, manifest.webmanifest, sw.js, original PNG icons. No build step or package dependency. See VALIDATION.md and evidence/ for performed tests and limits.

## Deployment layout

The GitHub Pages version places the two PNG icons at the repository root. Icon references in HTML, manifest and worker were changed to match. Runtime code is the tested v1.0.1 prototype. This folder layout avoids a build step. Data remains browser-local, not in the public repository.

## Site shortcut icons (v1.1.0)
Website shortcuts now discover site branding automatically and use the same icon on Desktop, Taskbar and Launcher. Where the site allows CORS, the app reads its declared favicon/touch-icon links. It also checks common touch-icon, SVG and favicon paths. Actual decoded pixel sizes decide which retrievable icon wins; advertised sizes alone are not trusted. A generic arrow is used if no candidate loads.

Only the target site and its declared icon hosts are contacted, without a referrer. HTML/cache fetches omit credentials; image probes follow the browser's third-party cookie rules. No third-party favicon lookup/proxy service is used. The first lookup needs internet. Successful icons are stored in a separate Cache Storage cache for offline rendering after the service worker controls the app. Websites themselves still need internet. Browser data clearing/eviction can remove cached icons. Existing shortcuts without icons are upgraded when opened online. Editing a shortcut's URL refreshes its branding. Properties can be saved again to retry discovery.

Limit: browsers cannot read pages that disallow CORS. For those sites, discovery is limited to conventional icon paths, so a larger icon at a hidden custom URL may be unreachable. This is the highest-quality retrievable candidate, not a guarantee of every site's absolute best icon. Cross-device JSON backups retain icon URLs, not cached image bytes.

## Profile hub (v1.2.0)

A profile button sits at the top right. It opens a card with your name, role, workspace name, avatar, the last note or file you opened, a theme switch and shortcuts to edit, export or import the profile. Avatars (PNG, JPEG or WebP) are cropped square, scaled to 256 px and stored in this browser as a small data URL; shape is circle, rounded or square. Profile and avatar are included in workspace backups; "Export profile" makes a separate small JSON file. Imports are size-capped, validated and sanitised, and an old backup without a profile keeps your current one.

The Welcome window opens only on a brand-new workspace (and after Reset). It is never restored on load; reopen it from the profile card, Settings or the Welcome icon. Existing workspaces are migrated automatically (schemaVersion 3) and keep notes, files and shortcuts.

A Content-Security-Policy meta tag restricts scripts to the app itself. This is not a security audit or formal accessibility certification.

## Linux launcher (v1.3.0)

Linux is now a built-in app on Desktop, Launcher, global search and Taskbar. Open it to launch hosted WebVM: Debian terminal or Alpine/Xorg/i3 graphical desktop, both in a separate tab. Internet is required; this is not Ubuntu, a cloud server or Mali GPU passthrough. Fusion does not cache the WebVM engine or disk, and its workspace backups do not include Linux data. Existing files, notes and profile data are unchanged.

WebVM framing on a normal non-isolated page was tested and failed with a SharedArrayBuffer/crossOriginIsolated error. Keeping a separate tab avoids weakening the existing CSP or changing browser isolation across the workspace. The Content-Security-Policy is unchanged (frame-src none); no third-party script was added. The shell cache version is v1.3.0.

WebVM frontend is Apache-2.0, but CheerpX has separate terms. The hosted engine is free for individual exploration; downloading it for redistribution/self-hosting requires a commercial licence. This app only links to the original service. See https://github.com/leaningtech/webvm#license .

## HomeFlex native app (review)

DRAFT / REVIEW REQUIRED. HomeFlex is a local album-link catalogue, separate from the Fusion workspace. It uses Fusion's launcher, window manager, theme, installation and offline shell. See HOMEFLEX-REVIEW.md for format, backups, tests and limits. The library starts blank; Explore demo is synthetic and never saved. Fusion workspace JSON export/import/reset excludes HomeFlex data. Export HomeFlex from its own Backup & info panel. Google Photos albums require internet and normal Google access.
