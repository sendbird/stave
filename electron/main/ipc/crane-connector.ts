import { ipcMain } from "electron";
import { CraneConnectorHttpError } from "../crane-connector/http-client";
import {
  approveCraneDispatch,
  configureCraneConnector,
  declineCraneDispatch,
  disconnectCraneConnector,
  getCraneConnectorStatus,
  pairCraneConnector,
} from "../crane-connector/service";
import {
  CraneConnectorConfigArgsSchema,
  CraneConnectorPairArgsSchema,
  CraneDispatchApproveArgsSchema,
  CraneDispatchDeclineArgsSchema,
} from "./schemas";

function safeConnectorErrorMessage(error: unknown) {
  if (error instanceof CraneConnectorHttpError) {
    switch (error.code) {
      case "invalid_pairing_code":
        return "The pairing code is invalid or expired.";
      case "unauthorized":
      case "forbidden":
        return "Crane rejected this connector. Pair it again.";
      case "network_unavailable":
        return "Crane is currently unreachable.";
      default:
        return `Crane connector request failed (${error.code}).`;
    }
  }
  if (error instanceof Error) {
    const message = error.message;
    if (
      message.includes("OS credential encryption") ||
      message.includes("basic_text") ||
      message.includes("no longer") ||
      message.includes("expired before")
    ) {
      return message;
    }
  }
  return "The Crane connector operation failed.";
}

export function registerCraneConnectorHandlers() {
  ipcMain.handle("crane-connector:get-status", () => ({
    ok: true,
    status: getCraneConnectorStatus(),
  }));

  ipcMain.handle(
    "crane-connector:configure",
    async (_event, args: unknown) => {
      const parsed = CraneConnectorConfigArgsSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          status: getCraneConnectorStatus(),
          message: "Invalid Crane connector configuration.",
        };
      }
      try {
        return {
          ok: true,
          status: await configureCraneConnector(parsed.data),
        };
      } catch (error) {
        return {
          ok: false,
          status: getCraneConnectorStatus(),
          message: safeConnectorErrorMessage(error),
        };
      }
    },
  );

  ipcMain.handle(
    "crane-connector:pair",
    async (_event, args: unknown) => {
      const parsed = CraneConnectorPairArgsSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          status: getCraneConnectorStatus(),
          message: "Invalid Crane pairing request.",
        };
      }
      try {
        return {
          ok: true,
          status: await pairCraneConnector(parsed.data),
        };
      } catch (error) {
        return {
          ok: false,
          status: getCraneConnectorStatus(),
          message: safeConnectorErrorMessage(error),
        };
      }
    },
  );

  ipcMain.handle("crane-connector:disconnect", async () => {
    try {
      return {
        ok: true,
        status: await disconnectCraneConnector(),
      };
    } catch (error) {
      return {
        ok: false,
        status: getCraneConnectorStatus(),
        message: safeConnectorErrorMessage(error),
      };
    }
  });

  ipcMain.handle(
    "crane-connector:approve",
    async (_event, args: unknown) => {
      const parsed = CraneDispatchApproveArgsSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          status: getCraneConnectorStatus(),
          message: "Invalid local Crane approval.",
        };
      }
      try {
        const result = await approveCraneDispatch(parsed.data);
        return { ok: true, ...result };
      } catch (error) {
        return {
          ok: false,
          status: getCraneConnectorStatus(),
          message: safeConnectorErrorMessage(error),
        };
      }
    },
  );

  ipcMain.handle(
    "crane-connector:decline",
    async (_event, args: unknown) => {
      const parsed = CraneDispatchDeclineArgsSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          status: getCraneConnectorStatus(),
          message: "Invalid local Crane decline.",
        };
      }
      try {
        return {
          ok: true,
          status: await declineCraneDispatch(parsed.data.jobId),
        };
      } catch (error) {
        return {
          ok: false,
          status: getCraneConnectorStatus(),
          message: safeConnectorErrorMessage(error),
        };
      }
    },
  );
}
