import OperationsClient from '@/components/operations/OperationsClient'
import {operationsData} from '@/lib/workspace'
export default async function Page(){const data=await operationsData();return <OperationsClient view='accounting' data={data}/> }
