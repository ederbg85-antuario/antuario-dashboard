import {operationsData} from '@/lib/workspace'
import MarketingWorkspace from '@/components/workspace/MarketingWorkspace'
export default async function MarketingPage(){return <MarketingWorkspace data={await operationsData()}/>}
