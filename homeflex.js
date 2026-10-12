"use strict";
/* HomeFlex native Fusion app. Local catalogue only; never fetch Google album data. */
window.HomeFlex = (() => {
  const DB = "homeflex.fusion-test.catalogue.v1",
    STORE = "catalogue",
    FORMAT = "homeflex-fusion",
    MAX = 1000;
  let rows = [],
    revision = 0,
    loaded = false,
    loading = null,
    busy = false,
    version = 0;
  const ui = {
    page: "browse",
    demo: false,
    query: "",
    series: "All",
    selected: null,
    text: "",
    preview: null,
    backup: null,
    restoreMode: "merge",
    message: "",
    error: "",
  };
  const art = "./homeflex-art.svg";
  const pattern = /^S(\d{2})E(\d{2}) - (\S(?:.*\S)?)$/;
  const idKey = (e) =>
    (e.needsDetails || e.cardType === "Album/Collection")
      ? "pending|" + e.id
      : e.series.trim().toLowerCase() + "|" + e.canonicalName.slice(0, 6);
  const fail = (msg) => {
    throw new Error(msg);
  };
  function albumUrl(raw) {
    try {
      if (typeof raw !== "string" || raw.length > 2048) return null;
      const u = new URL(raw);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.port ||
        u.hash
      )
        return null;
      return (u.hostname === "photos.app.goo.gl" &&
        /^\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)) ||
        (u.hostname === "photos.google.com" &&
          /^\/(?:u\/\d+\/)?(?:album|share)\/[A-Za-z0-9_-]+\/?$/.test(
            u.pathname,
          ))
        ? u.href
        : null;
    } catch {
      return null;
    }
  }
  function name(raw) {
    if (typeof raw !== "string" || /[\u0000-\u001f\u007f]/.test(raw))
      return null;
    const m = pattern.exec(raw);
    return m && +m[1] > 0 && +m[2] > 0 && m[3].length <= 120
      ? { code: raw.slice(0, 6), season: +m[1], episode: +m[2], title: m[3] }
      : null;
  }
  const iso = (v) =>
    typeof v === "string" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) &&
    Number.isFinite(Date.parse(v));
  function validate(items) {
    if (!Array.isArray(items) || items.length > MAX)
      fail("Library must be an array of up to 1,000 cards.");
    const ids = new Set(),
      keys = new Set(),
      urls = new Set();
    return items.map((e) => {
      if (
        !e ||
        typeof e !== "object" ||
        Array.isArray(e) ||
        Object.keys(e).some(
          (k) =>
            ![
              "id",
              "series",
              "canonicalName",
              "originalLine",
              "albumUrl",
              "synopsis",
              "status",
              "createdAt",
              "lastOpened",
              "thumbnail",
              "needsDetails",
              "title",
              "cardType",
            ].includes(k),
        )
      )
        fail("Backup has unknown or invalid card fields.");
      if (
        typeof e.id !== "string" ||
        !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
          e.id,
        ) ||
        typeof e.series !== "string" ||
        (!e.needsDetails && e.cardType !== "Album/Collection" && !e.series.trim()) ||
        e.series.length > 80 ||
        /[\u0000-\u001f]/.test(e.series) ||
        (e.needsDetails
          ? e.canonicalName !== "" ||
            e.series !== "" ||
            e.status !== "Draft" ||
            typeof e.title !== "string" ||
            !/^Untitled album [1-9]\d*$/.test(e.title)
          : e.cardType === "Album/Collection" ? (typeof e.title !== "string" || !e.title.trim() || e.title.length > 120 || /[\u0000-\u001f\u007f]/.test(e.title) || (e.canonicalName !== "" && !name(e.canonicalName))) : !name(e.canonicalName)) ||
        (e.cardType !== undefined && !["Episode", "Album/Collection"].includes(e.cardType)) ||
        (e.needsDetails !== undefined && typeof e.needsDetails !== "boolean") ||
        typeof e.originalLine !== "string" ||
        e.originalLine.length > 2500 ||
        !albumUrl(e.albumUrl) ||
        typeof e.synopsis !== "string" ||
        e.synopsis.length > 500 ||
        !["Draft", "Published", "Unavailable"].includes(e.status) ||
        !iso(e.createdAt) ||
        !(e.lastOpened === null || iso(e.lastOpened)) ||
        (e.thumbnail !== undefined &&
          (typeof e.thumbnail !== "string" ||
            e.thumbnail.length > 1500000 ||
            !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
              e.thumbnail,
            )))
      )
        fail(
          "Backup contains invalid names, URLs, image data or card metadata.",
        );
      const key = idKey(e),
        url = albumUrl(e.albumUrl);
      if (ids.has(e.id) || keys.has(key) || urls.has(url + "|" + (e.cardType === "Album/Collection" || e.needsDetails ? "album" : idKey(e))))
        fail(
          "Backup contains duplicate IDs, episode identities or album URLs.",
        );
      ids.add(e.id);
      keys.add(key);
      urls.add(url + "|" + (e.cardType === "Album/Collection" || e.needsDetails ? "album" : idKey(e)));
      return { ...e, albumUrl: url };
    });
  }
  function gaps(items) {
    const groups = new Map();
    for (const e of items) {
      const n = name(e.canonicalName);
      if (!n) continue;
      const key = e.series.trim().toLowerCase() + "|" + n.season;
      const g = groups.get(key) || {
        series: e.series,
        season: n.season,
        episodes: new Set(),
      };
      g.episodes.add(n.episode);
      groups.set(key, g);
    }
    const out = [];
    for (const g of groups.values())
      for (let i = 1; i <= Math.max(...g.episodes); i++)
        if (!g.episodes.has(i))
          out.push(
            `${g.series}: S${String(g.season).padStart(2, "0")}E${String(i).padStart(2, "0")}`,
          );
    return out;
  }
  function batch(text, current) {
    const cards = [],
      errors = [];
    if (text.length > 100000)
      return {
        cards,
        errors: ["Batch exceeds 100,000 characters."],
        warnings: [],
      };
    const lines = text.split(/\r?\n/).filter((x) => x.trim());
    if (lines.length > 200)
      return {
        cards,
        errors: ["Use at most 200 lines per batch."],
        warnings: [],
      };
    for (const [i, line] of lines.entries()) {
      const p = line.split("|").map((x) => x.trim());
      if (p.length === 1 && albumUrl(p[0])) {
        const e = {
          id: crypto.randomUUID(),
          series: "",
          canonicalName: "",
          title: `Untitled album ${current.filter((x) => x.needsDetails).length + cards.filter((x) => x.needsDetails).length + 1}`,
          needsDetails: true,
          originalLine: line,
          albumUrl: albumUrl(p[0]),
          synopsis: "",
          status: "Draft",
          createdAt: new Date().toISOString(),
          lastOpened: null,
        };
        try {
          validate([...current, ...cards, e]);
          cards.push(e);
        } catch (err) {
          errors.push(`Line ${i + 1}: ${err.message}`);
        }
        continue;
      }
      if (p.length !== 3) {
        errors.push(
          `Line ${i + 1}: paste one Google Photos link per line, or Series | S01E01 - Title | Google Photos URL.`,
        );
        continue;
      }
      const [series, canonicalName, url] = p;
      if (!name(canonicalName)) {
        errors.push(
          `Line ${i + 1}: exact S01E01 - Title required; season/episode 01-99 and title up to 120 characters.`,
        );
        continue;
      }
      if (!albumUrl(url)) {
        errors.push(
          `Line ${i + 1}: HTTPS Google Photos album/share link required.`,
        );
        continue;
      }
      const e = {
        id: crypto.randomUUID(),
        series,
        canonicalName,
        originalLine: line,
        albumUrl: albumUrl(url),
        synopsis: "",
        status: "Draft",
        createdAt: new Date().toISOString(),
        lastOpened: null,
      };
      try {
        validate([...current, ...cards, e]);
        cards.push(e);
      } catch (err) {
        errors.push(`Line ${i + 1}: ${err.message}`);
      }
    }
    return { cards, errors, warnings: gaps([...current, ...cards]) };
  }
  function readBackup(raw) {
    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      raw.format !== FORMAT ||
      raw.version !== 1 ||
      !iso(raw.exportedAt) ||
      Object.keys(raw).some(
        (k) => !["format", "version", "exportedAt", "episodes"].includes(k),
      )
    )
      fail("Use a HomeFlex Fusion v1 JSON backup.");
    return validate(raw.episodes);
  }
  function merge(current, incoming) {
    const additions = [];
    let skipped = 0;
    for (const e of incoming) {
      if (
        [...current, ...additions].some(
          (x) =>
            x.id === e.id || idKey(x) === idKey(e) || (x.albumUrl === e.albumUrl && (x.needsDetails || x.cardType === "Album/Collection") && (e.needsDetails || e.cardType === "Album/Collection")),
        )
      ) {
        skipped++;
        continue;
      }
      additions.push(e);
    }
    return {
      additions,
      skipped,
      overLimit: current.length + additions.length > MAX,
    };
  }
  function db() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () =>
        rej(new Error("Close other Fusion tabs and try again."));
    });
  }
  async function read() {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(STORE, "readonly"),
        r = t.objectStore(STORE).get("library");
      let record = { revision: 0, episodes: [] };
      r.onsuccess = () => {
        try {
          const saved = r.result;
          if (saved) {
            if (!Number.isSafeInteger(saved.revision) || saved.revision < 0)
              fail("Invalid saved library revision.");
            record = {
              revision: saved.revision,
              episodes: validate(saved.episodes),
            };
          }
        } catch (err) {
          t.abort();
          rej(err);
        }
      };
      t.oncomplete = () => {
        d.close();
        res(record);
      };
      t.onerror = t.onabort = () => {
        d.close();
        rej(t.error || new Error("Library could not be read."));
      };
    });
  }
  async function write(items, expected) {
    validate(items);
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(STORE, "readwrite"),
        s = t.objectStore(STORE),
        r = s.get("library");
      let failure = null;
      r.onsuccess = () => {
        if ((r.result?.revision || 0) !== expected) {
          failure = new Error(
            "Another tab changed the library. Reload HomeFlex and review again; nothing was overwritten.",
          );
          t.abort();
          return;
        }
        s.put({ revision: expected + 1, episodes: items }, "library");
      };
      t.oncomplete = () => {
        d.close();
        res(expected + 1);
      };
      t.onerror = t.onabort = () => {
        d.close();
        rej(
          failure ||
            t.error ||
            new Error(
              "Storage may be full or blocked. Previous library was not replaced.",
            ),
        );
      };
    });
  }
  async function load() {
    if (loaded) return;
    if (loading) return loading;
    loading = read()
      .then((record) => {
        rows = record.episodes;
        revision = record.revision;
        loaded = true;
        ui.message = "Library loaded from this browser.";
      })
      .catch((err) => {
        ui.error =
          err.message + " Imports are disabled; saved data is not replaced.";
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  }
  const root = () => document.querySelector("#win-homeflex .content");
  function refresh() {
    const r = root();
    if (r) render(r);
  }
  async function save(items) {
    if (!loaded || busy || ui.demo) return false;
    busy = true;
    ui.error = "";
    refresh();
    try {
      revision = await write(items, revision);
      rows = items;
      version++;
      ui.message = `${rows.length} cards saved locally. Export a JSON backup before clearing site data.`;
      try {
        localStorage.setItem(
          "homeflex.fusion-test.changed.v1",
          crypto.randomUUID(),
        );
      } catch {}
      return true;
    } catch (err) {
      ui.error = err.message;
      return false;
    } finally {
      busy = false;
      refresh();
    }
  }
  function label(text, input) {
    const l = el("label", text);
    l.append(input);
    return l;
  }
  function input(value, aria, type = "text") {
    const n = el("input");
    n.type = type;
    n.value = value;
    n.setAttribute("aria-label", aria);
    return n;
  }
  function choices(labelText, values, value, onChange) {
    const s = el("select");
    s.setAttribute("aria-label", labelText);
    for (const [v, title] of values) {
      const o = el("option", title);
      o.value = v;
      s.append(o);
    }
    s.value = value;
    s.addEventListener("change", () => onChange(s.value));
    return label(labelText, s);
  }
  function action(title, fn, cls = "", disabled = false) {
    const b = btn(title, fn, cls);
    b.disabled = disabled;
    return b;
  }
  const samples = [
    ["Travel", "S01E01 - The blue hour"],
    ["Travel", "S01E02 - Salt and sky"],
    ["Travel", "S01E04 - City after rain"],
  ].map(([series, canonicalName], i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    series,
    canonicalName,
    status: i === 2 ? "Unavailable" : "Published",
    synopsis: "Synthetic artwork. No actual album is attached.",
    thumbnail: null,
    lastOpened: null,
  }));
  async function thumbnail(f) {
    if (
      f.size > 5000000 ||
      !["image/png", "image/jpeg", "image/webp"].includes(f.type)
    )
      fail("Choose PNG, JPEG or WebP up to 5 MB.");
    const bitmap = await createImageBitmap(f);
    try {
      const scale = Math.min(1, 800 / bitmap.width, 800 / bitmap.height),
        c = el("canvas");
      c.width = Math.max(1, Math.round(bitmap.width * scale));
      c.height = Math.max(1, Math.round(bitmap.height * scale));
      c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height);
      const data = c.toDataURL("image/jpeg", 0.8);
      if (data.length > 1500000)
        fail("Image is still too large. Choose a smaller thumbnail.");
      return data;
    } finally {
      bitmap.close();
    }
  }
  async function openAlbum(e) {
    if (ui.demo) {
      ui.message = "Demo only. No Google link is opened.";
      refresh();
      return;
    }
    if (!navigator.onLine || e.status !== "Published" || !albumUrl(e.albumUrl))
      return;
    window.open(e.albumUrl, "_blank", "noopener,noreferrer");
    await save(
      rows.map((x) =>
        x.id === e.id ? { ...x, lastOpened: new Date().toISOString() } : x,
      ),
    );
    ui.message = "Link-open action recorded, not confirmed Google viewing.";
    refresh();
  }
  function view(e) {
    ui.selected = e.id;
    refresh();
  }
  function card(e) {
    const article = el("article", null, "hf-card"),
      b = action(null, () => view(e), "hf-card-link"),
      picture = el("div", null, "hf-art"),
      img = el("img");
    img.src = e.thumbnail || art;
    img.alt = e.thumbnail
      ? "Local thumbnail for " + (e.canonicalName || e.title)
      : "Illustrative placeholder, not the album contents";
    picture.append(
      img,
      el(
        "span",
        e.needsDetails ? "Draft · Needs details" : e.status,
        "hf-badge",
      ),
    );
    const info = el("div", null, "hf-info");
    info.append(
      el(
        "p",
        e.needsDetails ? "Needs details" : e.cardType === "Album/Collection" ? "Album/Collection" : e.canonicalName.slice(0, 6),
        "hf-code",
      ),
      el("h3", e.needsDetails || e.cardType === "Album/Collection" ? e.title : name(e.canonicalName).title),
      el("p", e.series || "Series not set"),
      el("p", e.synopsis || "No synopsis added.", "hf-synopsis"),
      el("span", e.cardType === "Album/Collection" ? "View collection ↗" : "View Episode ↗", "hf-link-label"),
    );
    b.setAttribute("aria-label", "View " + (e.canonicalName || e.title));
    b.append(picture, info);
    article.append(b);
    return article;
  }
  function catalogue(body) {
    const current = ui.demo ? samples : rows,
      hero = el("section", null, "hf-hero"),
      img = el("img");
    img.src = art;
    img.alt = "Original illustrative mountain horizon";
    const words = el("div");
    words.append(
      el("p", "YOUR OFFLINE CATALOGUE", "hf-eyebrow"),
      el("h1", "Your chapters, kept close."),
      el("p", "Browse your cards offline. Open Google Photos albums online."),
    );
    const buttons = el("div", null, "hf-buttons");
    buttons.append(
      action(
        "Add episodes",
        () => {
          ui.demo = false;
          ui.page = "import";
          refresh();
        },
        "primary",
      ),
      action(ui.demo ? "Your library" : "Explore demo", () => {
        ui.demo = !ui.demo;
        ui.selected = null;
        ui.query = "";
        ui.series = "All";
        refresh();
      }),
    );
    words.append(buttons);
    hero.append(img, words);
    body.append(hero);
    const section = el("section", null, "hf-body");
    section.append(
      el("h2", ui.page === "recent" ? "Continue browsing" : "Your library"),
    );
    const filters = el("div", null, "hf-filters"),
      q = input(ui.query, "Search HomeFlex episodes");
    q.placeholder = "Title, series or S01E01";
    const list = el("div", null, "hf-grid");
    function fill() {
      list.replaceChildren();
      let visible = current
        .filter(
          (e) =>
            (ui.series === "All" || e.series === ui.series) &&
            `${e.canonicalName} ${e.title || ""} ${e.series} ${e.synopsis}`
              .toLowerCase()
              .includes(ui.query.toLowerCase()),
        )
        .sort(
          (a, b) =>
            a.series.localeCompare(b.series) ||
            a.canonicalName
              .slice(0, 6)
              .localeCompare(b.canonicalName.slice(0, 6)),
        );
      if (ui.page === "recent")
        visible = visible
          .filter((e) => e.lastOpened)
          .sort((a, b) => b.lastOpened.localeCompare(a.lastOpened));
      for (const e of visible) list.append(card(e));
      if (!visible.length) {
        const empty = el("div", null, "hf-empty");
        empty.append(
          el(
            "h3",
            current.length
              ? "No episodes match this view."
              : "Your library starts here.",
          ),
          el(
            "p",
            ui.page === "recent"
              ? "Opening an album records a link-open action here, not confirmed Google viewing."
              : "Paste album links to create Draft cards, then add title, series and episode code later.",
          ),
          action(
            "Batch import",
            () => {
              ui.demo = false;
              ui.page = "import";
              refresh();
            },
            "primary",
          ),
        );
        list.append(empty);
      }
    }
    q.addEventListener("input", () => {
      ui.query = q.value;
      fill();
    });
    filters.append(
      label("Search episodes", q),
      choices(
        "Series",
        [
          ["All", "All"],
          ...[...new Set(current.map((e) => e.series).filter(Boolean))].map(
            (s) => [s, s],
          ),
        ],
        ui.series,
        (v) => {
          ui.series = v;
          fill();
        },
      ),
    );
    section.append(filters);
    const missing = gaps(current);
    if (missing.length)
      section.append(
        el(
          "p",
          "Sequence gaps: " +
            missing.join(", ") +
            ". Warnings only; no automatic repairs.",
          "small",
        ),
      );
    section.append(list);
    fill();
    body.append(section);
  }
  function details(body, e) {
    const section = el("section", null, "hf-body");
    section.append(
      action("← Back to episodes", () => {
        ui.selected = null;
        refresh();
      }),
    );
    const grid = el("div", null, "hf-detail-grid"),
      img = el("img");
    img.src = e.thumbnail || art;
    img.alt = e.thumbnail ? "Local thumbnail" : "Illustrative placeholder";
    const info = el("div");
    info.append(
      el(
        "p",
        e.needsDetails ? "Draft · Needs details" : e.series + " · " + e.status,
        "hf-eyebrow",
      ),
      el("h1", e.cardType === "Album/Collection" ? e.title : e.canonicalName || e.title),
      el("p", e.synopsis || "No synopsis added."),
      action(
        ui.demo
          ? "Demo album action"
          : navigator.onLine
            ? "Open Google Photos ↗"
            : "Internet needed to open album",
        () => openAlbum(e),
        "primary",
        busy ||
          e.needsDetails ||
          e.status !== "Published" ||
          (!navigator.onLine && !ui.demo),
      ),
      el(
        "p",
        "Opens a new tab. Google may ask you to sign in or request sharing access. HomeFlex cannot bypass access controls, download media or confirm a successful view.",
        "small",
      ),
    );
    grid.append(img, info);
    section.append(grid);
    if (!ui.demo) {
      const edit = el("section", null, "hf-editor");
      edit.append(
        el("h2", "Local card settings"),
        ...(e.needsDetails
          ? [
              el(
                "p",
                "Choose Album/Collection for an album without episode numbering, or Episode for a canonical S01E01 card.",
                "small",
              ),
            ]
          : [
              choices(
                "Card status",
                [
                  ["Draft", "Draft"],
                  ["Published", "Published"],
                  ["Unavailable", "Unavailable"],
                ],
                e.status,
                (v) =>
                  save(
                    rows.map((x) => (x.id === e.id ? { ...x, status: v } : x)),
                  ),
              ),
            ]),
        el(
          "p",
          "Published enables this browser’s link button. It does not share the card or create administrator/viewer security.",
          "small",
        ),
      );
      const titleInput = input(
          e.needsDetails ? "" : e.cardType === "Album/Collection" ? e.title : name(e.canonicalName).title,
          "Album title",
        ),
        seriesInput = input(e.series, "Album series"),
        codeInput = input(
          e.needsDetails ? "" : e.canonicalName.slice(0, 6),
          "Episode code",
        );
      titleInput.maxLength = 120;
      seriesInput.maxLength = 80;
      codeInput.maxLength = 6;
      codeInput.placeholder = "S01E01";
      let cardType = e.cardType || "Episode";
      const typeChoice = choices("Card type", [["Episode", "Episode"], ["Album/Collection", "Album/Collection"]], cardType, v => {cardType=v;});
      const notes = el("textarea");
      notes.value = e.synopsis;
      notes.rows = 3;
      notes.maxLength = 500;
      notes.setAttribute("aria-label", "Album notes");
      edit.append(
        typeChoice,
        label("Title", titleInput),
        label("Series", seriesInput),
        label("Episode code", codeInput),
        label("Notes", notes),
        action(
          "Save card details",
          async () => {
            const canonicalName =
              codeInput.value.trim() + " - " + titleInput.value.trim();
            if (cardType === "Episode" && (!name(canonicalName) || !seriesInput.value.trim()) || cardType === "Album/Collection" && (!titleInput.value.trim() || (codeInput.value.trim() && !name(canonicalName)))) {
              ui.error =
                "Episode needs a series, title and exact S01E01 code. Album/Collection needs a title; series/code are optional, but any code must be exact S01E01. Nothing changed.";
              refresh();
              return;
            }
            const next = {
              ...e,
              series: seriesInput.value.trim(),
              canonicalName: cardType === "Album/Collection" && !codeInput.value.trim() ? "" : canonicalName,
              cardType,
              status: "Draft",
              synopsis: notes.value,
            };
            delete next.needsDetails;
            if(cardType === "Album/Collection") next.title = titleInput.value.trim(); else delete next.title;
            await save(rows.map((x) => (x.id === e.id ? next : x)));
          },
          "primary",
          busy,
        ),
        el(
          "p",
          "Saving details returns this card to Draft. Album/Collection does not require episode numbering. Captures use only supplied titles and URLs, never fetch album data.",
          "small",
        ),
      );
      const description = el("textarea");
      description.value = e.synopsis;
      description.maxLength = 500;
      description.rows = 4;
      edit.append(
        label("Synopsis", description),
        action(
          "Save synopsis",
          () =>
            save(
              rows.map((x) =>
                x.id === e.id ? { ...x, synopsis: description.value } : x,
              ),
            ),
          "",
          busy,
        ),
      );
      const fi = input("", "Local thumbnail", "file");
      fi.accept = "image/png,image/jpeg,image/webp";
      fi.disabled = busy;
      fi.addEventListener("change", async () => {
        try {
          if (fi.files[0]) {
            const data = await thumbnail(fi.files[0]);
            await save(
              rows.map((x) => (x.id === e.id ? { ...x, thumbnail: data } : x)),
            );
          }
        } catch (err) {
          ui.error = err.message;
          refresh();
        }
      });
      edit.append(
        label("Local thumbnail", fi),
        el(
          "p",
          "PNG/JPEG/WebP up to 5 MB. Resized and re-encoded to remove original file metadata. Stays local, included in HomeFlex backups. No remote thumbnail request.",
          "small",
        ),
      );
      if (e.thumbnail)
        edit.append(
          action(
            "Remove thumbnail",
            () =>
              save(
                rows.map((x) => {
                  if (x.id !== e.id) return x;
                  const next = { ...x };
                  delete next.thumbnail;
                  return next;
                }),
              ),
            "",
            busy,
          ),
        );
      edit.append(
        action(
          "Delete this local card",
          () =>
            showConfirmDialog(
              "Delete HomeFlex card?",
              e.canonicalName +
                " will be removed from this browser. Export a backup first if you need to undo.",
              async () => {
                if (await save(rows.filter((x) => x.id !== e.id))) {
                  ui.selected = null;
                  refresh();
                }
              },
              "Delete card",
            ),
          "danger",
          busy,
        ),
      );
      section.append(edit);
    }
    body.append(section);
  }
  function previewRows(cards) {
    const list = el("div", null, "hf-preview-rows");
    for (const e of cards) {
      const r = el("div");
      r.append(
        el("strong", e.canonicalName || e.title),
        el(
          "span",
          e.needsDetails
            ? "Draft · Needs details"
            : e.series + " · " + e.status,
        ),
      );
      list.append(r);
    }
    return list;
  }
  function imports(body) {
    const section = el("section", null, "hf-body");
    section.append(
      el("p", "BATCH IMPORT · LOCAL ONLY", "hf-eyebrow"),
      el("h1", "Paste. Preview. Review."),
      el(
        "p",
        "Paste one Google Photos album link per line. Up to 200 lines per batch.",
      ),
      el(
        "code",
        "Link only, or Series | S01E01 - Title | Google Photos URL",
        "hf-example",
      ),
      el(
        "p",
        "Accepted: HTTPS photos.app.goo.gl short links or photos.google.com album/share links. Format checks do not verify sharing or availability. Link-only cards become Draft with an Untitled album label and Needs details. Add the real title, series and code in the card later. Nothing is guessed.",
        "small",
      ),
    );
    const text = el("textarea");
    text.value = ui.text;
    text.maxLength = 100000;
    text.rows = 8;
    text.setAttribute("aria-label", "Episode batch");
    text.placeholder =
      "Travel | S01E01 - First chapter | https://photos.app.goo.gl/yourAlbum";
    text.addEventListener("input", () => {
      ui.text = text.value;
      ui.preview = null;
      section.querySelector(".hf-preview")?.remove();
    });
    section.append(
      label("Episode batch", text),
      action(
        "Preview cards",
        () => {
          ui.text = text.value;
          ui.preview = { ...batch(ui.text, rows), revision };
          ui.message = "Preview only. Nothing has been saved.";
          refresh();
        },
        "primary",
        !loaded || busy || ui.demo,
      ),
    );
    if (ui.preview) {
      const p = ui.preview,
        box = el("section", null, "hf-preview");
      box.append(
        el(
          "h2",
          p.cards.length +
            " valid cards · " +
            p.errors.length +
            " rejected lines",
        ),
        el(
          "p",
          "Only valid cards below can be applied, all as Draft. Rejected lines remain excluded.",
        ),
      );
      for (const err of p.errors) box.append(el("p", err, "hf-error"));
      if (p.warnings.length)
        box.append(
          el(
            "p",
            "Sequence warnings: " +
              p.warnings.join(", ") +
              ". No automatic fixes.",
          ),
        );
      box.append(
        previewRows(p.cards),
        action(
          "Apply reviewed valid cards as Draft",
          async () => {
            if (p.revision !== revision) {
              ui.error = "Library changed. Generate a fresh preview.";
              refresh();
              return;
            }
            if (await save([...rows, ...p.cards])) {
              ui.preview = null;
              ui.text = "";
              refresh();
            }
          },
          "primary",
          !p.cards.length || busy,
        ),
        action("Discard preview", () => {
          ui.preview = null;
          refresh();
        }),
      );
      section.append(box);
    }
    body.append(section);
  }
  function settings(body) {
    const section = el("section", null, "hf-body");
    section.append(
      el("p", "THIS BROWSER · THIS DEVICE", "hf-eyebrow"),
      el("h1", "Keep a copy."),
      el(
        "p",
        "HomeFlex keeps its catalogue in a separate IndexedDB database. It has no server, account, SQLite or Notion connection. Each device keeps its own library. Clearing browser data, private browsing, eviction or device loss can erase it.",
      ),
      el("h2", "HomeFlex JSON backup & restore"),
      el(
        "p",
        "Export here to move the catalogue to another device. This JSON contains album URLs and thumbnails. Keep it private. Fusion workspace exports do not include HomeFlex; workspace reset does not delete it.",
      ),
      action(
        "Export HomeFlex JSON backup",
        () => {
          download(
            new Blob(
              [
                JSON.stringify(
                  {
                    format: FORMAT,
                    version: 1,
                    exportedAt: new Date().toISOString(),
                    episodes: rows,
                  },
                  null,
                  2,
                ),
              ],
              { type: "application/json" },
            ),
            "homeflex-fusion-backup.json",
          );
          ui.message = "Backup download requested. Keep this file private.";
          refresh();
        },
        "primary",
        !loaded || busy || ui.demo,
      ),
    );
    const fi = input("", "Restore HomeFlex backup", "file");
    fi.accept = "application/json,.json";
    fi.disabled = !loaded || busy || ui.demo;
    fi.addEventListener("change", async () => {
      ui.backup = null;
      try {
        const f = fi.files[0];
        if (!f) return;
        if (f.size > 20000000) fail("Backup exceeds 20 MB.");
        ui.backup = { cards: readBackup(JSON.parse(await f.text())), revision };
        ui.message = "Backup validated for preview. Nothing restored yet.";
        ui.error = "";
      } catch (err) {
        ui.error = err.message + " Nothing changed.";
      }
      refresh();
    });
    section.append(label("Restore from HomeFlex backup", fi));
    if (ui.backup) {
      const p = ui.backup,
        box = el("section", null, "hf-preview"),
        merging = merge(rows, p.cards);
      box.append(
        el("h3", p.cards.length + " backup cards ready for review"),
        choices(
          "Restore mode",
          [
            ["merge", "Merge, keep existing cards"],
            ["replace", "Replace whole HomeFlex library"],
          ],
          ui.restoreMode,
          (v) => {
            ui.restoreMode = v;
            refresh();
          },
        ),
        el(
          "p",
          ui.restoreMode === "merge"
            ? `${merging.additions.length} additions; ${merging.skipped} duplicates skipped.`
            : `${rows.length} existing HomeFlex cards will be removed.`,
        ),
        previewRows(p.cards),
      );
      const apply = async () => {
        if (ui.restoreMode === "merge" && merging.overLimit) {
          ui.error =
            "Merged library exceeds 1,000 cards. Remove cards or choose a reviewed replacement.";
          refresh();
          return false;
        }
        if (p.revision !== revision) {
          ui.error =
            "Library changed. Select the backup file again and review.";
          refresh();
          return false;
        }
        if (
          await save(
            ui.restoreMode === "replace"
              ? p.cards
              : [...rows, ...merging.additions],
          )
        ) {
          ui.backup = null;
          refresh();
          return true;
        }
        return false;
      };
      box.append(
        action(
          "Apply reviewed " + ui.restoreMode,
          () => {
            if (ui.restoreMode === "replace")
              showConfirmDialog(
                "Replace HomeFlex library?",
                "This removes all current HomeFlex cards and replaces them with this backup. Fusion files/notes remain unchanged. Export your current HomeFlex backup first.",
                apply,
                "Replace library",
              );
            else apply();
          },
          ui.restoreMode === "replace" ? "danger" : "primary",
          busy,
        ),
        action("Cancel restore", () => {
          ui.backup = null;
          refresh();
        }),
      );
      section.append(box);
    }
    section.append(
      el("h2", "Fusion installation & offline use"),
      el(
        "p",
        "Use Fusion’s Install app button and wait for Ready offline. HomeFlex uses the same app shell and worker, not a second installation. Catalogue, search, batch imports and backup restore work offline after the shell is cached. Google Photos albums still need internet and their normal sharing access.",
      ),
      action("Open Fusion settings", () => openWindow("settings")),
      action("Ask browser to reduce storage eviction", async () => {
        try {
          const granted = await navigator.storage?.persist?.();
          ui.message = granted
            ? "Persistent storage granted for this origin. Keep backups anyway."
            : "Persistent storage not granted. Keep backups.";
        } catch {
          ui.error = "Persistent storage request unavailable.";
        }
        refresh();
      }),
      el("h2", "Privacy limits"),
      el(
        "p",
        "No analytics, album scraping or remote thumbnail fetching. HomeFlex does not upload its catalogue. Hosting still sees app-page requests. Local data is not encrypted, and other scripts or apps on the same origin can access it. A public app link is not a private account.",
      ),
      el(
        "p",
        "Fusion theme/window/search/launcher controls are reused. HomeFlex has no separate login or cloud sync. This build is DRAFT / REVIEW REQUIRED.",
      ),
      action(
        "Reload HomeFlex from local storage",
        async () => {
          loaded = false;
          ui.preview = null;
          ui.backup = null;
          ui.error = "";
          await load();
          refresh();
        },
        "",
        busy,
      ),
    );
    body.append(section);
  }
  function render(host) {
    host.replaceChildren();
    host.dataset.homeflexVersion = String(version);
    host.classList.add("homeflex-content");
    const body = el("div", null, "homeflex-app"),
      bar = el("div", null, "hf-topbar");
    bar.append(
      el("strong", "HomeFlex"),
      el("span", "DRAFT / REVIEW REQUIRED", "small"),
    );
    const nav = el("nav");
    nav.setAttribute("aria-label", "HomeFlex navigation");
    for (const [key, title] of [
      ["browse", "Browse"],
      ["recent", "Continue browsing"],
      ["import", "Batch import"],
      ["settings", "Backup & info"],
    ])
      nav.append(
        action(
          title,
          () => {
            ui.page = key;
            ui.selected = null;
            ui.error = "";
            refresh();
            root()?.scrollTo(0, 0);
          },
          ui.page === key ? "hf-active" : "",
        ),
      );
    bar.append(nav);
    body.append(
      bar,
      el(
        "p",
        `${navigator.onLine ? "Online" : "Offline"} · Local catalogue · Google albums require internet`,
        "hf-state",
      ),
    );
    if (ui.demo) {
      const n = el("div", null, "hf-notice");
      n.append(
        el(
          "p",
          "Demo mode: synthetic examples only, no links opened or data saved.",
        ),
        action("Return to personal library", () => {
          ui.demo = false;
          ui.selected = null;
          ui.series = "All";
          ui.query = "";
          refresh();
        }),
      );
      body.append(n);
    }
    if (!loaded && !ui.error) {
      body.append(el("p", "Loading HomeFlex library…", "hf-body"));
      load().then(refresh);
    } else {
      const current = ui.demo ? samples : rows,
        detail = current.find((e) => e.id === ui.selected);
      if (detail) details(body, detail);
      else if (ui.page === "browse" || ui.page === "recent") catalogue(body);
      else if (ui.page === "import") imports(body);
      else settings(body);
    }
    const feedback = el("div", null, "hf-feedback");
    feedback.setAttribute("aria-live", "polite");
    if (ui.message) feedback.append(el("p", ui.message));
    if (ui.error) {
      const err = el("p", ui.error, "hf-error");
      err.setAttribute("role", "alert");
      feedback.append(err);
    }
    if (busy) feedback.append(el("p", "Saving…"));
    body.append(feedback);
    host.append(body);
  }
  async function receiveCapture(payload) {
    await load();
    if(!loaded) throw new Error("Local storage unavailable. Nothing captured.");
    if(!payload || typeof payload.title !== "string" || typeof payload.url !== "string" || payload.title.length > 500) throw new Error("Invalid capture payload.");
    const url=albumUrl(payload.url);
    if(!url) throw new Error("Capture needs a valid Google Photos album/share URL.");
    if(Array.isArray(payload.labels)){
      if(payload.labels.length>100)throw new Error("Capture has too many labels.");
      const lines=[];
      for(const label of payload.labels){
        if(typeof label!=="string"||label.length>200)continue;
        const clean=label.trim().replace(/\.(mp4|mkv|avi|mov)$/i,"");
        const full=/^(.+?) \| (S\d{2}E\d{2} - .+)$/.exec(clean);
        const filename=/^(.+?) (S\d{2}E\d{2})$/.exec(clean);
        if(full && name(full[2])) lines.push(full[1]+" | "+full[2]+" | "+url);
        else if(filename && name(filename[2]+" - "+clean)) lines.push(filename[1]+" | "+filename[2]+" - "+clean+" | "+url);
      }
      if(lines.length){ui.demo=false;ui.page="import";ui.selected=null;ui.text=[...new Set(lines)].join("\n");ui.preview={...batch(ui.text,rows),revision};ui.message="Visible episode labels only, possibly partial. Original labels kept as titles, no subtitles guessed. Review before applying Drafts.";refresh();return;}
    }
    const existing=rows.find(x=>x.albumUrl===url && (x.needsDetails || x.cardType==="Album/Collection"));
    ui.demo=false; ui.page="browse";
    if(existing){ui.selected=existing.id;ui.message="Album already in this library. Existing card and status kept.";refresh();return;}
    const title=payload.title.replace(/ - Google Photos$/, "").trim();
    if(title.length>120 || /[\u0000-\u001f\u007f]/.test(title)) throw new Error("Captured title is too long or invalid. Nothing changed.");
    const card={id:crypto.randomUUID(),series:"",canonicalName:"",originalLine:url,albumUrl:url,synopsis:"",status:"Draft",createdAt:new Date().toISOString(),lastOpened:null,
      ...(title ? {cardType:"Album/Collection",title} : {title:`Untitled album ${rows.filter(x=>x.needsDetails).length+1}`,needsDetails:true})};
    validate([...rows,card]);
    if(!await save([...rows,card])) throw new Error(ui.error || "Capture could not be saved.");
    ui.selected=card.id;ui.message="Captured locally as Draft. No media downloaded or published.";refresh();
  }
  window.addEventListener("homeflex-capture", e => receiveCapture(e.detail).catch(err=>{ui.error=err.message;refresh();}));
  window.addEventListener("online", refresh);
  window.addEventListener("offline", refresh);
  window.addEventListener("storage", async (e) => {
    if (e.key !== "homeflex.fusion-test.changed.v1") return;
    try {
      const r = await read();
      rows = r.episodes;
      revision = r.revision;
      version++;
      ui.preview = null;
      ui.backup = null;
      ui.message = "Another tab changed HomeFlex. Pending previews cleared.";
      refresh();
    } catch (err) {
      ui.error = err.message;
      refresh();
    }
  });
  return { render, albumUrl, name, validate, batch, gaps, readBackup, merge, receiveCapture };
})();
