# Pi Coding Agent Runtime

This directory is the fixed built-in Pi runtime used by CodePIddy. It is intentionally
checked in and is not updated by `npm run build`.

- Current version: `1.1.0`
- Source package: `@earendil-works/pi-coding-agent@1.1.0`
- Contents: `dist/bundle` and the package manifest
- Update process: replace these files manually with the desired published package, update
  the manifest, and verify the RPC smoke test before committing.

The client build only copies this directory. It never installs or selects a newer Pi
version during the build.
