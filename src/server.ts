import { generateOrder, logStatusUpdate, getStatusLog } from "./lib/simulator.js";
import type { RappiOrderRequest, RappiStatusUpdate } from "./types.js";

const PORT = Number(process.env.PORT) || 3000;
const AWS_API_URL = process.env.AWS_API_URL || "http://localhost:3001";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleSendOrder(req: Request): Promise<Response> {
  let body: Partial<RappiOrderRequest> = {};
  try {
    body = await req.json();
  } catch {
    // use defaults
  }

  const order = generateOrder(body);

  try {
    const res = await fetch(`${AWS_API_URL}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
    });

    const data = await res.text();
    const parsed = data ? JSON.parse(data) : {};

    console.log(
      `[Rappi] Order sent → AWS responded ${res.status}: ${data.slice(0, 200)}`,
    );

    return json(
      {
        sent: order,
        response: { status: res.status, body: parsed },
      },
      res.ok ? 200 : 502,
    );
  } catch (err) {
    console.error("[Rappi] Failed to send order to AWS:", err);
    return json({ error: "Failed to reach AWS API", order }, 502);
  }
}

async function handleStatusUpdate(req: Request): Promise<Response> {
  let update: RappiStatusUpdate;
  try {
    update = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!update.order_id || !update.status || !update.timestamp) {
    return json(
      {
        error: "order_id, status, and timestamp are required",
      },
      400,
    );
  }

  logStatusUpdate(update);
  return json({ received: true });
}

async function handleListLog(): Promise<Response> {
  return json({ count: getStatusLog().length, updates: getStatusLog() });
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/health" && req.method === "GET") {
      return json({ status: "ok", uptime: process.uptime() });
    }

    if (url.pathname === "/send-order" && req.method === "POST") {
      return handleSendOrder(req);
    }

    if (url.pathname === "/status-update" && req.method === "POST") {
      return handleStatusUpdate(req);
    }

    if (url.pathname === "/log" && req.method === "GET") {
      return handleListLog();
    }

    return json({ error: "Not found" }, 404);
  },
});

console.log(`[Rappi Simulator] running on http://localhost:${server.port}`);
console.log(`[Rappi Simulator] AWS target: ${AWS_API_URL}`);
