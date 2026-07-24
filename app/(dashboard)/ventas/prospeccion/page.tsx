import { redirect } from 'next/navigation'

// La Prospección se unificó dentro del CRM (Ventas → CRM).
// Esta ruta se conserva solo para no romper links viejos.
export default function ProspeccionPage() {
  redirect('/ventas/crm')
}
