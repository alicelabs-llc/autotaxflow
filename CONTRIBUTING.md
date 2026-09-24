# Contributing to AutoTaxFlow

Thanks for helping make AutoTaxFlow better. The short version:

1. **Open an issue first** for non-trivial changes so we can align on direction before you write code.
2. **Branch from `main`** and name your branch `feat/<short-slug>` / `fix/<short-slug>` / `chore/<short-slug>`.
3. **Conventional commits** (`feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`, `test: ...`, `chore: ...`).
4. **Don't push secrets.** `.env*` is gitignored. If you accidentally commit a secret, force-push and rotate it immediately.
5. **One PR per concern.** A PR that fixes a webhook bug AND adds a UI feature will be rejected.
6. **Keep tests green.** New code requires new tests. `npm run test` must pass locally.
7. **Don't bump dependency ranges in the same PR as a feature change.**

## Local dev bootstrap

```bash
git clone https://github.com/alicelabs-llc/autotaxflow.git
cd autotaxflow
npm install
docker compose up -d
cp .env.example .env
# fill STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, JWT_SECRET, TOKEN_ENC_KEY
npm run db:generate
npm run db:push
npm run dev
```

## Code style

- TypeScript `strict: true`. No `as any` without a comment explaining why.
- Prettier handles formatting; ESLint handles correctness.
- Use Zod schemas from `@autotaxflow/shared` for any request/response shape.
- Database access goes through `@autotaxflow/db` — never instantiate `PrismaClient` directly outside that package.
- Background work goes through BullMQ — never block a Fastify handler with DB writes that aren't the route's own business.
- Every business entity must carry `organizationId` and use `onDelete: Cascade`.

## Review process

- PRs require at least one review from a maintainer.
- CI must be green: lint + typecheck + tests.
- Squash-merge to `main` with the conventional-commit subject as the merge title.

## Releasing

- Maintainers only. Releases are tagged `v0.x.y` and a GitHub Release is created from the CHANGELOG entry.

— AliceLabs LLC
