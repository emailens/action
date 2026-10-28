// node --test: the pull request comment, create vs update vs skip.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildBody, MARKER, run, TRY_URL } from "./comment.mjs";

const TOKEN = "ghs_secretTOKEN123";
const RESULTS = [
  {
    file: "emails/welcome.html",
    id: "abc123",
    scores: {
      "gmail-web": { score: 97, errors: 0, warnings: 1 },
      "outlook-windows-legacy": { score: 55, errors: 2, warnings: 4 },
      "apple-mail-macos": { score: 100, errors: 0, warnings: 0 },
    },
    worst: { client: "outlook-windows-legacy", score: 55 },
    fix: "Use a table | not flex",
  },
];

const baseEnv = (over = {}) => ({
  INPUT_COMMENT: "true",
  EVENT_NAME: "pull_request",
  PR: "7",
  REPO: "acme/app",
  GH_API: "https://api.github.com",
  GH_TOKEN: TOKEN,
  RESULTS: JSON.stringify(RESULTS),
  PASSED: "false",
  THRESHOLD: "70",
  HAS_KEY: "false",
  ...over,
});

/** A fake GitHub: answers by method, records every call. */
function fakeGitHub({ list = [], listStatus = 200, writeStatus = 201, throws = false } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", headers: init.headers, body: init.body });
    if (throws) throw new TypeError("fetch failed");
    const method = init.method ?? "GET";
    const status = method === "GET" ? listStatus : writeStatus;
    return { ok: status >= 200 && status < 300, status, json: async () => (method === "GET" ? list : {}) };
  };
  return { fetch, calls };
}

function capture() {
  const lines = [];
  return { log: (l) => lines.push(l), lines };
}

describe("opt-in", () => {
  for (const value of [undefined, "", "false", "no"]) {
    test(`comment ${JSON.stringify(value)}: no comment, no API call, no line`, async () => {
      const gh = fakeGitHub();
      const out = capture();
      const what = await run(baseEnv({ INPUT_COMMENT: value }), { fetch: gh.fetch, log: out.log });
      assert.equal(what, "disabled");
      assert.equal(gh.calls.length, 0);
      assert.equal(out.lines.length, 0);
    });
  }
});

describe("skip", () => {
  test("not a pull_request event: one line, no API call", async () => {
    for (const env of [{ EVENT_NAME: "push", PR: "" }, { EVENT_NAME: "pull_request_target" }, { PR: "" }]) {
      const gh = fakeGitHub();
      const out = capture();
      assert.equal(await run(baseEnv(env), { fetch: gh.fetch, log: out.log }), "not-pr");
      assert.equal(gh.calls.length, 0);
      assert.equal(out.lines.length, 1);
    }
  });

  test("no results: no API call", async () => {
    const gh = fakeGitHub();
    assert.equal(await run(baseEnv({ RESULTS: "[]" }), { fetch: gh.fetch, log: () => {} }), "no-results");
    assert.equal(gh.calls.length, 0);
  });

  test("no write permission on POST: skipped with a line, never thrown", async () => {
    const gh = fakeGitHub({ writeStatus: 403 });
    const out = capture();
    assert.equal(await run(baseEnv(), { fetch: gh.fetch, log: out.log }), "skipped");
    assert.match(out.lines.join("\n"), /pull-requests: write/);
  });

  test("cannot even read the comments: skipped before any write", async () => {
    const gh = fakeGitHub({ listStatus: 403 });
    assert.equal(await run(baseEnv(), { fetch: gh.fetch, log: () => {} }), "skipped");
    assert.equal(gh.calls.filter((c) => c.method !== "GET").length, 0);
  });

  test("network failure: skipped", async () => {
    const gh = fakeGitHub({ throws: true });
    assert.equal(await run(baseEnv(), { fetch: gh.fetch, log: () => {} }), "skipped");
  });
});

