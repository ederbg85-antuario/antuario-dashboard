import {operationsData,requireWorkspace} from '@/lib/workspace'
import {redirect} from 'next/navigation'
import {TEAM_WORK_PATH} from '@/lib/workspace-navigation'
import PeopleWorkspace from '@/components/workspace/PeopleWorkspace'

export default async function Page(){
 const context=await requireWorkspace()
 if(!context.can('people'))redirect(TEAM_WORK_PATH)
 return <PeopleWorkspace data={await operationsData()}/>
}
