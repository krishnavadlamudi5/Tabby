# Tabby Project Instructions & Rules

## Core Architecture & Workflow Rules

### 1. Established Infrastructure (Mandatory)
* **Backend:** Render (`https://tabby-6i0f.onrender.com/api`) + MongoDB Atlas.
* **Frontend Web:** Netlify (SPA routing configured via `public/_redirects`).
* **Mobile Client:** Android Capacitor 8.5+ with `@capgo/capacitor-updater`.
* **CI/CD & OTA Updates:** GitHub Actions (`build-apk.yml` & `deploy-live-update.yml`).

### 2. APK & In-App Over-The-Air (OTA) Updates Workflow
* **Automatic In-App Updates:** Any push to `main` with frontend changes automatically generates a GitHub Release with `dist.zip`. The mobile app (`src/hooks/useLiveUpdate.ts`) auto-detects this release and allows users to update directly inside the app with zero APK re-downloads.
* **APK Builds:** Fresh APKs are automatically compiled by GitHub Actions and made available as artifacts under the GitHub Actions tab.
* **Rule Constraint:** Always analyze, troubleshoot, and build upon this exact OTA and CI/CD architecture. Do not propose changing this mechanism unless explicitly instructed by the user.

For full technical specifications, see [apk_ota_workflow.md](file:///.agents/rules/apk_ota_workflow.md).
