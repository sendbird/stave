import { createInterface } from "node:readline";

const scenario = process.argv[2] ?? "standard";
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });

function send(message: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id: unknown, value: unknown) {
  send({ jsonrpc: "2.0", id, result: value });
}

function error(id: unknown, code: number, message: string) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function handleInitialize(id: unknown) {
  result(id, {
    protocolVersion: 1,
    agentCapabilities: { loadSession: true },
    authMethods: [{ id: "fixture_login", name: "Fixture login" }],
  });
  if (scenario === "unknown-notification") {
    send({
      jsonrpc: "2.0",
      method: "fixture/unknown_notification",
      params: { ignored: true },
    });
  }
  if (scenario === "unknown-request") {
    send({
      jsonrpc: "2.0",
      id: "fixture-server-request",
      method: "fixture/unknown_request",
      params: {},
    });
  }
}

input.on("line", (line) => {
  const message = JSON.parse(line) as Record<string, unknown>;
  const method = typeof message.method === "string" ? message.method : "";
  const id = message.id;

  if (!method && id === "fixture-server-request") {
    send({
      jsonrpc: "2.0",
      method: "fixture/server_response",
      params: { error: message.error },
    });
    return;
  }
  if (method === "initialize") {
    handleInitialize(id);
    return;
  }
  if (method === "authenticate") {
    result(id, {});
    return;
  }
  if (method === "session/new") {
    result(id, {
      sessionId: "fixture-session",
      modes: {
        currentModeId: "agent",
        availableModes: [
          { id: "agent", name: "Agent" },
          { id: "plan", name: "Plan" },
        ],
      },
      configOptions: [],
    });
    return;
  }
  if (method === "session/load") {
    result(id, { configOptions: [] });
    return;
  }
  if (method === "session/set_mode" || method === "session/set_config_option") {
    result(id, {});
    return;
  }
  if (method === "session/prompt") {
    if (scenario !== "cancel") {
      result(id, { stopReason: "end_turn" });
    }
    return;
  }
  if (method === "session/cancel") {
    for (let pendingId = 1; pendingId <= 20; pendingId += 1) {
      if (pendingId !== id) {
        result(pendingId, { stopReason: "cancelled" });
      }
    }
    return;
  }
  if (method === "fixture/slow") {
    setTimeout(() => result(id, { value: "slow" }), 30);
    return;
  }
  if (method === "fixture/fast") {
    setTimeout(() => result(id, { value: "fast" }), 1);
    return;
  }
  if (method === "fixture/error") {
    error(id, -32001, "fixture failure");
    return;
  }
  if (method === "fixture/timeout") {
    return;
  }
  if (method === "fixture/exit") {
    process.exit(7);
  }
  if (method === "fixture/malformed") {
    process.stdout.write("{not-json}\n");
    result(id, { ok: true });
    return;
  }
  if (method === "fixture/stderr") {
    process.stderr.write("x".repeat(256));
    result(id, { ok: true });
    return;
  }
  if (method === "fixture/oversized") {
    process.stdout.write(`${"x".repeat(2048)}\n`);
    return;
  }
  error(id, -32601, `Unknown fixture method: ${method}`);
});
