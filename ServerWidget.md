Die Verantwortung ist jetzt sauber getrennt. Lokal bleibt ausschließlich der Bot-Code; Netlify wird hier weder installiert noch ausgeführt.

## Zuständigkeiten

| Seite | Verantwortlich für | Darf nicht erhalten |
|---|---|---|
| Bot-Seite – hier | Discord-Kanäle erfassen, Kategorien ausschließen, Voice-Nutzer zählen, Payload signieren | Netlify-Login oder Netlify-Token |
| Webentwickler | HTML/CSS/JS, Netlify Functions, Blob-Speicher und Deployment | Bot-Token, Discord-IDs oder Serverzugang |
| Du | gemeinsamen HMAC-Schlüssel sicher übertragen und Veröffentlichung freigeben | Schlüssel niemals öffentlich posten |

## Status der Bot-Seite

Bereits vorbereitet:

- [server_widget.py](/opt/TribeSummoner/cogs/server_widget.py)
- Eintrag in [bot.py](/opt/TribeSummoner/bot.py:422)
- [test_server_widget.py](/opt/TribeSummoner/tests/test_server_widget.py)

Geprüft:

- 7 Datenschutz- und Signaturtests bestanden
- Syntaxprüfung bestanden
- keine Website- oder Netlify-Dateien mehr lokal
- kein Bot-Neustart und kein Deployment erfolgt

Der Bot veröffentlicht alle unterstützten Kanäle außerhalb dieser drei Kategorien:

```text
1269130888869052549
1390594896255254589
1526321896252248256
```

Unterstützt werden Text-, Ankündigungs-, Forum-, Medien-, Voice- und Stage-Kanäle. Bei Voice/Stage werden Bots nicht mitgezählt.

Wichtig: Ein neuer Kanal außerhalb der drei ausgeschlossenen Kategorien wird automatisch öffentlich aufgeführt. Falls eine Ausschlusskategorie gelöscht wird oder dem Bot fehlt, stoppt das gesamte Widget sicherheitshalber.

---

# Folgenden Abschnitt an den Webentwickler weiterleiten

## Auftrag: anonymisiertes Discord-Server-Widget

Du betreust ausschließlich Website und Netlify. Du bekommst keine Discord-IDs, keinen Bot-Token und keinen Zugang zum Bot-Server.

Der Bot sendet per HTTPS:

```json
{
  "schema_version": 1,
  "categories": [
    {
      "label": "Community",
      "channels": [
        { "type": "text", "label": "allgemein" },
        { "type": "announcement", "label": "ankündigungen" },
        { "type": "forum", "label": "grow-forum" },
        { "type": "voice", "label": "Lounge", "count": 4 },
        { "type": "stage", "label": "Bühne", "count": 0 }
      ]
    }
  ]
}
```

Es dürfen keine zusätzlichen Felder wie `id`, `members`, `user`, `avatar`, `topic`, `activity` oder `permissions` angenommen oder veröffentlicht werden.

### 1. Projektstruktur

Die bisherige HTML-Datei kommt in `public/index.html`:

```text
website/
├── public/
│   ├── index.html
│   ├── server-widget.js
│   └── server-widget.css
├── netlify/
│   └── functions/
│       └── server-widget.mjs
├── package.json
└── netlify.toml
```

### 2. package.json

```json
{
  "name": "highsociety-server-widget",
  "private": true,
  "type": "module",
  "dependencies": {
    "@netlify/blobs": "^10.7.11"
  }
}
```

### 3. netlify.toml

```toml
[build]
  publish = "public"
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"
```

### 4. Netlify Function

Datei: `netlify/functions/server-widget.mjs`

