import jsQR from "jsqr";
import { encode } from "uqr";
import { describe, expect, it } from "vitest";
import { buildEpcPayload, type EpcTransfer } from "./epc-qr";

const transfer: EpcTransfer = {
  name: "Jürgen Müller",
  iban: "DE89 3704 0044 0532 0130 00",
  amountMinor: 1250,
  reference: "Split – WG Küche",
};

/** Renders a uqr matrix to RGBA pixels and reads it back with jsQR — what a banking app's scanner does. */
function scan(payload: string): string | null {
  const { data, size } = encode(payload, { ecc: "M", border: 4 });
  const scale = 4;
  const width = size * scale;
  const pixels = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      const dark = data[Math.floor(y / scale)][Math.floor(x / scale)];
      const offset = (y * width + x) * 4;
      pixels.fill(dark ? 0 : 255, offset, offset + 3);
      pixels[offset + 3] = 255;
    }
  }
  const result = jsQR(pixels, width, width);
  return result ? new TextDecoder().decode(new Uint8Array(result.binaryData)) : null;
}

describe("buildEpcPayload", () => {
  it("writes the EPC069-12 version 002 lines in order", () => {
    expect(buildEpcPayload(transfer).split("\n")).toEqual([
      "BCD",
      "002",
      "1",
      "SCT",
      "",
      "Jürgen Müller",
      "DE89370400440532013000",
      "EUR12.50",
      "",
      "",
      "Split – WG Küche",
    ]);
  });

  it("formats the amount with a dot and two decimals, whatever its size", () => {
    expect(buildEpcPayload({ ...transfer, amountMinor: 1 }).split("\n")[7]).toBe("EUR0.01");
    expect(buildEpcPayload({ ...transfer, amountMinor: 123456 }).split("\n")[7]).toBe("EUR1234.56");
  });

  it("keeps line breaks out of the fields, which would shift every line after them", () => {
    const lines = buildEpcPayload({ ...transfer, name: "Anna\nBerg", reference: "a\r\nb" }).split(
      "\n",
    );
    expect(lines).toHaveLength(11);
    expect(lines[5]).toBe("Anna Berg");
    expect(lines[10]).toBe("a b");
  });

  it("caps the name and the reference at the EPC's lengths", () => {
    const lines = buildEpcPayload({
      ...transfer,
      name: "N".repeat(90),
      reference: "R".repeat(200),
    }).split("\n");
    expect(lines[5]).toHaveLength(70);
    expect(lines[10]).toHaveLength(140);
  });

  it("shortens the reference to keep a multi-byte payload within 331 bytes", () => {
    const payload = buildEpcPayload({
      ...transfer,
      name: "Ä".repeat(70),
      reference: "Ü".repeat(140),
    });
    expect(new TextEncoder().encode(payload).length).toBeLessThanOrEqual(331);
    expect(payload.split("\n")[5]).toBe("Ä".repeat(70));
  });

  it("refuses amounts a transfer can't have, and a missing name", () => {
    expect(() => buildEpcPayload({ ...transfer, amountMinor: 0 })).toThrow();
    expect(() => buildEpcPayload({ ...transfer, amountMinor: 12.5 })).toThrow();
    expect(() => buildEpcPayload({ ...transfer, amountMinor: 100_000_000_000 })).toThrow();
    expect(() => buildEpcPayload({ ...transfer, name: "  " })).toThrow();
  });

  it("round-trips through a real QR code, umlauts included", () => {
    const payload = buildEpcPayload(transfer);
    expect(scan(payload)).toBe(payload);
  });
});
