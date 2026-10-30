import type {DeliveryArtifact} from './task-deliveries'

/** Only evidence attached to this immutable version can become its cover. */
export function deliveryCoverIndex(artifacts:DeliveryArtifact[]) {
  for(const kind of ['image','pdf','document','link']) {
    const index=artifacts.findIndex(a=>a.kind===kind&&(kind!=='document'||!a.name.toLowerCase().endsWith('.xml')))
    if(index>=0)return index
  }
  return artifacts.length?0:-1
}
export function documentCoverText(text:string) {
  return text.slice(0,900).replace(/^\s*#{1,6}\s+/gm,'').trim()
}
