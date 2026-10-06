# Android preview — وفر دوام

An Android TWA preview opens https://attendance.xshadox.com/ with the production web UI and existing accounts. The separate package is com.xshadox.wafrdawam.preview (Android 6+, target API 36); it is not a Google Play production package.

The Android preview workflow produces an **unsigned** APK. Signing happens separately, with a preview certificate whose public SHA-256 is in public/.well-known/assetlinks.json. Private signing keys and passwords must never be committed or uploaded to Actions artifacts. The delivered signed preview is held separately by the owner. Increment versionCode and use the same certificate for future updates; otherwise uninstall/reinstall the preview.

Publish the association file by pulling and rebuilding the server after merge. The endpoint https://attendance.xshadox.com/.well-known/assetlinks.json must serve JSON, without login or redirects. It is served explicitly because Express static ignores dot-directories. Preserve existing association entries when adding a future Play-signing certificate.

Until the file is deployed, browsers may show a Custom Tab with an address bar. Verified TWA uses a supporting browser (Chrome recommended). This preview does not add background attendance/location: the existing app still requires a visible screen for its automatic attendance mechanism. Review actual device location, WebAuthn, photo picking, notification permissions, PDF downloads, navigation and updates before wider release. Test punches use real accounts and the real database.

No database, Docker or authentication identifiers are renamed. The generated project and Gradle dependencies are isolated from web dependencies.
