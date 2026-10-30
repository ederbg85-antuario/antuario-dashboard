import {operationsData} from '@/lib/workspace'
import MarketingWorkspace from '@/components/workspace/MarketingWorkspace'
export default async function AdsPage(){return <MarketingWorkspace data={await operationsData()} adsOnly/>}
