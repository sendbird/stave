import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n } from "@/i18n";
import { DelegatedAgentReplyCard } from "@/components/agent-runs/DelegatedAgentReplySlot";

test("the blocked delegated reply form labels its guidance and keeps submit disabled for an empty reply in both languages", async () => {
  const original = i18n.language;
  try {
    for (const language of ["en", "ko"]) {
      await i18n.changeLanguage(language);
      const html = renderToStaticMarkup(createElement(DelegatedAgentReplyCard, { busy: false, onReply: async () => true }));
      expect(html).toContain(language === "en" ? "Reply to the delegated Agent" : "위임 Agent에 답변");
      expect(html).toContain("<label"); expect(html).toContain("<textarea"); expect(html).toContain('disabled=""');
    }
  } finally { await i18n.changeLanguage(original); }
});
