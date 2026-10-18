# Deployment Runbook

Production operations for Passie on Cloudflare Workers, D1, and Cloudflare Access. This document is for operators. For everyday local development, see the [README](../README.md).

Passie runs in two remote environments:

| Environment | Worker | D1 database | Domain |
| :--- | :--- | :--- | :--- |
| Production | `passie` | `passie` (`176bd801-9d6f-4d7e-8306-83ea0a0be157`) | `passie.goedvolk.org` |
| Staging | `passie-staging` | `passie-staging-db` (`1c936aac-181c-47dc-98c2-6f6d64416595`) | `passie-dev.goedvolk.org` |

Migrations, deploys, and seeding are separate commands per environment. There is no shared data between them.

## First-time setup

Run these steps once, before the Worker and database exist. Running them against a populated production database can overwrite live data.

1. **Authenticate with Cloudflare:**

   ```bash
   pnpm exec wrangler login
   ```

2. **Provision the production D1 database:**

   ```bash
   pnpm exec wrangler d1 create passie
   ```

   Record the returned `database_id` in `wrangler.jsonc` under `d1_databases[0].database_id` (see [ADR 0011](decisions/0011-production-database-id.md)), then run `pnpm cf-typegen`.

3. **Configure Cloudflare Access (Zero Trust dashboard):**
   - Create a Worker-level Access application (destination type `worker`, covering production and previews).
   - Add a policy with decision `Bypass` and the rule `Country = Netherlands`.
   - Disable the `workers.dev` route for the Worker.
   - Enable Workers Logs and observability for the Worker.

4. **Bootstrap the first group administrator.** Public registration is disabled, so the first admin must be linked in D1 before login works. Replace the placeholder name, email, and slug:

   ```bash
   # 1. Insert an auth_user record:
   pnpm exec wrangler d1 execute passie --remote --command "
     INSERT INTO auth_user (id, name, email, email_verified, role, banned, created_at, updated_at)
     VALUES ('user_admin_primary', 'Jouw Naam', 'jouw-email@voorbeeld.nl', 1, 'admin', 0, cast(unixepoch('subsecond')*1000 as integer), cast(unixepoch('subsecond')*1000 as integer));
   "

   # 2. Link the member slug and grant the group admin role:
   pnpm exec wrangler d1 execute passie --remote --command "
     UPDATE members SET user_id = 'user_admin_primary', role = 'admin' WHERE slug = 'jouwnaam';
   "
   ```

   Once logged in at `https://passie.goedvolk.org/inloggen`, manage all other members and email addresses in the UI at `/beheer`.

5. **Seed the initial group data once.** Group structure, members, and initial passes are bootstrapped on day zero. After that, manage member additions, renames, and email assignments through `/beheer`.

6. **Trigger initial fixture ingestion:**

   ```bash
   curl -i -H "Authorization: Bearer $PASSIE_CRON_SECRET" https://passie.goedvolk.org/api/cron/ingest
   ```

   This is only needed while no fixtures exist. The cron trigger (`0 */6 * * *`) keeps fixtures current afterwards, so do not re-run this by hand on later deploys.

## Every deploy

Run this list for each release. Migrate staging, verify it, then repeat for production.

1. **Set any new secrets introduced by this release** (compare against the Configuration section of the README):

   ```bash
   pnpm exec wrangler secret put <NEW_SECRET_NAME>
   ```

   Then regenerate the typed Worker environment so the new binding is visible locally:

   ```bash
   pnpm cf-typegen
   ```

   `worker-configuration.d.ts` is generated per environment and gitignored. Each contributor and worktree regenerates it after changing `.dev.vars`; `.kilo/setup-script.sh` does this automatically for new worktrees.

   Note: `pnpm cf-typegen` can change `pnpm typecheck` results. Wrangler types every key in `.dev.vars` as a required `string` on `NodeJS.ProcessEnv`, so code that simulates an absent variable with `delete process.env.X` starts failing with `TS2790` once that key is generated. Use `Reflect.deleteProperty(process.env, "X")` in tests instead. Because the generated file is gitignored, typecheck outcomes differ between machines, so re-run `pnpm typecheck` after `pnpm cf-typegen`.

2. **Apply pending migrations to staging:**

   ```bash
   pnpm db:migrate:staging
   ```

   Safe to run every time. Wrangler tracks applied migrations per database and only executes new files in `drizzle/`. It prints `No migrations to apply!` when nothing is pending.

3. **Deploy staging and smoke test it:**

   ```bash
   pnpm deploy:staging
   ```

   Verify the changed surface at `https://passie-dev.goedvolk.org`. Admin auth can be checked without a browser:

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://passie-dev.goedvolk.org/api/admin/members   # expect 403
   curl -s -o /dev/null -w "%{http_code}\n" https://passie-dev.goedvolk.org/inloggen            # expect 200
   ```

4. **Record a production data baseline** so the release can be proven non-destructive:

   ```bash
   pnpm exec wrangler d1 execute passie --remote --json --command "SELECT (SELECT count(*) FROM members) AS members, (SELECT count(*) FROM passes) AS passes, (SELECT count(*) FROM fixtures) AS fixtures, (SELECT count(*) FROM queue_entries) AS queue_entries, (SELECT count(*) FROM possession_events) AS possession_events, (SELECT count(*) FROM activity_events) AS activity_events;"
   ```

5. **Apply pending migrations to production:**

   ```bash
   pnpm db:migrate:prod
   ```

6. **Do not re-seed production or trigger manual ingest.** Production holds live matchday pool states and custody records. Member and email management happens through `/beheer`.

7. **Build and deploy:**

   ```bash
   pnpm deploy
   ```

8. **Smoke test production.** Confirm an actual login in the browser at `/inloggen`, then navigate to `/beheer`. The unauthenticated checks:

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://passie.goedvolk.org/api/admin/members   # expect 403
   curl -s -o /dev/null -w "%{http_code}\n" https://passie.goedvolk.org/inloggen            # expect 200
   ```

9. **Re-run the baseline query from step 4 and diff the counts.** They must be identical unless the release deliberately writes data.

## Seeding staging

Staging can be reset with representative test data after schema changes or engine refactors:

```bash
pnpm seed:staging
```

The seed script refuses to run against production. It requires `--env=staging` and asserts the target database is not `passie`.

## Rollback and recovery

- Worker rollback: `pnpm exec wrangler deployments list`, then `pnpm exec wrangler rollback [id]`.
- D1 recovery: record a bookmark with `pnpm exec wrangler d1 time-travel info passie --remote`.
- Kill switch: change the Access policy decision from `Bypass` to `Block` in the Zero Trust dashboard.
