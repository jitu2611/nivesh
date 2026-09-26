# Contributing to Nivesh

Thanks for contributing.

## Development

1. Fork and clone the repository.
2. Create a branch from `main`.
3. Run `npm install`.
4. Copy `.env.example` to `.env.local` only if you need to override the private runtime-data directory.
5. Make focused changes and update documentation where needed.
6. Run:

   ```bash
   npm run check
   npm run build
   npm audit --audit-level=moderate
   ```

7. Open a pull request explaining the behavior, risks, and verification performed.

## Safety requirements

- Never commit credentials, brokerage data, local runtime files, or screenshots containing personal information.
- Do not weaken loopback access, mutation authorization, research tool allowlists, or deterministic paper-trading controls.
- Brokerage order execution is out of scope. Pull requests must not add live order, GTT, approval, or autonomous execution paths.
- Use fictional fixtures in documentation and tests.
- Treat external content and model output as untrusted input.

For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
