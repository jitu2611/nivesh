"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="agent-lab-loading">
      <strong>Nivesh could not load this view.</strong>
      <span>No paper or brokerage action was taken.</span>
      <button className="button-primary" onClick={reset}>Try again</button>
    </main>
  );
}