```javascript
import { getStore } from "@netlify/blobs";
import { createHmac, timingSafeEqual } from "node:crypto";

const STORE = "highsociety-server-widget";
const KEY = "current";
const MAX_AGE = 5 * 60 * 1000;
const MAX_BODY = 128 * 1024;
const TYPES = new Set([
  "text",
  "announcement",
  "forum",
  "voice",
  "stage",
]);

const snowflake = /(^|\D)\d{17,20}(?=\D|$)/;
const controlChars = /[\u0000-\u001f\u007f]/;

function response(body, status = 200, extraHeaders = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      ...extraHeaders,
    },
  });
}

function exactKeys(object, expected) {
  if (!object || typeof object !== "object" || Array.isArray(object)) {
    return false;
  }

  const actual = Object.keys(object).sort();
  const wanted = [...expected].sort();

  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function validLabel(value) {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= 100
    && !controlChars.test(value)
    && !snowflake.test(value);
}

function cleanSnapshot(payload) {
  if (!exactKeys(payload, ["schema_version", "categories"])) {
    throw new Error("invalid payload");
  }

  if (payload.schema_version !== 1 || !Array.isArray(payload.categories)) {
    throw new Error("invalid schema");
  }

  if (payload.categories.length > 100) {
    throw new Error("too many categories");
  }

  let channelCount = 0;

  const categories = payload.categories.map((category) => {
    if (
      !exactKeys(category, ["label", "channels"])
      || !validLabel(category.label)
      || !Array.isArray(category.channels)
    ) {
      throw new Error("invalid category");
    }

    channelCount += category.channels.length;
    if (channelCount > 500) {
      throw new Error("too many channels");
    }

    const channels = category.channels.map((channel) => {
      if (
        !channel
        || !TYPES.has(channel.type)
        || !validLabel(channel.label)
      ) {
        throw new Error("invalid channel");
      }

      const voice = channel.type === "voice" || channel.type === "stage";
      const keys = voice
        ? ["type", "label", "count"]
        : ["type", "label"];

      if (!exactKeys(channel, keys)) {
        throw new Error("unexpected channel fields");
      }

      if (
        voice
        && (!Number.isInteger(channel.count)
          || channel.count < 0
          || channel.count > 100000)
      ) {
        throw new Error("invalid count");
      }

      return voice
        ? {
            type: channel.type,
            label: channel.label,
            count: channel.count,
          }
        : {
            type: channel.type,
            label: channel.label,
          };
    });

    return { label: category.label, channels };
  });

  return { schema_version: 1, categories };
}

function verify(secret, timestamp, body, supplied) {
  if (
    secret.length < 32
    || !/^\d{13}$/.test(timestamp)
    || !/^v1=[a-f0-9]{64}$/.test(supplied)
  ) {
    return false;
  }

  const expected = `v1=${createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex")}`;

  const left = Buffer.from(expected, "ascii");
  const right = Buffer.from(supplied, "ascii");

  return left.length === right.length && timingSafeEqual(left, right);
}

export default async function handler(request) {
  const path = new URL(request.url).pathname;
  const store = getStore({
    name: STORE,
    consistency: "strong",
  });

  if (path === "/api/internal/server-widget") {
    if (request.method !== "POST") {
      return response(
        { error: "method_not_allowed" },
        405,
        { Allow: "POST" },
      );
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return response({ error: "invalid_request" }, 415);
    }

    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > MAX_BODY) {
      return response({ error: "invalid_request" }, 413);
    }

    const timestamp =
      request.headers.get("x-widget-timestamp") || "";
    const signature =
      request.headers.get("x-widget-signature") || "";
    const secret =
      process.env.SERVER_WIDGET_HMAC_SECRET || "";

    if (!verify(secret, timestamp, body, signature)) {
      return response({ error: "unauthorized" }, 401);
    }

    const sourceTimestamp = Number(timestamp);
    if (
      !Number.isSafeInteger(sourceTimestamp)
      || Math.abs(Date.now() - sourceTimestamp) > MAX_AGE
    ) {
      return response({ error: "expired_request" }, 401);
    }

    let snapshot;
    try {
      snapshot = cleanSnapshot(JSON.parse(body));
    } catch {
      return response({ error: "invalid_request" }, 400);
    }

    const previous = await store.get(KEY, {
      type: "json",
      consistency: "strong",
    });

    if (
      previous
      && Number.isSafeInteger(previous.source_timestamp)
      && sourceTimestamp <= previous.source_timestamp
    ) {
      return response({ error: "stale_request" }, 409);
    }

    await store.setJSON(KEY, {
      ...snapshot,
      updated_at: new Date().toISOString(),
      source_timestamp: sourceTimestamp,
    });

    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (path === "/api/server-widget") {
    if (request.method !== "GET") {
      return response(
        { error: "method_not_allowed" },
        405,
        { Allow: "GET" },
      );
    }

    const stored = await store.get(KEY, {
      type: "json",
      consistency: "strong",
    });

    const updatedAt = Date.parse(stored?.updated_at || "");

    if (
      !stored
      || !Number.isFinite(updatedAt)
      || Date.now() - updatedAt > MAX_AGE
    ) {
      return response(
        { updated_at: null, categories: [] },
        503,
      );
    }

    let snapshot;
    try {
      snapshot = cleanSnapshot({
        schema_version: stored.schema_version,
        categories: stored.categories,
      });
    } catch {
      return response(
        { updated_at: null, categories: [] },
        503,
      );
    }

    return response(
      {
        updated_at: stored.updated_at,
        categories: snapshot.categories,
      },
      200,
      {
        "Cache-Control":
          "public, max-age=10, stale-if-error=30",
      },
    );
  }

  return response({ error: "not_found" }, 404);
}

