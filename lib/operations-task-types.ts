import type {OpsData,Task} from './operations-types'

export type TaskDetailData = Pick<OpsData,'projects'|'clients'|'team'|'profiles'|'checklists'|'comments'|'activity'|'capabilities'> & {
  classificationReady?: boolean
  dateKindsReady: boolean
}
export type TaskDetailResponse = {task:Task; data:TaskDetailData}
