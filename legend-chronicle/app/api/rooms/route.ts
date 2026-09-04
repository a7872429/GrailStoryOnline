import {env} from "cloudflare:workers";
const json=(x:unknown,s=200)=>Response.json(x,{status:s,headers:{"cache-control":"no-store"}});
const token=()=>crypto.randomUUID().replaceAll("-","");
const roomCode=()=>Math.random().toString(36).slice(2,8).toUpperCase();
type Room={host_token:string;guest_token:string|null;host_name:string;guest_name:string|null;revision:number;game_state:string|null};
async function getRoom(code:string){return env.DB.prepare("SELECT host_token,guest_token,host_name,guest_name,revision,game_state FROM rooms WHERE code=?").bind(code).first<Room>()}
function seatOf(r:Room,t:string){return t===r.host_token?0:t===r.guest_token?1:-1}
export async function POST(req:Request){
 const b=await req.json() as {action?:string;name?:string;code?:string;token?:string;state?:unknown},name=(b.name||"玩家").trim().slice(0,12);
 if(b.action==="create"){for(let i=0;i<5;i++){const code=roomCode(),t=token();try{await env.DB.prepare("INSERT INTO rooms(code,host_name,host_token,revision,updated_at) VALUES(?,?,?,?,?)").bind(code,name,t,0,Date.now()).run();return json({code,seat:0,token:t,players:1},201)}catch{}}return json({error:"暫時無法建立房間"},500)}
 if(b.action==="join"){const code=(b.code||"").trim().toUpperCase(),r=await getRoom(code);if(!r)return json({error:"找不到這個房間"},404);if(r.guest_token)return json({error:"房間已滿"},409);const t=token();await env.DB.prepare("UPDATE rooms SET guest_name=?,guest_token=?,revision=revision+1,updated_at=? WHERE code=? AND guest_token IS NULL").bind(name,t,Date.now(),code).run();return json({code,seat:1,token:t,players:2})}
 if(b.action==="init"){const code=(b.code||"").toUpperCase(),r=await getRoom(code);if(!r||seatOf(r,b.token||"")<0)return json({error:"房間驗證失敗"},403);const raw=JSON.stringify(b.state);if(raw.length>180000)return json({error:"牌桌資料過大"},413);await env.DB.prepare("UPDATE rooms SET game_state=?,revision=revision+1,updated_at=? WHERE code=? AND game_state IS NULL").bind(raw,Date.now(),code).run();const current=await getRoom(code);return json({ok:true,revision:current?.revision||0,state:current?.game_state?JSON.parse(current.game_state):null})}
 if(b.action==="state"){const code=(b.code||"").toUpperCase(),r=await getRoom(code);if(!r||seatOf(r,b.token||"")<0)return json({error:"房間驗證失敗"},403);const raw=JSON.stringify(b.state);if(raw.length>180000)return json({error:"牌桌資料過大"},413);await env.DB.prepare("UPDATE rooms SET game_state=?,revision=revision+1,updated_at=? WHERE code=?").bind(raw,Date.now(),code).run();return json({ok:true,revision:r.revision+1})}
 return json({error:"不支援的操作"},400)
}
export async function GET(req:Request){const u=new URL(req.url),code=(u.searchParams.get("code")||"").toUpperCase(),t=u.searchParams.get("token")||"",r=await getRoom(code);if(!r||seatOf(r,t)<0)return json({error:"房間驗證失敗"},403);return json({players:r.guest_token?2:1,revision:r.revision,state:r.game_state?JSON.parse(r.game_state):null,names:[r.host_name,r.guest_name],seat:seatOf(r,t)})}
