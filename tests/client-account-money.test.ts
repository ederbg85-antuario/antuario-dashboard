import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAccountMoney } from "../lib/client-account-money";
test("currency presentation rounds a verified conversion cost without binary drift", () => {
  assert.equal(formatAccountMoney(1105.11 / 6), "$184.19");
  assert.equal(formatAccountMoney(8103.33), "$8,103.33");
  assert.equal(formatAccountMoney(1.005), "$1.01");
  assert.equal(formatAccountMoney(null), "—");
  assert.equal(formatAccountMoney(0), "$0.00");
});
