import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  cleanSnapshot,
  verify,
} from "../netlify/functions/server-widget.mjs";

const validPayload = {
  schema_version: 1,
  categories: [
    {
      label: "Community",
      channels: [
        { type: "text", label: "allgemein" },
        { type: "voice", label: "Lounge", count: 4 },
      ],
    },
  ],
};

test("accepts and normalizes the documented payload", () => {
  assert.deepEqual(cleanSnapshot(validPayload), validPayload);
});

test("rejects additional identifying fields", () => {
  const payload = structuredClone(validPayload);
  payload.categories[0].channels[0].id = "123";

  assert.throws(() => cleanSnapshot(payload), /unexpected channel fields/);
});

test("rejects Discord snowflakes embedded in labels", () => {
  const payload = structuredClone(validPayload);
  payload.categories[0].channels[0].label = `privat-${"9".repeat(18)}`;

  assert.throws(() => cleanSnapshot(payload), /invalid channel/);
});

test("requires counts only for voice and stage channels", () => {
  const missingCount = structuredClone(validPayload);
  delete missingCount.categories[0].channels[1].count;
  assert.throws(() => cleanSnapshot(missingCount), /unexpected channel fields/);

  const extraCount = structuredClone(validPayload);
  extraCount.categories[0].channels[0].count = 1;
  assert.throws(() => cleanSnapshot(extraCount), /unexpected channel fields/);
});

test("rejects payloads over the channel limit", () => {
  const payload = {
    schema_version: 1,
    categories: [
      {
        label: "Zu groß",
        channels: Array.from({ length: 501 }, (_, index) => ({
          type: "text",
          label: `kanal-${index}`,
        })),
      },
    ],
  };

  assert.throws(() => cleanSnapshot(payload), /too many channels/);
});

test("accepts a matching v1 HMAC signature", () => {
  const secret = "a-secure-test-secret-with-more-than-32-characters";
  const timestamp = "1760000000000";
  const body = JSON.stringify(validPayload);
  const signature = `v1=${createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex")}`;

  assert.equal(verify(secret, timestamp, body, signature), true);
});

test("rejects malformed or mismatching signatures", () => {
  const secret = "a-secure-test-secret-with-more-than-32-characters";
  const timestamp = "1760000000000";
  const body = JSON.stringify(validPayload);

  assert.equal(verify("too-short", timestamp, body, "v1=bad"), false);
  assert.equal(verify(secret, timestamp, body, `v1=${"0".repeat(64)}`), false);
});
