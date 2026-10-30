<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/wordmark-dark.svg">
  <img src="./docs/wordmark-light.svg" alt="emailens" width="320">
</picture>

**Email rendering checks for your CI**

[![license](https://img.shields.io/github/license/emailens/action?cacheSeconds=86400)](./LICENSE)
[![MCP](https://img.shields.io/badge/MCP-Server-blue)](https://github.com/emailens/mcp)
[![GitHub stars](https://img.shields.io/github/stars/emailens/action?style=flat&cacheSeconds=86400)](https://github.com/emailens/action/stargazers)

</div>

Fail your PR if emails have critical rendering issues. Checks HTML, React Email (JSX), MJML, and Maizzle email templates against 21 email clients and reports compatibility scores with framework-aware fix suggestions.

> **Also available as an [MCP server](https://github.com/emailens/mcp)** — analyze and fix emails directly from Claude, Cursor, or any MCP-compatible AI assistant.

## Quick Start

```yaml
# .github/workflows/email-check.yml
name: Email Preview Check
on: [pull_request]

jobs:
  check-emails:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: emailens/action@v1
        with:
          pattern: "emails/**/*.html"
          threshold: "70"
```

## Pull request comment (opt-in)

Set `comment: true` and grant the job `pull-requests: write`, and the action
keeps one comment on the pull request with the score per client for each
template, worst client first, and the first fix. Every push edits the same
comment instead of adding one. When the check fails, the comment ends with a
link to see the email rendered in Gmail, Outlook and Apple Mail, no signup.

```yaml
jobs:
  check-emails:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write # only for the comment
    steps:
      - uses: actions/checkout@v4
      - uses: emailens/action@v1
        with:
          pattern: "emails/**/*.html"
          comment: true
```

It comments only on `pull_request` events. On any other event, or when the
token cannot write comments (pull requests from forks never can), it logs one
line and skips; the check itself is unaffected. It uses the job's own
`github.token`: no secret to add, and the token is sent only to the GitHub
API, never printed. Without `comment: true` it makes no GitHub API call at
all. Needs Node on the runner (GitHub-hosted runners have it).

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `pattern` | Glob pattern to find email HTML files | `emails/**/*.html` |
| `threshold` | Minimum score (0-100) per client | `70` |
| `format` | Input format: `html`, `jsx`, `mjml`, or `maizzle` | `html` |
| `api-key` | API key for authenticated requests | - |
| `clients` | Comma-separated client IDs to check | all clients |
| `max-files` | Maximum files to check per run | `50` |
| `fail-on-error` | Fail if critical errors found | `true` |
| `comment` | Opt-in: keep one comment with the score per client on the pull request | `false` |
| `github-token` | Token used for the comment, only read when `comment` is `true` | `github.token` |

## Outputs

| Output | Description |
|--------|-------------|
| `passed` | `true` if all files pass, `false` otherwise |
| `summary` | Human-readable results summary |
| `results` | JSON array with per-file scores |

## Example with all options

```yaml
- uses: emailens/action@v1
  with:
    pattern: "src/emails/**/*.html"
    threshold: "80"
    format: "mjml"
    api-key: ${{ secrets.EMAILENS_API_KEY }}
    clients: "gmail-web,outlook-windows,apple-mail-macos"
    max-files: "20"
    fail-on-error: "true"
```

> **Quota note:** Free tier allows 30 previews/day. Each file counts as one preview. Use `max-files` and `clients` to stay within limits, or add an `api-key` for higher quotas.

## Inbox mode: the email your app actually sends

What breaks after you check a template is the sending pipeline: a variable
that empties after a deploy, a link that points at staging, signing that
stops passing. In `inbox` mode the step waits for the real email your app
sent to your Emailens test inbox and fails when it is no longer the email
you checked, or changed since it last arrived. Codes, tokens and tracking
ids differ on every send and do not count.

```yaml
- name: Note the time
  id: t
  run: echo "since=$(date +%s000)" >> "$GITHUB_OUTPUT"

- name: Make the app send its sign-up email
  run: npm run send-signup-email   # to your Emailens test inbox address

- uses: emailens/action@v1
  with:
    mode: inbox
    subject: "Welcome"
    since: ${{ steps.t.outputs.since }}
    api-key: ${{ secrets.EMAILENS_API_KEY }}
```

| Input | Default | |
|---|---|---|
| `mode` | `templates` | `inbox` for this mode |
| `subject`, `sender` | | Part of the subject or sender to wait for |
| `inbox` | any | Inbox id |
| `since` | `2m` | ISO time, epoch ms, or a duration back; take it before the send |
| `timeout` | `60` | Seconds to wait, at most 600 |
| `fail-on` | `all` | `check`, `drift` or `none` to narrow it |

An email you never checked in Emailens, and its first arrival, pass and say
so. Needs an API key and Node on the runner (GitHub-hosted runners have it);
it runs `@emailens/cli`'s `emailens inbox wait`.

## Available Client IDs

`gmail-web`, `gmail-android`, `gmail-ios`, `outlook-web`, `outlook-windows`, `outlook-windows-legacy`, `outlook-ios`, `outlook-android`, `outlook-macos`, `apple-mail-macos`, `apple-mail-ios`, `yahoo-mail`, `yahoo-mail-android`, `yahoo-mail-ios`, `samsung-mail`, `thunderbird`, `hey-mail`, `protonmail`, `aol`, `fastmail`, `superhuman`

## Development

`node --test` runs the comment tests (`comment.test.mjs`): opt-in, create vs
update, and every skip.

## Related

- **[MCP Server](https://github.com/emailens/mcp)** — Analyze and fix emails from Claude, Cursor, or any MCP client
- **[Engine](https://github.com/emailens/engine)** — Core analysis library (npm)
- **[CLI](https://github.com/emailens/cli)** — Command-line tool
- **[Web](https://emailens.dev)** — Hosted version with screenshots and sharing
- **[Email CSS support](https://emailens.dev/email-css)** — The data behind each finding, per feature and per client

## License

MIT
