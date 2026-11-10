import type { TarsResponsibility } from "@/lib/tars/types";

type BriefFields = Pick<TarsResponsibility, "instruction"> & Partial<Pick<TarsResponsibility, "request" | "delegatedInstruction" | "mandate" | "attachments">>;

/**
 * Saved texts for the request view, keyed by the preview's work ids: a long
 * message with a list, a code block, an unbroken URL and a screenshot and a
 * file it carries (`queue-auth`), a
 * choice on a Tars question (`queue-search`), work admitted before the message
 * was saved apart (`queue-docs`) and the running fix the conversation's flow
 * block opens (`billing`). The user's words follow the preview's language.
 */
export function buildTarsBriefFixtures(start: Date, korean: boolean): Record<string, BriefFields> {
  const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString();
  const authMessage = korean
    ? [
      "금요일 릴리스 전에 스테이징 인증 키를 교체해 줘.",
      "",
      "기대하는 순서:",
      "1. 스테이징 vault에서 새 서명 키 쌍을 만든다.",
      "2. 스테이징 배포 설정의 `AUTH_SIGNING_KEY`를 바꾼다:",
      "",
      "```yaml",
      "auth:",
      "  signingKey: ${AUTH_SIGNING_KEY}",
      "  previousKeys:",
      "    - ${AUTH_SIGNING_KEY_PREVIOUS}",
      "```",
      "",
      "3. 기존 세션이 끊기지 않게 이전 키를 24시간 동안 유효하게 둔다.",
      "",
      "확인용 주소: https://staging.example.com/api/v2/auth/keys/rotate?dryRun=false&notify=team-auth&reason=friday-release-preparation-2026-11",
      "",
      "프로덕션은 건드리지 마. vault CLI에 내가 없는 토큰이 필요하면 멈추고 물어봐.",
    ].join("\n")
    : [
      "Rotate the staging auth keys before Friday's release.",
      "",
      "Steps I expect:",
      "1. Generate a new signing key pair in the staging vault.",
      "2. Update `AUTH_SIGNING_KEY` in the staging deploy config:",
      "",
      "```yaml",
      "auth:",
      "  signingKey: ${AUTH_SIGNING_KEY}",
      "  previousKeys:",
      "    - ${AUTH_SIGNING_KEY_PREVIOUS}",
      "```",
      "",
      "3. Keep the previous key valid for 24 hours so existing sessions survive.",
      "",
      "Check it at https://staging.example.com/api/v2/auth/keys/rotate?dryRun=false&notify=team-auth&reason=friday-release-preparation-2026-11",
      "",
      "Do not touch production. If the vault CLI needs a token I don't have, stop and ask me.",
    ].join("\n");
  const authInstruction = [
    "In the staging environment only, rotate the auth signing key:",
    "- Generate a new key pair in the staging vault.",
    "- Set AUTH_SIGNING_KEY in config/deploy/staging.yaml and move the old key under previousKeys.",
    "- Keep the previous key valid for 24 hours.",
    "Stop and ask the user if a vault token is missing. Never change production.",
  ].join("\n");
  const searchInstruction = "Add retries with exponential backoff to the webhook sender: at most three attempts, then mark the delivery failed. Cover both paths with unit tests.";
  const docsMessage = korean ? "새 페이지네이션 매개변수로 API 레퍼런스 예제를 새로 고쳐 줘." : "Refresh the API reference examples with the new pagination parameters.";
  const billingMessage = korean ? "인보이스 목록이 비어 있을 때 결제 내보내기를 고쳐 줘." : "Fix the billing export when the invoice list is empty.";
  return {
    "queue-auth": {
      instruction: `Original user mandate:\n${authMessage}\n\nProposed work unit within that mandate:\n${authInstruction}`,
      request: { messageId: "message-queue-auth", text: authMessage, sentAt: at(2) },
      delegatedInstruction: authInstruction,
      attachments: { messageId: "message-queue-auth", items: [
        { index: 0, kind: "image", name: "staging-login-error.png", type: "image/png", size: 182_344 },
        { index: 1, kind: "file", name: "staging-deploy.yaml", type: "yaml", size: 1_204 },
      ] },
    },
    "queue-search": {
      instruction: `Original user mandate:\nRetry three times, then give up\n\nProposed work unit within that mandate:\n${searchInstruction}`,
      request: { messageId: "message-queue-search", text: korean ? "세 번 재시도 후 포기" : "Retry three times, then give up", sentAt: at(3),
        answeredQuestion: korean ? "웹훅 전송이 실패하면 몇 번까지 다시 시도할까요?" : "How many times should the webhook sender retry a failed delivery?" },
      delegatedInstruction: searchInstruction,
    },
    // Admitted before the message and the instruction were saved apart: one combined assignment, no request.
    "queue-docs": {
      instruction: `Original user mandate:\n${docsMessage}\n\nProposed work unit within that mandate:\nUpdate every example in docs/api/*.md to use cursor pagination (cursor, limit) instead of page numbers.`,
    },
    billing: {
      instruction: `Original user mandate:\n${billingMessage}\n\nProposed work unit within that mandate:\nReproduce the empty-list export failure, find its cause, then fix it.`,
      request: { messageId: "message-delegate", text: billingMessage, sentAt: at(1) },
      delegatedInstruction: "Reproduce the empty-list export failure, find its cause, then fix it.",
    },
  };
}
