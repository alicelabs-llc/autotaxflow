# Reporting Security Issues

AutoTaxFlow takes security reports seriously. We coordinate disclosure and aim to ship a fix before any public announcement.

## Scope

In scope:
- Authentication bypass (JWT, sessions).
- Multi-tenant isolation break (one org accessing another org's data).
- Webhook signature spoofing.
- SQL injection via Prisma queries.
- Persistent XSS in the web app.
- SSRF / path traversal in report download URLs.

Out of scope:
- Self-XSS requiring the victim's own token.
- Missing security headers that don't lead to concrete exploitation.
- Theoretical timing attacks without a working PoC.
- Issues in third-party dependencies — report upstream.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.2.x   | ✅        |
| < 0.2   | ❌        |

## Reporting

Email `security@alicelabs.dev` with:
1. Affected version (from `package.json`).
2. Reproduction steps and minimal PoC.
3. Impact assessment.

You will receive acknowledgement within 72 hours. Critical issues get a target SLA of 7 days for a fix release.

Do **not** open a public GitHub Issue for security reports.

## PGP

Fingerprint: `0xDEADBEEF CAFEBABE 12345678 90ABCDEF` (key published on request).
