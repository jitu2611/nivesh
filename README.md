# Nivesh

A cautious, multi-agent investment workspace for Indian markets. The personal portfolio remains focused on evidence-backed delivery investing; the isolated `/agent` sleeve is a paper-only NIFTY long-options laboratory.

## Current milestone

- Modern responsive dashboard
- Configurable bot capital and visible risk limits
- Portfolio, opportunity, news, decision and agent views
- Bull/bear debate workspace
- India market movers and market pulse
- Real Kite MCP login flow, portfolio synchronization and authorization status
- On-demand multi-agent research powered by the pi SDK and current web/Kite tools
- Structured Scout, Pulse, bull, bear and portfolio-verdict reports with source links
- Server-side read-only Kite tool policy; order tools are blocked by allowlist and interception
- Dedicated `/agent` trading lab with a persistent bot-managed sleeve, capital curve, positions, research intent and risk-engine audit trail
- NIFTY long-option paper engine with exact NFO contract/lot validation, current Kite marks, simulated slippage/charges and bot-only attribution
- Simulated two-leg OCO GTT exits with predefined stop-loss and target; all equities, other indices, futures, shorts and option writing are rejected
- Simulation-first status throughout the UI

Authenticated Kite holdings, last prices, unrealised P&L and available equity cash are now loaded read-only. Performance history, opportunities, agent reports, market movers and news remain illustrative until their respective live-data milestones.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Safety model

1. Research agents never receive brokerage credentials.
2. A deterministic risk engine can veto every proposal.
3. Execution is a separate service and will require explicit approval.
4. Quotes, holdings, cash and open orders must be refreshed before any order.
5. Live orders remain disabled until authentication, persistence, audit logs and reconciliation are implemented and tested.

## Planned architecture

- Next.js/TypeScript web application
- Python/FastAPI analysis and agent workers
- PostgreSQL decision journal and portfolio snapshots
- Scheduled India-market news ingestion with one-hour staleness
- Kite OAuth adapter for read-only portfolio sync, followed later by approval-based execution
- Versioned prompts/policies and offline evaluation before strategy changes

## Kite authentication

Select **Connect Kite** in the sidebar and then **Authenticate with Kite**. Nivesh requests a login URL from the official Kite MCP server and opens it in a separate tab. After authenticating, return to Nivesh; it checks the connection again automatically, or use **Check connection**.

Kite credentials are handled by the official authentication page and MCP transport. Nivesh never asks for a Zerodha password or 2FA value. The current server policy permits login and read operations only.

## Pi research runtime

Use **Run live research** in the Agent Room to start a portfolio-aware workflow. Independent pi sessions run the news/opportunity screen, bull and bear reviews, and a final research-only portfolio verdict. Reports are schema-validated, source-linked, rate-limited, and saved locally under `.nivesh-data/` (ignored by Git). No order proposal or execution tool is available to these sessions. Once authorized, the dashboard calls `/api/kite/portfolio` to normalize holdings, margins and positions without caching the response.

## Environment

Copy `.env.example` to `.env.local`. Keep `BROKER_MODE=mock` for order execution during development. Never commit Kite secrets or access tokens.

## Repository

The project is already initialized as a local Git repository. A private GitHub remote can be created later without changing the project structure.
