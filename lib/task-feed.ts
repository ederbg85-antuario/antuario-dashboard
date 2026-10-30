import {z} from 'zod'
export const TASK_FEED_LIMIT=30
const cursorSchema=z.object({at:z.iso.datetime({offset:true}),id:z.union([z.uuid(),z.string().regex(/^\d+$/)])})
export function readTaskCursor(value:string|null){
 if(!value)return null
 try{return cursorSchema.parse(JSON.parse(Buffer.from(value,'base64url').toString('utf8')))}catch{return undefined}
}
export function taskFeedPage<T extends {id:string|number;created_at:string}>(rows:T[]){
 const items=rows.slice(0,TASK_FEED_LIMIT),last=items.at(-1)
 return {items,nextCursor:rows.length>TASK_FEED_LIMIT&&last?Buffer.from(JSON.stringify({at:last.created_at,id:String(last.id)})).toString('base64url'):null}
}
