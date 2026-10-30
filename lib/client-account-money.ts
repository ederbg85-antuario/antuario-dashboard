/** Remove binary-float noise only at presentation precision; retain original measurements. */
export function formatAccountMoney(
  value: number | null | undefined,
  currency = "MXN",
) {
  if (value == null) return "—";
  const stable =
    Math.round(
      (value +
        Math.sign(value) * Number.EPSILON * Math.max(1, Math.abs(value))) *
        100,
    ) / 100;
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(stable);
}
