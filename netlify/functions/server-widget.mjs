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

    const timestamp = request.headers.get("x-widget-timestamp") || "";
    const signature = request.headers.get("x-widget-signature") || "";
    const secret = process.env.SERVER_WIDGET_HMAC_SECRET || "";

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
        "Cache-Control": "public, max-age=10, stale-if-error=30",
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

export { cleanSnapshot, verify };
