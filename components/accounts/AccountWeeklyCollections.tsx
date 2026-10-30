"use client";
import {useFinancialPrivacy} from "@/components/privacy/FinancialPrivacy";
import type { AccountBundle } from "@/lib/client-accounts-types";
import type { AccountsRange } from "@/lib/client-accounts-metrics";
import { shiftAccountDate, mexicoAccountDate } from "@/lib/client-accounts-metrics";
import { shortDate, Surface } from "./AccountPrimitives";
export function AccountWeeklyCollections({
  bundle,
  range,
}: {
  bundle: AccountBundle;
  range: AccountsRange;
}) {
 const {money}=useFinancialPrivacy()

  const dates: string[] = [];
  const start = new Date(`${range.from}T12:00:00Z`);
  const endOfMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).toISOString().slice(0,10)
  const planTo = range.preset === 'month' ? endOfMonth : range.to
  const today = mexicoAccountDate(new Date(bundle.server_time))
  let next = shiftAccountDate(range.from, (6 - start.getUTCDay() + 7) % 7);
  while (next <= planTo && dates.length < 160) {
    dates.push(next);
    next = shiftAccountDate(next, 7);
  }
  return (
    <Surface
      title="Acuerdo de cobro de Acriland"
      description={`${money(bundle.account.monthly_fee)} cada sábado`}
      source="Calendario derivado del acuerdo reportado por Eder. Las fechas previstas no generan ingresos, depósitos confirmados ni cuentas por cobrar."
    >
      <div className="account-template-list">
        {dates.map((date) => (
          <article key={date} className="account-template">
            <div>
              <strong>{shortDate(date)}</strong>
              <p>{money(bundle.account.monthly_fee)} · referencia semanal</p>
            </div>
              <span className="account-source">{date > today ? 'Previsto · no recibido' : 'Comprobar depósito'}</span>
          </article>
        ))}
      </div>
      {!bundle.payments.length && (
        <p className="account-source">
          Alonso y Lucía deben registrar los comprobantes. La falta de registros
          no se interpreta como falta de pago.
        </p>
      )}
    </Surface>
  );
}
