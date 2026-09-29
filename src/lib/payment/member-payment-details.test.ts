import { describe, expect, it } from "vitest";
import {
  MEMBER_PAYMENT_FIELDS,
  paymentDetailsDiffer,
  pickPaymentDetails,
} from "./member-payment-details";

describe("pickPaymentDetails", () => {
  it("keeps every set field", () => {
    expect(
      pickPaymentDetails({
        paypalEmail: "max@example.com",
        iban: "DE89370400440532013000",
        paypalMeHandle: "maxrobin",
      }),
    ).toEqual({
      paypalEmail: "max@example.com",
      iban: "DE89370400440532013000",
      paypalMeHandle: "maxrobin",
    });
  });

  it("leaves out empty, null and missing fields instead of copying them", () => {
    expect(pickPaymentDetails({ paypalEmail: "", iban: null, paypalMeHandle: "maxrobin" })).toEqual(
      { paypalMeHandle: "maxrobin" },
    );
    expect(pickPaymentDetails({})).toEqual({});
  });

  it("ignores unrelated profile fields", () => {
    const profile = { displayName: "Max", banned: false, paypalMeHandle: "maxrobin" };
    expect(pickPaymentDetails(profile)).toEqual({ paypalMeHandle: "maxrobin" });
  });

  it("covers the PayPal.Me handle — the field the membership paths used to drop", () => {
    expect(MEMBER_PAYMENT_FIELDS).toContain("paypalMeHandle");
  });
});

describe("paymentDetailsDiffer", () => {
  it("is false for an identical copy", () => {
    const details = { iban: "DE89370400440532013000", paypalMeHandle: "maxrobin" };
    expect(paymentDetailsDiffer(details, details)).toBe(false);
  });

  it("treats an empty-string copy and an absent field as the same unset value", () => {
    expect(paymentDetailsDiffer({ paypalEmail: "", iban: "" }, {})).toBe(false);
  });

  it("is true when the member copy is missing a field the profile has", () => {
    expect(
      paymentDetailsDiffer({ iban: "DE89370400440532013000" }, { paypalMeHandle: "max" }),
    ).toBe(true);
  });

  it("is true when the member copy still has a field the profile cleared", () => {
    expect(paymentDetailsDiffer({ paypalMeHandle: "old" }, {})).toBe(true);
  });
});
