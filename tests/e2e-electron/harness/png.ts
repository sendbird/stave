import { inflateSync } from "node:zlib";

/**
 * Just enough PNG to turn a Lens screenshot back into pixels.
 *
 * The point of decoding at all is that byte length does not distinguish a real
 * frame from a blank one — a 1280x800 solid fill compresses to a couple of
 * kilobytes, which is the same order as a screenshot of nothing. Only the
 * pixels answer "did the compositor actually produce this page".
 *
 * Deliberately narrow: 8-bit non-interlaced truecolour, with or without alpha,
 * which is what `Page.captureScreenshot` emits. Anything else throws rather
 * than being guessed at, because a decoder that quietly returns the wrong
 * colours would turn this whole measurement into a fabrication.
 */

export type DecodedPng = {
  width: number;
  height: number;
  /** RGBA, four bytes per pixel, row-major. */
  pixels: Uint8Array;
};

export type Rgba = { r: number; g: number; b: number; a: number };

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

export function decodePng(buffer: Buffer): DecodedPng {
  for (const [index, byte] of PNG_SIGNATURE.entries()) {
    if (buffer[index] !== byte) {
      throw new Error("not a PNG: signature mismatch");
    }
  }

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      interlace = data[12]!;
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(
      `unsupported PNG: bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}`,
    );
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const expected = height * (stride + 1);
  if (raw.length < expected) {
    throw new Error(
      `truncated PNG scanlines: got ${raw.length}, expected ${expected}`,
    );
  }

  const unfiltered = new Uint8Array(height * stride);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source]!;
    source += 1;
    const rowStart = y * stride;
    const previousStart = rowStart - stride;
    for (let i = 0; i < stride; i += 1) {
      const value = raw[source + i]!;
      const left = i >= channels ? unfiltered[rowStart + i - channels]! : 0;
      const up = y > 0 ? unfiltered[previousStart + i]! : 0;
      const upLeft =
        y > 0 && i >= channels ? unfiltered[previousStart + i - channels]! : 0;
      let restored: number;
      switch (filter) {
        case 0:
          restored = value;
          break;
        case 1:
          restored = value + left;
          break;
        case 2:
          restored = value + up;
          break;
        case 3:
          restored = value + ((left + up) >> 1);
          break;
        case 4:
          restored = value + paeth(left, up, upLeft);
          break;
        default:
          throw new Error(`unsupported PNG row filter ${filter} on row ${y}`);
      }
      unfiltered[rowStart + i] = restored & 0xff;
    }
    source += stride;
  }

  if (channels === 4) {
    return { width, height, pixels: unfiltered };
  }

  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0, out = 0; index < unfiltered.length; index += 3, out += 4) {
    pixels[out] = unfiltered[index]!;
    pixels[out + 1] = unfiltered[index + 1]!;
    pixels[out + 2] = unfiltered[index + 2]!;
    pixels[out + 3] = 255;
  }
  return { width, height, pixels };
}

/** Colour at a pixel, addressed in image coordinates. */
export function pixelAt(image: DecodedPng, x: number, y: number): Rgba {
  const px = Math.max(0, Math.min(image.width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(image.height - 1, Math.round(y)));
  const offset = (py * image.width + px) * 4;
  return {
    r: image.pixels[offset]!,
    g: image.pixels[offset + 1]!,
    b: image.pixels[offset + 2]!,
    a: image.pixels[offset + 3]!,
  };
}

/**
 * Colour at a fraction of the image, so a sample point survives whatever device
 * scale factor the capture came back at.
 */
export function pixelAtFraction(
  image: DecodedPng,
  fractionX: number,
  fractionY: number,
): Rgba {
  return pixelAt(image, image.width * fractionX, image.height * fractionY);
}

/**
 * How many distinct colours the image contains, capped.
 *
 * One colour means a blank frame — the single most likely way a parked guest
 * could "answer a screenshot" while proving nothing.
 */
export function countDistinctColors(image: DecodedPng, cap = 64): number {
  const seen = new Set<number>();
  for (let offset = 0; offset < image.pixels.length; offset += 4) {
    seen.add(
      (image.pixels[offset]! << 16) |
        (image.pixels[offset + 1]! << 8) |
        image.pixels[offset + 2]!,
    );
    if (seen.size >= cap) {
      return seen.size;
    }
  }
  return seen.size;
}

/** Fraction of pixels whose colour differs between two same-sized images. */
export function differingPixelRatio(a: DecodedPng, b: DecodedPng): number {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `image sizes differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`,
    );
  }
  let differing = 0;
  const total = a.width * a.height;
  for (let offset = 0; offset < a.pixels.length; offset += 4) {
    if (
      a.pixels[offset] !== b.pixels[offset] ||
      a.pixels[offset + 1] !== b.pixels[offset + 1] ||
      a.pixels[offset + 2] !== b.pixels[offset + 2]
    ) {
      differing += 1;
    }
  }
  return differing / total;
}

export function formatRgb(color: Rgba): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}
