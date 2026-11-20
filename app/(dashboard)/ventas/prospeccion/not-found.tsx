import Link from 'next/link'
export default function MissingDeal(){
 return <section className="op-workspace"><h1>Ficha no disponible</h1><p>Vuelve al tablero para consultar tu cartera actual.</p><Link className="op-button" href="/ventas/prospeccion">Volver a Prospección</Link></section>
}
