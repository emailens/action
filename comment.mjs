// The pull request comment: one per pull request, edited in place on every
// push, with the score per client for each template.
//
// Opt-in (`comment: true`): the v1 tag moves forward, so a comment on by
// default would start appearing in repositories that never asked for one.
// It never fails the job. Without permission, outside a pull request, or on
// any API error it prints one line and carries on. The token goes into the
// Authorization header and nowhere else: no line this prints contains it.
//
// Node, not jq: the runner already has it for inbox mode, and this is testable
// (comment.test.mjs, `node --test`).

import { pathToFileURL } from "node:url";

export const MARKER = "<!-- emailens-check -->";
export const TRY_URL = "https://app.emailens.dev/try?utm_source=github-action&utm_medium=pr-comment";
const HOME_URL = "https://emailens.dev/?utm_source=github-action&utm_medium=pr-comment";
// GitHub refuses a comment over 65,536 characters.
const MAX_BODY = 60000;
const MAX_PAGES = 10;

const cell = (v) => {
  const s = String(v).replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|");
  return s.length > 140 ? `${s.slice(0, 139)}…` : s;
};

/** The comment text. `results` is the check step's `results` output. */
export function buildBody({ results, passed, threshold, hasKey }) {
  const t = Number(threshold);
  const below = (r) => Object.values(r.scores ?? {}).some((s) => (s?.score ?? 0) < t);
  const failed = results.filter(below).length;
  const allPass = passed === "true";

  const head = [
    MARKER,
    allPass
      ? `### Emailens: all ${results.length} template(s) pass (threshold ${t}/100)`
      : failed > 0
        ? `### Emailens: ${failed} of ${results.length} template(s) below ${t}/100`
        // fail-on-error: every score clears the threshold, but a client has errors.
        : `### Emailens: errors found, though every score clears ${t}/100`,
    "",
  ];
  // The hosted next step, only when something failed: a clean run is not an
  // occasion to sell.
  const foot = [
    "",
    ...(allPass ? [] : [`See it rendered in Gmail, Outlook and Apple Mail, no signup: ${TRY_URL}`, ""]),
    `<sub>Checked by [Emailens](${HOME_URL}), the email rendering linter. Scores are per client, out of 100.</sub>`,
  ];

  const sections = [];
  let size = head.join("\n").length + foot.join("\n").length;
  let left = results.length;
  for (const r of results) {
    const name = hasKey === "true" && r.id
      ? `[\`${cell(r.file)}\`](https://app.emailens.dev/dashboard/${encodeURIComponent(r.id)}?utm_source=github-action&utm_medium=pr-comment)`
      : `\`${cell(r.file)}\``;
    const rows = Object.entries(r.scores ?? {})
      .map(([client, s]) => ({ client, score: s?.score ?? 0, errors: s?.errors ?? 0, warnings: s?.warnings ?? 0 }))
      .sort((a, b) => a.score - b.score || a.client.localeCompare(b.client));
    const worst = rows[0];
    const summary = worst
      ? `${below(r) ? "✗" : "✓"} ${name}: worst ${cell(worst.client)} ${worst.score}/100`
      : name;
    const section = [
      // Open when it failed: that is the table someone came to read.
      `<details${below(r) ? " open" : ""}><summary>${summary}</summary>`,
      "",
      ...(r.fix ? [`First fix for ${cell(r.worst?.client ?? worst.client)}: ${cell(r.fix)}`, ""] : []),
      "| Client | Score | Errors | Warnings |",
      "|---|---|---|---|",
      ...rows.map((x) => `| ${cell(x.client)} | ${x.score >= t ? x.score : `**${x.score}**`} | ${x.errors} | ${x.warnings} |`),
      "",
      "</details>",
    ].join("\n");
    if (size + section.length + 200 > MAX_BODY) break;
    sections.push(section);
    size += section.length + 1;
    left--;
  }
  if (left > 0) sections.push(`${left} more template(s) are in the job summary.`);

  return [...head, ...sections, ...foot].join("\n");
}

/**
 * Create, update or skip the comment. Returns what it did, for the tests:
 * "disabled" | "not-pr" | "no-results" | "no-token" | "created" | "updated" | "skipped".
 */
export async function run(env, { fetch = globalThis.fetch, log = console.log } = {}) {
  // Unset or anything but "true": no comment and no API call, and no line
  // either, since nobody asked for one.
  if (String(env.INPUT_COMMENT ?? "").trim().toLowerCase() !== "true") return "disabled";

  if (env.EVENT_NAME !== "pull_request" || !/^\d+$/.test(env.PR ?? "")) {
    log(`Emailens: not a pull_request event (${env.EVENT_NAME || "unknown"}), no comment.`);
    return "not-pr";
  }

  let results = [];
  try {
    results = JSON.parse(env.RESULTS || "[]");
  } catch {}
  if (!Array.isArray(results) || results.length === 0) {
    log("Emailens: no results to comment.");
    return "no-results";
  }
  if (!env.GH_TOKEN) {
    log("Emailens: no github-token, no comment.");
    return "no-token";
  }

  const api = (env.GH_API || "https://api.github.com").replace(/\/$/, "");
  const base = `${api}/repos/${env.REPO}/issues`;
  const headers = {
    Authorization: `Bearer ${env.GH_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
  const noWrite = () =>
    log("Emailens: the token cannot write pull request comments, skipped. Add `permissions: pull-requests: write` to the job (pull requests from forks never can).");

  try {
    let existing = null;
    for (let page = 1; page <= MAX_PAGES && !existing; page++) {
      const res = await fetch(`${base}/${env.PR}/comments?per_page=100&page=${page}`, { headers });
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        noWrite();
        return "skipped";
      }
      if (!res.ok) {
        log(`Emailens: could not read the pull request comments (HTTP ${res.status}), skipped.`);
        return "skipped";
      }
      const list = await res.json();
      if (!Array.isArray(list)) break;
      existing = list.find((c) => typeof c?.body === "string" && c.body.startsWith(MARKER)) ?? null;
      if (list.length < 100) break;
    }

    const body = JSON.stringify({
      body: buildBody({ results, passed: env.PASSED, threshold: env.THRESHOLD, hasKey: env.HAS_KEY }),
    });
    const res = existing
      ? await fetch(`${base}/comments/${existing.id}`, { method: "PATCH", headers, body })
      : await fetch(`${base}/${env.PR}/comments`, { method: "POST", headers, body });
    if (res.ok) {
      log(existing ? "Emailens: pull request comment updated." : "Emailens: pull request comment created.");
      return existing ? "updated" : "created";
    }
    if (res.status === 401 || res.status === 403 || res.status === 404) noWrite();
    else log(`Emailens: could not comment on the pull request (HTTP ${res.status}), skipped.`);
    return "skipped";
  } catch (err) {
    // The message of a network error, never the request: that carries the token.
    log(`Emailens: could not reach the GitHub API (${err?.name ?? "error"}), no comment.`);
    return "skipped";
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run(process.env);
}
