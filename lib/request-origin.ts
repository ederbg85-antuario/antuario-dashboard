// Next dev may normalize nextUrl to localhost; the HTTP Host remains the browser origin.
export function isSameOrigin(request:Request){
 const origin=request.headers.get('origin');if(!origin)return true
 try{const source=new URL(origin),target=new URL(request.url),host=request.headers.get('host');
 if(source.origin===target.origin)return true
 return source.host===host&&(source.protocol==='https:'||(process.env.NODE_ENV!=='production'&&source.protocol==='http:'))
 }catch{return false}
}
