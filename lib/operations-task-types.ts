import type {OpsData,Task} from './operations-types'

export type TaskDetailData = Pick<OpsData,'projects'|'clients'|'team'|'profiles'|'checklists'|'comments'|'activity'|'capabilities'> & {
  classificationReady?: boolean
  dateKindsReady: boolean
  feed?: {comments:string|null;activity:string|null}
}
export type TaskDetailResponse = {task:Task; data:TaskDetailData}
