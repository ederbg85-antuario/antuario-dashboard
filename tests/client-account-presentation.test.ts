import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareAccountPresentation } from "../lib/client-account-presentation";
import {
  getDemoAccount,
  getDemoAccounts,
} from "../lib/client-accounts-fixtures";
import {
  accountMetrics,
  resolveAccountsRange,
} from "../lib/client-accounts-metrics";
import type { AccountBundle } from "../lib/client-accounts-types";

const range = resolveAccountsRange("month", "2026-10-20");

function freezeRecursively(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  Object.freeze(value);
  for (const nested of Object.values(value)) freezeRecursively(nested);
}

test("both anonymous presentations preserve the validated calculator exactly without mutating observations", () => {
  for (const original of getDemoAccounts()) {
    const before = structuredClone(original);
    const expected = accountMetrics(original, range);
    freezeRecursively(original);
    const presentation = prepareAccountPresentation(original, range);

    assert.deepEqual(presentation.analysis, expected);
    assert.deepEqual(presentation.bundle.snapshots, []);
    assert.equal(presentation.snapshotsDeferred, true);
    assert.equal(
      presentation.hadGoogleAdsSnapshots,
      original.snapshots.some((snapshot) => snapshot.source === "google_ads"),
    );
    assert.equal(presentation.range, range);
    assert.notEqual(presentation.bundle, original);
    assert.deepEqual(original, before);
    assert.ok(original.snapshots.length > 0);
    assert.ok(original.account.name.startsWith("Cuenta de ejemplo"));
    assert.ok(original.snapshots.every((snapshot) => snapshot.is_example));
    for (const key of Object.keys(original) as (keyof AccountBundle)[]) {
      if (key !== "snapshots") {
        assert.equal(
          presentation.bundle[key],
          original[key],
          `${key} is preserved`,
        );
      }
    }
  }
});

test("read-only finance, source provenance, coverage and permissions survive the smaller presentation", () => {
  const demo = getDemoAccount("metrica")!;
  const financialBase = {
    id: "unit-only-invoice",
    account_id: demo.account.id,
    organization_id: 1,
    source_key: "unit-only:finance_document:invoice",
    created_by: null,
    created_at: null,
    updated_at: null,
    is_example: true,
    read_only: true,
    legacy_source: "finance_document" as const,
  };
  const original: AccountBundle = {
    ...demo,
    invoices: [
      {
        ...financialBase,
        title: "Documento exclusivo de prueba unitaria",
        uuid: null,
        issued_date: "2026-10-06",
        due_date: null,
        period_from: "2026-09-01",
        period_to: "2026-09-30",
        subtotal: 100,
        vat: 16,
        retention: 0,
        total: 116,
        currency: "MXN",
        status: "issued",
        evidence: "Solo test; no se presenta como una transacción real.",
      },
    ],
    payments: [
      {
        ...financialBase,
        id: "unit-only-payment",
        source_key: "unit-only:finance_entry:payment",
        legacy_source: "finance_entry",
        invoice_id: financialBase.id,
        date: "2026-10-09",
        amount: 116,
        currency: "MXN",
        receipt_status: "pending",
        evidence: "Solo test; conservar fecha y vínculo originales.",
      },
    ],
    finance_coverage: {
      legacy_read: true,
      new_ledger_read: false,
      legacy_documents: 1,
      confirmed_entries: 1,
      truncated: false,
      as_of: "2026-10-20T18:00:00Z",
      errors: [],
    },
    schema_ready: false,
    capabilities: {
      ...demo.capabilities,
      manage: false,
      manage_billing: false,
      upload: false,
      archived: true,
    },
    errors: ["schema_pending"],
  };
  const before = structuredClone(original);
  freezeRecursively(original);
  const presentation = prepareAccountPresentation(original, range);

  assert.deepEqual(presentation.analysis, accountMetrics(original, range));
  assert.equal(presentation.bundle.invoices, original.invoices);
  assert.equal(presentation.bundle.payments, original.payments);
  assert.equal(presentation.bundle.finance_coverage, original.finance_coverage);
  assert.equal(presentation.bundle.capabilities, original.capabilities);
  assert.equal(presentation.bundle.account.id, original.account.id);
  assert.equal(presentation.bundle.invoices[0].read_only, true);
  assert.equal(
    presentation.bundle.invoices[0].legacy_source,
    "finance_document",
  );
  assert.equal(
    presentation.bundle.payments[0].source_key,
    original.payments[0].source_key,
  );
  assert.deepEqual(original, before);
});

test("an empty raw source is not marked deferred and keeps unknown measurements", () => {
  const original = { ...getDemoAccount("acriland")!, snapshots: [] };
  const presentation = prepareAccountPresentation(original, range);

  assert.equal(presentation.snapshotsDeferred, false);
  assert.equal(presentation.hadGoogleAdsSnapshots, false);
  assert.deepEqual(presentation.analysis, accountMetrics(original, range));
  assert.equal(presentation.analysis.byKey.sessions.value, null);
  assert.equal(presentation.analysis.billingSummary.collected, null);
  assert.equal(presentation.analysis.billingSummary.outstanding, null);
  assert.deepEqual(presentation.bundle.campaigns, []);
});

test("live presentation keeps operational observations and original monthly reports available for specific client panels", () => {
  const demo = getDemoAccount("metrica")!;
  const row = {
    ...demo.snapshots[0],
    is_example: false,
    date: "2026-10-20",
    period_to: "2026-10-20",
    source: "manual" as const,
    metric: "inventory_negative",
    value: 4,
    grain: "period" as const,
    channel: null,
    campaign_id: null,
  };
  const monthly = {
    ...row,
    id: "monthly",
    source_key: "monthly",
    source: "ga4" as const,
    metric: "sessions",
    value: 343,
    date: "2026-09-01",
    period_to: "2026-09-30",
  };
  const search = {
    ...row,
    id: "search",
    source_key: "search",
    source: "search_console" as const,
    metric: "clicks",
    value: 7,
    grain: "daily" as const,
  };
  const original: AccountBundle = {
    ...demo,
    data_mode: "live",
    account: { ...demo.account, is_example: false },
    snapshots: [row, monthly, search],
  };
  const result = prepareAccountPresentation(original, range);
  assert.deepEqual(result.bundle.snapshots, [row, monthly]);
  assert.equal(result.snapshotsDeferred, true);
  assert.deepEqual(result.analysis, accountMetrics(original, range));
  assert.equal(original.snapshots.length, 3);
});

test("initial serialized presentation is less than half of the raw payload for both anonymous structures", () => {
  for (const original of getDemoAccounts()) {
    const presentation = prepareAccountPresentation(original, range);
    const rawBytes = Buffer.byteLength(JSON.stringify(original));
    const presentationBytes = Buffer.byteLength(JSON.stringify(presentation));

    assert.ok(
      presentationBytes < rawBytes * 0.5,
      `${original.account.name}: ${presentationBytes} presentation bytes vs ${rawBytes} raw bytes`,
    );
    assert.deepEqual(presentation.analysis, accountMetrics(original, range));
  }
});
