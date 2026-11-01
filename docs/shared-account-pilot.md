# Learn Chinese shared-account pilot

Implements source issue #52 and personal-website epic #63. The default remains the
existing app-local login until the staged pilot and configuration cutover pass.
No production Auth, database, mail, provider or DNS configuration is applied by
this code change.

## Behaviour

With `NEXT_PUBLIC_SUITE_AUTH_ENABLED=true`, the login page offers
“Continue with jonathantipper.com”. The app starts the existing All Apps OAuth
server's authorisation-code flow with an app-owned state, verifier and exact
callback. The main website owns the login, registration, provider and consent
interface. This app receives only its own code and exchanges it for an app-local
session at `/auth/suite/callback`.

The portable adapter renews through `/auth/v1/oauth/token` with this app's
registered client ID. OAuth tokens are never passed to `supabase.auth.setSession`
or the SDK's regular refresh path. A separate non-persistent Supabase client
verifies the user with `getUser(accessToken)`. API requests retain bearer-token
verification, then reject tokens belonging to another app client. Tokens, codes,
verifiers and user records are not logged by this integration.

Source browser credentials are isolated to this app's origin. The central site's
cookies are not copied into a parent-domain cookie. PKCE transactions use
sessionStorage; app sessions use the adapter's namespaced localStorage and Web
Locks where available. Existing local study/offline state is not uploaded,
deleted or moved to another origin by signing in.

## Configuration

Keep the existing Supabase URL, publishable/legacy anon key and server storage
configuration. Add these explicit public build-time values:

```dotenv
NEXT_PUBLIC_SUITE_AUTH_ENABLED=true
NEXT_PUBLIC_SUITE_AUTH_CLIENT_ID=<registered-public-client-id>
NEXT_PUBLIC_SUITE_AUTH_REDIRECT_URI=https://learn-chinese.jonathantipper.com/auth/suite/callback
NEXT_PUBLIC_SUITE_ACCOUNT_ORIGIN=https://www.jonathantipper.com
NEXT_PUBLIC_SUITE_AUTH_ALLOW_LEGACY_SESSIONS=true
```

Register this exact callback in the All Apps OAuth client and register the client
with the main website's trusted app configuration. Use a public client with PKCE;
there is no browser client secret. Do not derive trust from catalogue membership
or add a wildcard callback.

For an isolated local pilot, use the local Supabase URL/publishable key, an exact
callback such as `http://localhost:4301/auth/suite/callback` and the local main-site
origin. Every browser must open the app at that same callback origin. Starting
from an old Vercel address is refused with a useful canonical-address link rather
than creating a transaction whose verifier cannot be found on return.

The compatibility switch allows existing direct sessions and outstanding
app-local signup/provider returns. It is explicit because those tokens lack an
OAuth `client_id`. Disable it only after the agreed message/session window and
source-app regression checks. Once the browser has used a suite session, it does
not silently fall back to a different older SDK account when that session expires
or is signed out.

## API and database boundary

`lib/auth.ts` first asks Supabase to verify the exact bearer token. Only then does
`lib/suite-token-policy.ts` inspect its verified claims. In suite mode, the API
requires the expected issuer, authenticated audience/role, matching user UUID and
this app's `client_id`. A different app's valid token is denied. Direct tokens
require the explicit compatibility switch. Outside suite mode, those identity
checks remain active and only direct sessions without a `client_id` are accepted;
all OAuth app tokens are rejected, including Learn's previously issued tokens.
Disabling the frontend flag is therefore also an API admission rollback, while
legacy direct sessions stay available without requiring an OAuth client setting. Development identity fallback is
disabled while suite mode is enabled, even if an old dev environment flag remains.

The source APIs use a service-role database client. RLS does not restrict that
client, so preserving user-owned predicates and the API client check is mandatory.
Before exposing browser-direct data access, audit every affected schema's RLS for
ownership and the intended client boundary. An ownership-only policy can allow
another app's token to read the same user's data. The included restrictive-policy
migration adds a separate client condition to existing RLS tables without
weakening their owner checks. It denies every OAuth client until the privileged
operator sets the registered app client ID on the database. Direct sessions stay
available by default for compatibility, until the operator explicitly sets that
window to false. No production RLS is applied by this PR.

The separately reviewed privileged settings update the singleton row:

```sql
UPDATE learn_chinese_private.auth_client_settings
SET oauth_client_id = '<registered-public-client-id>', allow_legacy_sessions = true
WHERE singleton = 1;
```

This schema must stay outside the Data API exposed-schema list. The row contains
only the non-secret public client ID and compatibility switch; authenticated
SELECT is intentionally granted for invoker policy evaluation, while all
authenticated mutations are denied. Only the database owner/service role changes
it. No `SECURITY DEFINER` function is used.

An initial attempt to use database custom settings failed under Supabase's normal
non-superuser postgres role, so the implementation does not depend on unavailable
parameter privileges or connection-pool restarts. When closing compatibility,
change both the app's public build-time compatibility flag and this row's
`allow_legacy_sessions` to false, then repeat direct-token and other-client denial
checks. New app tables need the same restrictive boundary in their own migration.

Current deployed source defaults `SUPABASE_DB_SCHEMA` to `learn_chinese`, while the
shared project's observed exposed-schema list omitted that name. Establish the
actual deployed override/data path and test it before diagnosing or changing API
exposure. Do not expose a schema automatically to make the pilot appear to pass.

## Sessions and navigation

API, push and review-queue requests obtain their token through the explicit
adapter. The app's sign-out is local by default and clears both app-owned suite
state and an older local SDK session. Other apps and the central session remain
available. Account management and suite-wide sign-out live on the main website.
Already-issued JWTs can remain valid until their expiry and validator tolerance;
refresh revocation is not immediate denial of every existing access token.

The callback is public to AuthGate, no-store, noindex and no-referrer. Its code and
state are removed from the visible history before completion work starts. The
legacy SDK never handles that callback as its own PKCE exchange. PWA runtime rules
keep login/auth responses out of caches. Login, desktop controls and the mobile
header provide a stable Launchpad link.

## Verification and rollout

Use the repository's frozen npm lockfile and Node 24. A build-time flag change
requires rebuilding the application.

```sh
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm run start -- --port 4301
```

The focused tests cover exact app callback ownership, safe return paths, OAuth
refresh/rotation, explicit legacy compatibility, local logout and API rejection of
other-client, wrong-issuer/audience/user and unverified tokens. Those tests are not
a claim of a completed multi-origin browser flow.

The release gate is a real browser journey against isolated configuration: start
Learn Chinese, complete main-site login/consent, return to a nested app path,
verify the same test UUID, exercise the app API, refresh after expiry, test another
app/client denial, use concurrent tabs, sign out locally and globally, and exercise
old direct sessions and issued email links. Use synthetic test records only.
Source business-data API functionality, email delivery/providers, PWA updates and
production rollback remain separately recorded evidence.

Deploy accepting main-site and source callback routes before changing shared
defaults. Add registrations/callbacks before removing old ones. Preserve the
normal old-origin login and backups during the local-data transition; an HTTP
redirect does not transfer localStorage, IndexedDB, PWA state or permissions.

Rollback rebuilds with `NEXT_PUBLIC_SUITE_AUTH_ENABLED=false`, restoring direct
SDK login and its existing callback acceptance. Keep newly issued OAuth callback
registration and accepting route until its short-lived transactions have expired.
Do not delete identities, rotate unrelated keys, merge accounts by email, clear
study data or remove legacy callbacks as part of rollback.
