import {requireWorkspace} from '@/lib/workspace'
import {canCoordinateTeamWork,type TeamWorkItem,type TeamWorkEvent,type WorkMember} from '@/lib/team-work'
import TeamWorkInbox from '@/components/workspace/TeamWorkInbox'
import {canReadWossInstructions} from '@/lib/woss-instructions-access'

export default async function Page(){
 const c=await requireWorkspace()
 const [work,members]=await Promise.all([
  c.db.from('team_work_items').select('*').eq('organization_id',c.orgId).order('updated_at',{ascending:false}).order('id',{ascending:false}).limit(200),
  c.db.from('team_members').select('id,name,position,user_id,areas,status').eq('organization_id',c.orgId).eq('status','active').not('user_id','is',null).order('name'),
 ])
 const ids=(work.data??[]).map(item=>item.id)
 const events=ids.length?await c.db.from('team_work_events').select('*').eq('organization_id',c.orgId).in('work_id',ids).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(2001):{data:[],error:null}
 return <TeamWorkInbox items={(work.data??[]) as TeamWorkItem[]} events={(events.data??[]).slice(0,2000).reverse() as TeamWorkEvent[]} eventsTruncated={(events.data??[]).length>2000} instructionsAccess={canReadWossInstructions(c)} members={(members.data??[]) as WorkMember[]} selfId={c.seat?.status==='active'?c.seat.id:null} coordinator={canCoordinateTeamWork(c.role,c.seat)} error={!!work.error||!!members.error||!!events.error} asOf={new Date().toISOString()}/>
}
