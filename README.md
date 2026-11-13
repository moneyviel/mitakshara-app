# Mitakshara

Private, offline-first workspace for a law chamber. Desktop app for macOS and Windows (Electron).

- `main/` app engine: encrypted vault (AES-256-GCM, scrypt), licence (Ed25519-signed certificates, device binding)
- `renderer/` screens (no network access; strict content security policy)
- Builds run on GitHub Actions (Mac and Windows) and include a start-up test.
