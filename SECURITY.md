# Security policy

## Supported versions

Nivesh is experimental software. Security fixes are applied only to the latest commit on `main`.

## Reporting a vulnerability

Do not open a public issue for suspected vulnerabilities or accidentally exposed financial data or credentials. Use GitHub's **Security → Report a vulnerability** flow for this repository.

Include the affected component, reproduction steps, potential impact, and any suggested mitigation. Remove API keys, access tokens, brokerage identifiers, account details, holdings, and other personal data from reports and screenshots.

## Deployment boundary

Nivesh is designed for a trusted, single-user local environment. Its API routes do not implement multi-user authentication. Do not expose the application to the public internet, run it on a shared host, or connect a public deployment to a brokerage account.

Live trading is incomplete and unsupported. Keep `NIVESH_LIVE_TRADING_ENABLED=false`. Never commit `.env.local` or `.nivesh-data/`; both are excluded by `.gitignore`.