describe("create vs update", () => {
  test("no comment of ours yet: POST one", async () => {
    const gh = fakeGitHub({ list: [{ id: 1, body: "LGTM" }] });
    const out = capture();
    assert.equal(await run(baseEnv(), { fetch: gh.fetch, log: out.log }), "created");
    const write = gh.calls.at(-1);
    assert.equal(write.method, "POST");
    assert.equal(write.url, "https://api.github.com/repos/acme/app/issues/7/comments");
    assert.ok(JSON.parse(write.body).body.startsWith(MARKER));
  });

  test("ours exists: PATCH it, never a second one", async () => {
    const gh = fakeGitHub({ list: [{ id: 1, body: "LGTM" }, { id: 42, body: `${MARKER}\nold` }] });
    assert.equal(await run(baseEnv(), { fetch: gh.fetch, log: () => {} }), "updated");
    const writes = gh.calls.filter((c) => c.method !== "GET");
    assert.equal(writes.length, 1);
    assert.equal(writes[0].method, "PATCH");
    assert.equal(writes[0].url, "https://api.github.com/repos/acme/app/issues/comments/42");
  });

  test("ours on the second page of comments is found", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, body: "x" }));
    const calls = [];
    const fetch = async (url, init = {}) => {
      calls.push({ url, method: init.method ?? "GET" });
      const list = /&page=1$/.test(url) ? page1 : [{ id: 500, body: `${MARKER} old` }];
      return { ok: true, status: 200, json: async () => list };
    };
    assert.equal(await run(baseEnv(), { fetch, log: () => {} }), "updated");
    assert.ok(calls.at(-1).url.endsWith("/comments/500"));
  });

  test("the token is sent as a header and never logged", async () => {
    for (const opts of [{}, { writeStatus: 403 }, { listStatus: 500 }, { throws: true }]) {
      const gh = fakeGitHub(opts);
      const out = capture();
      await run(baseEnv(), { fetch: gh.fetch, log: out.log });
      assert.equal(gh.calls[0].headers.Authorization, `Bearer ${TOKEN}`);
      assert.ok(!out.lines.join("\n").includes(TOKEN));
      for (const c of gh.calls) assert.ok(!c.url.includes(TOKEN));
    }
  });
});

describe("body", () => {
  test("a score per client, worst first, and the link when it failed", () => {
    const body = buildBody({ results: RESULTS, passed: "false", threshold: "70", hasKey: "false" });
    assert.ok(body.startsWith(MARKER));
    assert.match(body, /1 of 1 template\(s\) below 70\/100/);
    const rows = body.split("\n").filter((l) => /^\| [a-z]/.test(l) && !l.startsWith("| Client"));
    assert.deepEqual(rows.map((l) => l.split(" | ")[0].slice(2)), ["outlook-windows-legacy", "gmail-web", "apple-mail-macos"]);
    assert.match(body, /\| outlook-windows-legacy \| \*\*55\*\* \| 2 \| 4 \|/);
    assert.ok(body.includes(TRY_URL));
    assert.ok(body.includes("Use a table \\| not flex"));
  });

  test("no link on a clean run", () => {
    const ok = [{ ...RESULTS[0], scores: { "gmail-web": { score: 100, errors: 0, warnings: 0 } } }];
    const body = buildBody({ results: ok, passed: "true", threshold: "70", hasKey: "false" });
    assert.match(body, /all 1 template\(s\) pass/);
    assert.ok(!body.includes("app.emailens.dev/try"));
  });

  test("links the report only with an API key", () => {
    const withKey = buildBody({ results: RESULTS, passed: "false", threshold: "70", hasKey: "true" });
    const without = buildBody({ results: RESULTS, passed: "false", threshold: "70", hasKey: "false" });
    assert.ok(withKey.includes("app.emailens.dev/dashboard/abc123"));
    assert.ok(!without.includes("/dashboard/"));
  });

  test("stays under GitHub's comment limit with 50 templates of 21 clients", () => {
    const clients = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`client-${i}`, { score: 50, errors: 1, warnings: 1 }]));
    const many = Array.from({ length: 300 }, (_, i) => ({ file: `emails/t${i}.html`, scores: clients }));
    const body = buildBody({ results: many, passed: "false", threshold: "70", hasKey: "false" });
    assert.ok(body.length < 65536);
    assert.match(body, /more template\(s\) are in the job summary/);
  });
});
