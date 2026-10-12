
## Test patch: labelled exact-episode Batch import

Batch accepts `Series | S01E01 - Title | https://photos.google.com/share/.../photo/...`.
These store the supplied URL as `itemUrl` and `albumUrl: null`; no fallback is guessed.
Optional fourth field accepts a matching expanded album/share fallback URL.
Review warnings and episode details mark missing fallback. New cards are Draft;
duplicate episode codes remain blocking. Existing backups with album fallbacks still work.
If copied rich-text omitted a URL, Batch reports that no HTTPS URL was found.
Copy the plain-text/code-block version with literal URLs.
Run `node homeflex-batch.test.cjs` for the synthetic parser/backup regressions.
The v1 backup format now accepts null albumUrl only for valid labelled item-only episodes;
older app versions need the test-site update before restoring those backups.
