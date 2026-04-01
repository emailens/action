# Emailens GitHub Action

[![MCP](https://img.shields.io/badge/MCP-Server-blue)](https://github.com/emailens/mcp)

Fail your PR if emails have critical rendering issues. Checks HTML, React Email (JSX), MJML, and Maizzle email templates against 15 email clients and reports compatibility scores with framework-aware fix suggestions.

> **Also available as an [MCP server](https://github.com/emailens/mcp)** — analyze and fix emails directly from Claude, Cursor, or any MCP-compatible AI assistant.

## Quick Start

```yaml
# .github/workflows/email-check.yml
name: Email Preview Check
on: [pull_request]

jobs:
  check-emails:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: emailens/action@v1
        with:
          pattern: "emails/**/*.html"
          threshold: "70"
```

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `pattern` | Glob pattern to find email HTML files | `emails/**/*.html` |
| `threshold` | Minimum score (0-100) per client | `70` |
| `format` | Input format: `html`, `jsx`, `mjml`, or `maizzle` | `html` |
| `api-url` | Emailens API URL | `https://emailens.dev/api/preview` |
| `api-key` | API key for authenticated requests | - |
| `clients` | Comma-separated client IDs to check | all clients |
| `max-files` | Maximum files to check per run | `50` |
| `fail-on-error` | Fail if critical errors found | `true` |

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

## Available Client IDs

`gmail-web`, `gmail-android`, `gmail-ios`, `outlook-web`, `outlook-windows`, `outlook-windows-legacy`, `outlook-ios`, `outlook-android`, `apple-mail-macos`, `apple-mail-ios`, `yahoo-mail`, `samsung-mail`, `thunderbird`, `hey-mail`, `superhuman`

## Related

- **[MCP Server](https://github.com/emailens/mcp)** — Analyze and fix emails from Claude, Cursor, or any MCP client
- **[Engine](https://github.com/emailens/engine)** — Core analysis library (npm)
- **[CLI](https://github.com/emailens/cli)** — Command-line tool
- **[Web](https://emailens.dev)** — Hosted version with screenshots and sharing

## License

MIT
