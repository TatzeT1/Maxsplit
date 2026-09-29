import { afterEach, describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "./endpoints";

describe("isAllowedPushEndpoint", () => {
  afterEach(() => {
    delete process.env.PUSH_EXTRA_ENDPOINT_HOSTS;
  });

  it("accepts the push services browsers use", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/abc:APA91b",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
      "https://web.push.apple.com/QGuQyavXutnMH",
      "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
    ]) {
      expect(isAllowedPushEndpoint(endpoint)).toBe(true);
    }
  });

  it("refuses anything else the server would otherwise be made to call", () => {
    for (const endpoint of [
      "https://evil.example.com/fcm.googleapis.com",
      "https://fcm.googleapis.com.evil.example.com/x",
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://169.254.169.254/latest/meta-data",
      "not a url",
    ]) {
      expect(isAllowedPushEndpoint(endpoint)).toBe(false);
    }
  });

  it("lets a local end-to-end test add its fake push service explicitly", () => {
    expect(isAllowedPushEndpoint("https://127.0.0.1:9443/push/1")).toBe(false);
    process.env.PUSH_EXTRA_ENDPOINT_HOSTS = "127.0.0.1:9443";
    expect(isAllowedPushEndpoint("https://127.0.0.1:9443/push/1")).toBe(true);
  });
});
