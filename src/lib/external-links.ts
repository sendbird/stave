const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const EXTERNAL_URL_PATTERN = /(?:https?:\/\/|mailto:)[^\s<>"'`]+/gi;

export interface ExternalTextSegment {
  type: "text" | "link";
  text: string;
  href?: string;
}

function stripTrailingUrlPunctuation(raw: string) {
  let candidate = raw;
  let trailing = "";

  while (candidate.length > 0) {
    const lastChar = candidate.at(-1);
    if (!lastChar) {
      break;
    }

    if (/[.,!?;:]/.test(lastChar) || lastChar === "]" || lastChar === "}") {
      trailing = `${lastChar}${trailing}`;
      candidate = candidate.slice(0, -1);
      continue;
    }

    if (lastChar === ")") {
      const openCount = candidate.split("(").length - 1;
      const closeCount = candidate.split(")").length - 1;
      if (closeCount > openCount) {
        trailing = `${lastChar}${trailing}`;
        candidate = candidate.slice(0, -1);
        continue;
      }
    }

    break;
  }

  return { candidate, trailing };
}

export function normalizeExternalUrl(raw?: string | null) {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    return ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function splitTextByExternalUrls(text: string): ExternalTextSegment[] {
  if (!text) {
    return [{ type: "text", text: "" }];
  }

  if (
    !text.includes("http://")
    && !text.includes("https://")
    && !text.includes("mailto:")
  ) {
    return [{ type: "text", text }];
  }

  const segments: ExternalTextSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(EXTERNAL_URL_PATTERN)) {
    const rawMatch = match[0];
    const startIndex = match.index ?? 0;
    const endIndex = startIndex + rawMatch.length;

    if (startIndex > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, startIndex) });
    }

    const { candidate, trailing } = stripTrailingUrlPunctuation(rawMatch);
    const normalized = normalizeExternalUrl(candidate);
    if (normalized) {
      segments.push({ type: "link", text: candidate, href: normalized });
      if (trailing) {
        segments.push({ type: "text", text: trailing });
      }
    } else {
      segments.push({ type: "text", text: rawMatch });
    }

    lastIndex = endIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "text", text }];
}

export async function openExternalUrl(args: { url: string }) {
  const normalized = normalizeExternalUrl(args.url);
  if (!normalized) {
    return { ok: false as const, stderr: "Blocked external URL protocol." };
  }

  const shellApi = window.api?.shell?.openExternal;
  if (shellApi) {
    return shellApi({ url: normalized });
  }

  if (typeof window !== "undefined" && typeof window.open === "function") {
    window.open(normalized, "_blank", "noopener,noreferrer");
    return { ok: true as const };
  }

  return { ok: false as const, stderr: "External browser bridge unavailable." };
}

export function isMacLikePlatform(platform = typeof navigator !== "undefined" ? navigator.platform : "") {
  return /mac/i.test(platform);
}

export function shouldActivateExternalLinkWithModifier(args: {
  ctrlKey?: boolean;
  metaKey?: boolean;
  platform?: string;
}) {
  return isMacLikePlatform(args.platform) ? Boolean(args.metaKey) : Boolean(args.ctrlKey);
}
