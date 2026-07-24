export const PROVIDER_STEER_ACK_TIMEOUT_MS = 30_000;
export const RENDERER_STEER_ACK_TIMEOUT_MS =
  PROVIDER_STEER_ACK_TIMEOUT_MS + 2_000;

export type SteerDeliveryWaitResult<T> =
  | { status: "resolved"; value: T }
  | { status: "timed-out" };

export async function waitForSteerDelivery<T>(args: {
  response: Promise<T>;
  timeoutMs?: number;
}): Promise<SteerDeliveryWaitResult<T>> {
  const timeoutMs = args.timeoutMs ?? PROVIDER_STEER_ACK_TIMEOUT_MS;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      args.response.then(
        (value) => ({ status: "resolved", value }) as const,
      ),
      new Promise<{ status: "timed-out" }>((resolve) => {
        timeoutHandle = setTimeout(
          () => resolve({ status: "timed-out" }),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}
