import { test } from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret } from "./secret";

test("round trip", () => {
  const enc = encryptSecret("sk-test-123", "k1");
  assert.ok(enc.startsWith("v1:"));
  assert.ok(!enc.includes("sk-test-123"));
  assert.equal(decryptSecret(enc, "k1"), "sk-test-123");
});

test("same text encrypts differently each time", () => {
  assert.notEqual(encryptSecret("x", "k1"), encryptSecret("x", "k1"));
});

test("another key cannot decrypt", () => {
  assert.equal(decryptSecret(encryptSecret("sk-test-123", "k1"), "k2"), null);
});

test("tampered data is rejected", () => {
  const [v, iv, tag, data] = encryptSecret("sk-test-123", "k1").split(":");
  const flipped = Buffer.from(data, "base64url"); flipped[0] ^= 1;
  assert.equal(decryptSecret([v, iv, tag, flipped.toString("base64url")].join(":"), "k1"), null);
  assert.equal(decryptSecret("garbage", "k1"), null);
});
