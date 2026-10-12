# HomeFlex test: ready on add

New valid cards become Published locally when added. This enables Open in Google Photos, not in-app playback and not public sharing. The shell is a TEST BUILD.

Batch paste keeps Preview and a single Add reviewed cards action, exact episode URLs and duplicate-code checks. Missing URLs are rejected. Album-only cards with missing titles can still open; their Needs details label remains.

JSON restore promotes incoming Draft cards to Published; explicit Unavailable cards stay Unavailable. Merge still skips existing duplicates without changing their status. Use Publish all existing drafts to enable old cards, with a count confirmation. Unpublish all or per-card status can reverse it. Nothing is opened or sent by changing status.

Extension capture and Android share intake add valid links as Published. Edit details also makes a valid card ready to open. Google controls access and playback. No media is fetched by HomeFlex.

Run `node 5-homeflex-batch.test.cjs` for synthetic URL, duplicate, backup and status tests. Private links are never committed.
