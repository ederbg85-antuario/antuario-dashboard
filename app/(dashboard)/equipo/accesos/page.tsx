import {operationsData,requireWorkspace} from '@/lib/workspace'
import {redirect} from 'next/navigation'
import {TEAM_WORK_PATH} from '@/lib/workspace-navigation'
import TeamClient from '@/components/workspace/TeamClient'

export default async function Page(){
 const context=await requireWorkspace()
 if(!context.can('people'))redirect(TEAM_WORK_PATH)
 return <TeamClient data={await operationsData()}/>
}
