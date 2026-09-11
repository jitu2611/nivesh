# Contributing to Nivesh

Thanks for contributing.

## Development

1. Fork and clone the repository.
2. Create a branch from `main`.
3. Run `npm install`.
4. Copy `.env.example` to `.env.local`; keep mock mode and live trading disabled.
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
- Do not weaken research tool allowlists, deterministic trade controls, or the live-trading kill switch.
- New execution behavior requires explicit human approval, idempotency, recovery handling, audit records, and tests.
- Use fictional fixtures in documentation and tests.
- Treat external content and model output as untrusted input.

For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
