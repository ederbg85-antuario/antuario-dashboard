import type {Client,OpsData,Project} from './operations-types'

export const isArchivedClient=(client?:Pick<Client,'status'>)=>client?.status==='archived'

/** History remains queryable; only current work contributes to operating indicators. */
export function isCurrentProject(project:Project,clients:Client[]=[]){
 return !['completed','cancelled'].includes(project.status)&&!isArchivedClient(clients.find(c=>c.id===project.client_id))
}

export function activeClientProjects(data:Pick<OpsData,'projects'|'clients'>){
 return data.projects.filter(p=>p.client_id&&isCurrentProject(p,data.clients))
}
