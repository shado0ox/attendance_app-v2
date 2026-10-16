import { test } from "node:test";
import assert from "node:assert/strict";
import { nativeAssociations } from "../src/lib/nativeAssociations";
test("association files authorize only the supplied app signing identities", () => {
  assert.deepEqual(nativeAssociations().apple.webcredentials.apps, []);
  assert.deepEqual(nativeAssociations().android, []);
  const fingerprint = Array(32).fill("AB").join(":");
  const result = nativeAssociations("ABCDE12345", fingerprint);
  assert.deepEqual(result.apple.webcredentials.apps, [
    "ABCDE12345.com.xshadox.wafrdawam",
  ]);
  assert.equal(result.android[0].target.package_name, "com.xshadox.wafrdawam");
  assert.equal(
    result.origins[0],
    "android:apk-key-hash:" +
      Buffer.from("ab".repeat(32), "hex").toString("base64url"),
  );
  assert.throws(() => nativeAssociations("*"));
  assert.throws(() => nativeAssociations("", "*"));
});
