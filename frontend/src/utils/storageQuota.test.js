import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STORAGE_QUOTA_CODE,
  formatBytesHuman,
  parseStorageQuotaError,
  storageQuotaMessage,
} from "./storageQuota.js";

describe("storageQuota", () => {
  it("parsea detail con code", () => {
    const d = parseStorageQuotaError({
      detail: { code: STORAGE_QUOTA_CODE, message: "Límite alcanzado" },
    });
    assert.equal(d.message, "Límite alcanzado");
  });

  it("mensaje de cuota", () => {
    assert.equal(
      storageQuotaMessage({ detail: { code: STORAGE_QUOTA_CODE, message: "Cupo lleno" } }),
      "Cupo lleno",
    );
  });

  it("formatBytesHuman", () => {
    assert.match(formatBytesHuman(0), /B/);
    assert.match(formatBytesHuman(5 * 1024 ** 3), /GB/);
  });
});