export const config = {
  path: [
    "/api/internal/server-widget",
    "/api/server-widget",
  ],
  rateLimit: {
    action: "rate_limit",
    aggregateBy: ["ip", "domain"],
    windowLimit: 120,
    windowSize: 60,
  },
};
```

### 5. HTML-Einfügestelle

Im `<head>` ergänzen:

```html
<link rel="stylesheet" href="/server-widget.css">
```

Anstelle der bisherigen fest eingetragenen Kanalliste:

```html
<div class="server-live-card">
  <div class="server-live-header">
    <strong>HighSociety De</strong>
    <span id="serverWidgetSummary">
      Live-Status wird geladen …
    </span>
  </div>

  <div
    id="serverWidgetChannels"
    aria-live="polite"
    aria-busy="true"
  >
    Anonymisierten Server-Status laden …
  </div>
</div>
```

Vor `</body>`:

```html
<script src="/server-widget.js" defer></script>
```

### 6. Sicheres Browser-JavaScript

Datei: `public/server-widget.js`

```javascript
(() => {
  "use strict";

  const container =
    document.getElementById("serverWidgetChannels");
  const summary =
    document.getElementById("serverWidgetSummary");

  if (!container || !summary) return;

  const icons = {
    text: "#",
    announcement: "📣",
    forum: "▤",
    voice: "🔊",
    stage: "◉",
  };

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function unavailable() {
    summary.textContent = "Derzeit nicht verfügbar";
    container.replaceChildren(
      node(
        "div",
        "server-widget-unavailable",
        "Der Server-Status ist momentan nicht verfügbar.",
      ),
    );
    container.setAttribute("aria-busy", "false");
  }

  function render(data) {
    if (!data?.updated_at || !Array.isArray(data.categories)) {
      unavailable();
      return;
    }

    const fragment = document.createDocumentFragment();
    let channelTotal = 0;
    let voiceTotal = 0;

    for (const category of data.categories) {
      const section = node("section", "server-category");
      section.appendChild(
        node("h3", "server-category-title", category.label),
      );

      for (const channel of category.channels) {
        channelTotal += 1;

        const row = node("div", "server-channel");
        row.appendChild(
          node("span", "server-channel-icon", icons[channel.type]),
        );
        row.appendChild(
          node("span", "server-channel-name", channel.label),
        );

        if (channel.type === "voice" || channel.type === "stage") {
          voiceTotal += channel.count;

          row.appendChild(
            node(
              "span",
              "server-channel-count",
              `${channel.count} anwesend`,
            ),
          );

          if (channel.count > 0) {
            const members = node("div", "anonymous-members");
            members.setAttribute(
              "aria-label",
              `${channel.count} anonyme Personen anwesend`,
            );

            const visible = Math.min(channel.count, 8);
            for (let index = 0; index < visible; index += 1) {
              const avatar = node("span", "anonymous-avatar");
              avatar.setAttribute("aria-hidden", "true");
              members.appendChild(avatar);
            }

            if (channel.count > visible) {
              members.appendChild(
                node(
                  "span",
                  "anonymous-overflow",
                  `+${channel.count - visible}`,
                ),
              );
            }

            row.appendChild(members);
          }
        }

        section.appendChild(row);
      }

      fragment.appendChild(section);
    }

    summary.textContent =
      `${channelTotal} Kanäle · ${voiceTotal} im Voice`;

    container.replaceChildren(fragment);
    container.setAttribute("aria-busy", "false");
  }

  async function refresh() {
    if (document.hidden) return;

    try {
      const response = await fetch("/api/server-widget", {
        credentials: "omit",
        headers: { Accept: "application/json" },
      });

      const data = await response.json();

      if (!response.ok) {
        unavailable();
        return;
      }

      render(data);
    } catch {
      unavailable();
    }
  }

  refresh();
  setInterval(refresh, 15000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
})();
```

Wichtig: Kanal- und Kategorienamen werden ausschließlich mit `textContent` eingesetzt, niemals mit `innerHTML`.

Die Klassen dürfen passend zur bestehenden Seite gestaltet werden. Die anonymen Avatare müssen rein dekorative CSS-Silhouetten bleiben. Keine stabilen Farben, Kennungen oder Wiedererkennung einzelner Nutzer erzeugen.

### 7. Netlify-Konfiguration

Im Netlify-Dashboard:

1. Projekt `highsocietyde` öffnen.
2. `Project configuration → Environment variables`.
3. Variable anlegen:

```text
SERVER_WIDGET_HMAC_SECRET
```

4. Den gemeinsam vereinbarten Wert eintragen.
5. Wenn verfügbar:
   - als geheim markieren
   - Scope nur `Functions`
   - mindestens Kontext `Production`
6. Niemals in HTML, JavaScript, `netlify.toml`, Repository oder Build-Log schreiben.

Umgebungsvariablen stehen Netlify Functions serverseitig zur Verfügung. [Offizielle Dokumentation](https://docs.netlify.com/build/functions/environment-variables/)

### 8. Deployment

Ein reiner HTML-Drag-and-drop-Upload reicht für Functions nicht. Entweder Git-Deployment verwenden oder manuell per Netlify CLI:

```bash
npm install
npm install -g netlify-cli
netlify login
netlify link
netlify deploy
```

Zuerst nur die ausgegebene Entwurfs-URL prüfen. Manuelle Deployments mit Functions werden von Netlify offiziell unterstützt. [Netlify CLI](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/#manual-deploys)

Vor dem Bot-Start müssen diese Tests gelten:

```text
GET  /api/server-widget
→ HTTP 503 und {"updated_at":null,"categories":[]}

POST /api/internal/server-widget ohne Signatur
→ HTTP 401
```

Anschließend veröffentlichen:

```bash
netlify deploy --prod
```

Der Webentwickler meldet danach ausschließlich:

```text
1. Production-Deployment erfolgreich: ja/nein
2. SERVER_WIDGET_HMAC_SECRET serverseitig gesetzt: ja/nein
3. GET-Endpunkt erreichbar: ja/nein
4. Interner POST ohne Signatur liefert 401: ja/nein
5. Update-URL:
   https://highsocietyde.netlify.app/api/internal/server-widget
```

Der geheime Wert selbst wird nicht in dieser Rückmeldung genannt.

# Nicht an den Webentwickler weiterleiten: Bot-Konfiguration

Sobald die Web-Seite bereit ist, tragen wir lokal ein:

```dotenv
SERVER_WIDGET_ENABLED=true
SERVER_WIDGET_GUILD_ID=1269130888055230568
SERVER_WIDGET_EXCLUDED_CATEGORY_IDS=1269130888869052549,1390594896255254589,1526321896252248256
SERVER_WIDGET_UPDATE_URL=https://highsocietyde.netlify.app/api/internal/server-widget
SERVER_WIDGET_HMAC_SECRET=<derselbe geheime Wert wie bei Netlify>
SERVER_WIDGET_DEBOUNCE_SECONDS=3
SERVER_WIDGET_HEARTBEAT_SECONDS=120
```

Danach führe ich den vollständigen Bot-Test aus. Der Dienst `tribesummoner.service` wird erst nach deiner ausdrücklichen Freigabe neu gestartet.