import { accountMetrics, type AccountsRange } from "./client-accounts-metrics";
import type { AccountBundle } from "./client-accounts-types";
import { latestMarketingRange } from "./client-account-reporting";

/**
 * Prepare the initial server presentation without shipping raw observations.
 * Range/filter changes must load the complete bundle before recalculation.
 * The raw API contract and all non-snapshot account data remain unchanged.
 */
export function prepareAccountPresentation(
  bundle: AccountBundle,
  range: AccountsRange,
) {
  const analysis = accountMetrics(bundle, range);
  const presentationBundle: AccountBundle = {
    ...bundle,
    snapshots:
      bundle.data_mode === "live"
        ? bundle.snapshots.filter(
            (row) =>
              row.source === "manual" ||
              (row.source === "ga4" && row.grain === "period"),
          )
        : [],
  };

  return {
    bundle: presentationBundle,
    analysis,
    range,
    marketingRange: latestMarketingRange(bundle),
    seoRange: latestMarketingRange(bundle, "search_console"),
    snapshotsDeferred:
      presentationBundle.snapshots.length < bundle.snapshots.length,
    hadGoogleAdsSnapshots: bundle.snapshots.some(
      (snapshot) => snapshot.source === "google_ads",
    ),
  };
}

export type AccountPresentation = ReturnType<typeof prepareAccountPresentation>;
