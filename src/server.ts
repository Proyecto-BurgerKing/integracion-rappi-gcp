import {
  fetchOrderStatus,
  generateOrder,
  getStatusLog,
  logStatusUpdate,
  orderStore,
  trackOrder,
} from "./lib/simulator.js";

const AWS_API_URL = process.env.AWS_API_URL ?? "";
const PORT = Number(process.env.PORT) || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleSendOrder(req: Request): Promise<Response> {
  try {
    let body: Partial<ReturnType<typeof generateOrder>> = {};
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json().catch(() => ({}));
    }

    const order = { ...generateOrder(), ...body };

    if (!AWS_API_URL) {
      return json({ error: "AWS_API_URL not configured" }, 503);
    }

    const awsRes = await fetch(`${AWS_API_URL}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
      signal: AbortSignal.timeout(10_000),
    });

    const awsBody = await awsRes.json();

    if (!awsRes.ok) {
      return json({ error: "AWS rejected the order", details: awsBody }, 502);
    }

    // Track the order locally so we can poll its status later
    const tracked = trackOrder(awsBody as any);

    return json({
      message: "Order sent to AWS successfully",
      order_id: tracked.order_id,
      tenant_id: tracked.tenant_id,
      status: tracked.status,
      aws_response: awsBody,
    }, 201);
  } catch (err: any) {
    console.error("[send-order]", err);
    return json({ error: err?.message ?? "Internal error" }, 500);
  }
}

async function handleReceiveStatus(req: Request): Promise<Response> {
  try {
    if (WEBHOOK_SECRET) {
      const incoming = req.headers.get("x-webhook-secret") ?? "";
      if (incoming !== WEBHOOK_SECRET) {
        return json({ error: "Unauthorized" }, 401);
      }
    }

    const body = await req.json();
    const { order_id, tenant_id, status, step, timestamp } = body;

    if (!order_id || !status) {
      return json({ error: "order_id and status are required" }, 400);
    }

    const entry = logStatusUpdate({
      order_id,
      tenant_id,
      status,
      step: step ?? null,
      timestamp: timestamp ?? new Date().toISOString(),
    });

    console.log(
      `[status-update] order=${order_id} status=${status} step=${step ?? "-"}`,
    );

    return json({ received: true, entry });
  } catch (err: any) {
    console.error("[status-update]", err);
    return json({ error: err?.message ?? "Internal error" }, 500);
  }
}

async function handleGetOrderStatus(
  req: Request,
  orderId: string,
): Promise<Response> {
  // 1. Check in-memory store first (populated by webhook or prior polling)
  const cached = orderStore.get(orderId);

  if (!AWS_API_URL) {
    if (!cached) return json({ error: "Order not found" }, 404);
    return json(cached);
  }

  const tenantId = cached?.tenant_id;

  if (!tenantId) {
    return json(
      {
        error:
          "Order not found in local registry. Send the order first via POST /send-order.",
      },
      404,
    );
  }

  // 2. Poll AWS GET /orders?tenant=X&status=Y for each status until found
  const result = await fetchOrderStatus(orderId, tenantId, AWS_API_URL);

  if (!result.found) {
    // Fall back to cached data if AWS doesn't return it (e.g. not yet committed)
    if (cached) return json({ ...cached, aws_current: null });
    return json({ error: "Order not found on AWS" }, 404);
  }

  // Update local cache with freshest status from AWS
  if (cached && result.status) {
    cached.status = result.status;
  }

  return json({
    order_id: orderId,
    tenant_id: tenantId,
    current_status: result.status,
    aws_order: result.order,
    local_history: cached?.history ?? [],
  });
}

async function handleListOrders(): Promise<Response> {
  const orders = Array.from(orderStore.values());
  return json({ total: orders.length, orders });
}

async function handleLog(): Promise<Response> {
  return json({ updates: getStatusLog() });
}

async function handleHealth(): Promise<Response> {
  return json({
    status: "ok",
    uptime: process.uptime(),
    aws_api_url: AWS_API_URL || "(not configured)",
    tracked_orders: orderStore.size,
  });
}

// ── Router ────────────────────────────────────────────────────────────────────

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname, method } = Object.assign(url, { method: req.method });

    console.log(`${method} ${pathname}`);

    // POST /send-order
    if (method === "POST" && pathname === "/send-order") {
      return handleSendOrder(req);
    }

    // POST /status-update  (called by AWS notifyRappi Lambda)
    if (method === "POST" && pathname === "/status-update") {
      return handleReceiveStatus(req);
    }

    // GET /orders/:orderId/status  — poll AWS for current status
    const orderMatch = pathname.match(/^\/orders\/([^/]+)\/status$/);
    if (method === "GET" && orderMatch) {
      return handleGetOrderStatus(req, orderMatch[1]);
    }

    // GET /orders  — list all locally tracked orders
    if (method === "GET" && pathname === "/orders") {
      return handleListOrders();
    }

    // GET /log  — status update log (received from AWS webhook)
    if (method === "GET" && pathname === "/log") {
      return handleLog();
    }

    // GET /health
    if (method === "GET" && pathname === "/health") {
      return handleHealth();
    }

    return json({ error: "Not found" }, 404);
  },
});

console.log(`[Rappi Simulator] running on http://localhost:${PORT}`);
console.log(`[Rappi Simulator] AWS_API_URL = ${AWS_API_URL || "(not set)"}`);
