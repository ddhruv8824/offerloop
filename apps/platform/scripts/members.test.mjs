// Run: node --experimental-strip-types --test scripts/members.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

process.env.OFFERLOOP_DATA_DIR = mkdtempSync(path.join(tmpdir(), "offerloop-members-"));
delete process.env.DATABASE_URL;
process.env.ADMIN_EMAILS = "Owner@Example.com";
process.env.INVITE_CODES = "FRIENDS2026";
delete process.env.SIGNUP_MODE;

const m = await import("../src/lib/server/auth/members.ts");
const user = (id, email) => ({ id, email });

test("admins get in without a code; others need one", async () => {
  assert.equal((await m.ensureMember(user("u-admin", "owner@example.com")))?.role, "admin");
  assert.equal(await m.ensureMember(user("u-1", "someone@example.com")), null);
});

test("a code from the admin page works the set number of times, and can be turned off", async () => {
  const invite = await m.createInvite("for Priya", 1);
  assert.match(invite.code, /^OL-[0-9A-F]{4}-[0-9A-F]{4}$/);
  const joined = await m.redeemInvite(user("u-2", "priya@example.com"), invite.code.toLowerCase());
  assert.equal(typeof joined === "object" && joined.role, "member");
  assert.equal(await m.redeemInvite(user("u-3", "other@example.com"), invite.code), "That invite code has been used up.");
  const many = await m.createInvite("group", 0);
  await m.setInviteDisabled(many.code, true);
  assert.equal(await m.redeemInvite(user("u-4", "x@example.com"), many.code), "That invite code isn't valid.");
  assert.equal(await m.redeemInvite(user("u-4", "x@example.com"), "nope"), "That invite code isn't valid.");
});

test("codes from INVITE_CODES never run out", async () => {
  for (const id of ["u-5", "u-6"]) assert.equal(typeof (await m.redeemInvite(user(id, `${id}@example.com`), " friends2026 ")), "object");
});

test("a code entered at sign-up makes the first sign-in a member", async () => {
  assert.equal(await m.holdInviteForEmail("New@Example.com", "FRIENDS2026"), null);
  assert.equal(await m.holdInviteForEmail("bad@example.com", "WRONG"), "That invite code isn't valid.");
  assert.equal((await m.ensureMember(user("u-7", "new@example.com")))?.invite, "FRIENDS2026");
  assert.equal(await m.ensureMember(user("u-8", "bad@example.com")), null);
});

test("member list and ids", async () => {
  const ids = await m.memberIds();
  for (const id of ["u-admin", "u-2", "u-5", "u-6", "u-7"]) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes("u-1"));
});
