// Opt-in paper scheduler and read-only delivery-buy capture.
// The Nivesh web service must already be running.
const base = new URL(process.env.NIVESH_URL || "http://127.0.0.1:3000");
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) || base.protocol !== "http:") throw new Error("Worker requires a loopback HTTP Nivesh URL.");
let stopping = false;
let wake;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopping = true; wake?.(); });
console.log(`Nivesh paper worker → ${base.origin}. Capturing delivery BUY fills; only explicitly enabled paper algorithms run. No live orders.`);
while (!stopping) {
  try {
    const response = await fetch(new URL("/api/workspace", base), {
      method: "POST", headers: { origin: base.origin, "content-type": "application/json", "x-nivesh-action": "workspace" },
      body: JSON.stringify({ action: "tick" }), signal: AbortSignal.timeout(300000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    console.log(`${new Date().toISOString()} · ${data.algorithms.filter(a => a.enabled).length} enabled strategies · cycle checked`);
  } catch (error) { console.error(`${new Date().toISOString()} · ${error.message}`); }
  if (!stopping) await new Promise(resolve => { const timer = setTimeout(resolve, 60000); wake = () => { clearTimeout(timer); resolve(); }; });
}
console.log("Paper worker stopped. No positions were liquidated.");
