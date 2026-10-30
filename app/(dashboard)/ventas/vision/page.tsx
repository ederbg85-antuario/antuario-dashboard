import {operationsData} from '@/lib/workspace'
import AreaWorkspace from '@/components/workspace/AreaWorkspace'
export default async function Page(){return <AreaWorkspace data={await operationsData()} area="sales"/>}
