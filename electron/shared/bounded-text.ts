export function byteLengthUtf8(value: string) {
  return Buffer.byteLength(value, "utf8");
}

export function takeUtf8PrefixByBytes(args: {
  value: string;
  maxBytes: number;
}): { prefix: string; rest: string } {
  if (args.maxBytes <= 0 || args.value.length === 0) {
    return { prefix: "", rest: args.value };
  }

  if (byteLengthUtf8(args.value) <= args.maxBytes) {
    return { prefix: args.value, rest: "" };
  }

  let low = 0;
  let high = args.value.length;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = args.value.slice(0, mid);
    const candidateBytes = byteLengthUtf8(candidate);
    if (candidateBytes <= args.maxBytes) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return {
    prefix: args.value.slice(0, best),
    rest: args.value.slice(best),
  };
}

export function takeUtf8SuffixByBytes(args: {
  value: string;
  maxBytes: number;
}): { prefix: string; suffix: string } {
  if (args.maxBytes <= 0 || args.value.length === 0) {
    return { prefix: args.value, suffix: "" };
  }

  if (byteLengthUtf8(args.value) <= args.maxBytes) {
    return { prefix: "", suffix: args.value };
  }

  let low = 0;
  let high = args.value.length;
  let best = args.value.length;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = args.value.slice(mid);
    const candidateBytes = byteLengthUtf8(candidate);
    if (candidateBytes <= args.maxBytes) {
      best = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return {
    prefix: args.value.slice(0, best),
    suffix: args.value.slice(best),
  };
}

export function truncateUtf8Middle(args: {
  value: string;
  maxBytes: number;
  marker?: string;
}): string {
  if (args.maxBytes <= 0) {
    return "";
  }

  if (byteLengthUtf8(args.value) <= args.maxBytes) {
    return args.value;
  }

  const marker = args.marker ?? "\n…<truncated>…\n";
  const markerBytes = byteLengthUtf8(marker);
  if (markerBytes >= args.maxBytes) {
    return takeUtf8PrefixByBytes({
      value: marker,
      maxBytes: args.maxBytes,
    }).prefix;
  }

  const remainingBytes = args.maxBytes - markerBytes;
  const prefixBudget = Math.ceil(remainingBytes * 0.6);
  const suffixBudget = remainingBytes - prefixBudget;
  const { prefix } = takeUtf8PrefixByBytes({
    value: args.value,
    maxBytes: prefixBudget,
  });
  const { suffix } = takeUtf8SuffixByBytes({
    value: args.value,
    maxBytes: suffixBudget,
  });
  return `${prefix}${marker}${suffix}`;
}
