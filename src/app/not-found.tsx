import Link from "next/link";

export default function NotFound() {
  return (
    <main className="agent-lab-loading">
      <strong>Page not found</strong>
      <span>The requested Nivesh workspace does not exist.</span>
      <Link className="button-primary" href="/">Return to dashboard</Link>
    </main>
  );
}
