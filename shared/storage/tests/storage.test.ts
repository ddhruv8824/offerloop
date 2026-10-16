// Both backends must behave the same. The database half runs when TEST_DATABASE_URL
// points at a Postgres you don't mind writing to (it uses its own namespace and cleans up).
// Run: pnpm --filter @offerloop/storage test
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { closeStorage, databaseStorage, fileStorage, type Storage } from "../src/index";

const backends: Array<[string, () => Storage]> = [
  ["files", () => fileStorage(mkdtempSync(path.join(tmpdir(), "storage-test-")))],
];
const dbUrl = process.env.TEST_DATABASE_URL;
if (dbUrl) backends.push(["database", () => databaseStorage(dbUrl, `test-${randomBytes(4).toString("hex")}/`)]);
else test("database backend", { skip: "set TEST_DATABASE_URL to run it" }, () => {});

after(closeStorage);

for (const [name, make] of backends) {
  test(`${name}: get / set / delete`, async () => {
    const s = make();
    assert.equal(await s.get("a/missing"), null);
    await s.set("a/one", { text: "héllo \u0000 \"quoted\"", n: 1, list: [1, 2] });
    assert.deepEqual(await s.get("a/one"), { text: "héllo \u0000 \"quoted\"", n: 1, list: [1, 2] });
    await s.set("a/one", { n: 2 });
    assert.deepEqual(await s.get("a/one"), { n: 2 });
    await s.delete("a/one");
    await s.delete("a/one"); // deleting twice is fine
    assert.equal(await s.get("a/one"), null);
  });

  test(`${name}: list returns direct children only`, async () => {
    const s = make();
    await s.set("ws/x/versions/v1", { id: "v1" });
    await s.set("ws/x/versions/v2", { id: "v2" });
    await s.set("ws/x/versions/deep/v3", { id: "v3" });
    await s.set("ws/x/versionsX", { id: "not a child" });
    await s.set("ws/x_/versions/v9", { id: "like-wildcard neighbour" });
    const keys = (await s.list<{ id: string }>("ws/x/versions/")).map((e) => e.key).sort();
    assert.deepEqual(keys, ["ws/x/versions/v1", "ws/x/versions/v2"]);
    assert.deepEqual((await s.keys("ws/x/versions/")).sort(), keys);
    assert.deepEqual(await s.list("ws/nothing/"), []);
  });

  test(`${name}: unsafe keys are refused`, async () => {
    const s = make();
    for (const bad of ["../etc/passwd", "a/../b", "a//b", "", "a/b c", "a/./b"]) {
      await assert.rejects(s.set(bad, 1), RangeError, bad);
      await assert.rejects(s.get(bad), RangeError, bad);
    }
    await assert.rejects(s.list("no-slash"), RangeError);
  });
}

test("namespaces keep features apart in one database", { skip: !dbUrl }, async () => {
  const a = databaseStorage(dbUrl!, `nsA-${randomBytes(3).toString("hex")}/`);
  const b = databaseStorage(dbUrl!, `nsB-${randomBytes(3).toString("hex")}/`);
  await a.set("k", "from a");
  assert.equal(await b.get("k"), null);
  assert.equal(await a.get("k"), "from a");
});
