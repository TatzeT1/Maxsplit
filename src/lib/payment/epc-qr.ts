/**
 * The payload of an EPC QR code — "GiroCode" in Germany/Austria: the
 * European Payments Council's format (EPC069-12, version 002) for a SEPA
 * credit transfer, which banking apps read to prefill recipient, IBAN, amount
 * and reference. Version 002 makes the BIC optional within the EEA, and the
 * payload is UTF-8 (character set 1), so names like "Jürgen Müller" survive.
 *
 * Like the rest of the payment details, this moves no money — it only saves
 * the payer typing, and they still confirm the transfer in their own bank.
 */
export interface EpcTransfer {
  /** The account holder, as their bank knows them — banks check it against the IBAN. */
  name: string;
  /** Already validated and normalized (see normalizeIban). */
  iban: string;
  /** Euro cents. EPC QR codes are euro-only. */
  amountMinor: number;
  /** Free-text "Verwendungszweck". */
  reference: string;
}

/** The beneficiary name's cap — also the account-holder field's maxLength. */
export const EPC_MAX_NAME_CHARS = 70;
const MAX_REFERENCE_CHARS = 140;
/** The EPC's cap on the whole payload, in bytes. */
const MAX_PAYLOAD_BYTES = 331;
const MAX_AMOUNT_MINOR = 99_999_999_999;

/** One line of the payload: no line breaks inside a field, cut by characters (never mid-emoji). */
function field(value: string, maxChars: number): string {
  return Array.from(value.replace(/\s+/g, " ").trim()).slice(0, maxChars).join("");
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function buildEpcPayload(transfer: EpcTransfer): string {
  if (!Number.isInteger(transfer.amountMinor) || transfer.amountMinor < 1) {
    throw new Error(`EPC QR amount must be at least 1 cent, got ${transfer.amountMinor}`);
  }
  if (transfer.amountMinor > MAX_AMOUNT_MINOR) {
    throw new Error(`EPC QR amount must be at most 999,999,999.99 EUR`);
  }
  const name = field(transfer.name, EPC_MAX_NAME_CHARS);
  if (!name) throw new Error("EPC QR needs the beneficiary's name");

  const lines = (reference: string) =>
    [
      "BCD", // service tag
      "002", // version
      "1", // character set: UTF-8
      "SCT", // SEPA credit transfer
      "", // BIC — optional since version 002
      name,
      transfer.iban.replace(/\s+/g, "").toUpperCase(),
      `EUR${(transfer.amountMinor / 100).toFixed(2)}`,
      "", // purpose code
      "", // structured reference — mutually exclusive with the text below
      reference,
    ].join("\n");

  // The reference is the one field worth shortening to fit the byte cap; a
  // long name full of multi-byte characters is the only way to get near it.
  let reference = field(transfer.reference, MAX_REFERENCE_CHARS);
  while (utf8Length(lines(reference)) > MAX_PAYLOAD_BYTES && reference) {
    reference = Array.from(reference).slice(0, -1).join("").trimEnd();
  }
  return lines(reference);
}
