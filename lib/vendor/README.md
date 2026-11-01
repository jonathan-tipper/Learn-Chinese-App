# Shared account client

`suite-client.mjs` is vendored from `jonathan-tipper/personal-website`,
`integrations/suite-client.mjs`, for the shared account pilot in issue #52.
It is plain JavaScript with no package dependency. The adjacent declaration file
provides the app's TypeScript boundary.

Imported source SHA-256:
`a810ee95f35538d4c49c95a640342401d28a6b98ec23c8f727ac2a85616c39bc`.

The client owns OAuth-server PKCE transactions and app-local token refresh. It
does not share a parent-domain cookie or use the Supabase SDK's regular refresh
endpoint. `lib/suite-auth.ts` adapts it to this app and verifies identity through
the existing Supabase user endpoint.

When updating this copy, compare it with the source implementation and rerun the
callback, refresh, concurrency and account-boundary tests. Do not copy any runtime
credentials or environment files into this directory.
