import AgentTradingDashboard from "@/components/agent-trading-dashboard";
import "./agent.css";

export const metadata = {
  title: "Agent trading lab — Nivesh",
  description: "Monitor simulated agent trading performance, research and feedback.",
};

export default function AgentPage() {
  return <AgentTradingDashboard />;
}
