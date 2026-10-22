import { useMemo } from "react";
import { snapshotProviderAccounts, selectedProviderAccount } from "@/lib/providers/provider-account-selection";
import { getProviderSessionCursor } from "@/lib/providers/provider-sessions";
import { buildProviderSwitchPreview } from "@/lib/providers/provider-switch-preview";
import { isProviderNativeSlashCommandInput } from "@/lib/providers/provider-request-translators";
import { parseSideChatCommand } from "@/lib/side-chat/side-chat";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";

const NO_MESSAGES: ChatMessage[] = [];

/**
 * What the next message's provider would receive, when it is not the one that
 * answered last. Computed only while nothing runs (a send then starts the
 * turn) and not under Stave Auto, which picks the provider at send time. The
 * account follows the send path: the task draft's override, else Settings.
 */
export function useProviderSwitchPreview(args: {
  taskId: string;
  providerId?: ProviderId;
  enabled: boolean;
}) {
  const messages = useAppStore((state) => state.messagesByTask[args.taskId] ?? NO_MESSAGES);
  const sessions = useAppStore((state) => state.providerSessionByTask[args.taskId]);
  const claudeSetting = useAppStore((state) => state.settings.claudeAccountProfileId);
  const codexSetting = useAppStore((state) => state.settings.codexAccountProfileId);
  const claudeOverride = useAppStore(
    (state) => state.promptDraftByTask[args.taskId]?.runtimeOverrides?.claudeAccountProfileId,
  );
  const codexOverride = useAppStore(
    (state) => state.promptDraftByTask[args.taskId]?.runtimeOverrides?.codexAccountProfileId,
  );
  // Only a provider command changes what is sent, so ordinary typing does not recompute.
  // Stave's own `/aside` sends nothing to the provider, so it changes nothing here.
  const commandInput = useAppStore((state) => {
    const text = state.promptDraftByTask[args.taskId]?.text ?? "";
    return isProviderNativeSlashCommandInput(text) && !parseSideChatCommand(text) ? text : "";
  });
  const providerId = args.providerId;
  return useMemo(() => {
    if (!args.enabled || !providerId) {
      return null;
    }
    const accounts = snapshotProviderAccounts({
      claudeAccountProfileId: claudeOverride ?? claudeSetting,
      codexAccountProfileId: codexOverride ?? codexSetting,
    });
    const resume = getProviderSessionCursor({
      sessions,
      providerId,
      accountProfileId: selectedProviderAccount(providerId, accounts),
    });
    return buildProviderSwitchPreview({ messages, toProviderId: providerId, resume, userInput: commandInput });
  }, [args.enabled, claudeOverride, claudeSetting, codexOverride, codexSetting, commandInput, messages, providerId, sessions]);
}
