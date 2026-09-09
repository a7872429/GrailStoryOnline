import {env} from "cloudflare:workers";

const json=(x:unknown,s=200)=>Response.json(x,{status:s,headers:{"cache-control":"no-store"}});
const token=()=>crypto.randomUUID().replaceAll("-","");
const roomCode=()=>Math.random().toString(36).slice(2,8).toUpperCase();
type Room={
 host_token:string; guest_token:string|null; player3_token:string|null; player4_token:string|null;
 host_name:string; guest_name:string|null; player3_name:string|null; player4_name:string|null;
 max_players:number; revision:number; game_state:string|null;
};
async function getRoom(code:string){return env.DB.prepare("SELECT host_token,guest_token,player3_token,player4_token,host_name,guest_name,player3_name,player4_name,max_players,revision,game_state FROM rooms WHERE code=?").bind(code).first<Room>()}
const names=(r:Room)=>[r.host_name,r.guest_name,r.player3_name,r.player4_name].slice(0,r.max_players);
const tokens=(r:Room)=>[r.host_token,r.guest_token,r.player3_token,r.player4_token].slice(0,r.max_players);
const seatOf=(r:Room,t:string)=>tokens(r).findIndex(x=>x===t);
const playerCount=(r:Room)=>tokens(r).filter(Boolean).length;

export async function POST(req:Request){
 const b=await req.json() as {action?:string;name?:string;code?:string;token?:string;state?:unknown;maxPlayers?:number};
 const name=(b.name||"玩家").trim().slice(0,12);
 if(b.action==="create"){
  const maxPlayers=b.maxPlayers===4?4:2;
  for(let i=0;i<5;i++){
   const code=roomCode(),t=token();
   try{
    await env.DB.prepare("INSERT INTO rooms(code,host_name,host_token,max_players,revision,updated_at) VALUES(?,?,?,?,?,?)").bind(code,name,t,maxPlayers,0,Date.now()).run();
    return json({code,seat:0,token:t,players:1,maxPlayers,names:[name]},201);
   }catch{}
  }
  return json({error:"暫時無法建立房間"},500);
 }
 if(b.action==="join"){
  const code=(b.code||"").trim().toUpperCase(),r=await getRoom(code);
  if(!r)return json({error:"找不到這個房間"},404);
  const seat=tokens(r).findIndex((x,i)=>i>0&&!x);
  if(seat<0)return json({error:"房間已滿"},409);
  const nameColumns=["host_name","guest_name","player3_name","player4_name"];
  const tokenColumns=["host_token","guest_token","player3_token","player4_token"];
  const t=token(),result=await env.DB.prepare(`UPDATE rooms SET ${nameColumns[seat]}=?,${tokenColumns[seat]}=?,revision=revision+1,updated_at=? WHERE code=? AND ${tokenColumns[seat]} IS NULL`).bind(name,t,Date.now(),code).run();
  if(!result.meta.changes)return json({error:"座位剛被其他玩家加入，請再試一次"},409);
  const current=await getRoom(code);
  return json({code,seat,token:t,players:current?playerCount(current):seat+1,maxPlayers:r.max_players,names:current?names(current):[]});
 }
 if(b.action==="init"||b.action==="state"){
  const code=(b.code||"").toUpperCase(),r=await getRoom(code);
  if(!r||seatOf(r,b.token||"")<0)return json({error:"房間驗證失敗"},403);
  const raw=JSON.stringify(b.state);
  if(raw.length>300000)return json({error:"牌桌資料過大"},413);
  if(b.action==="init"){
   await env.DB.prepare("UPDATE rooms SET game_state=?,revision=revision+1,updated_at=? WHERE code=? AND game_state IS NULL").bind(raw,Date.now(),code).run();
   const current=await getRoom(code);
   return json({ok:true,revision:current?.revision||0,state:current?.game_state?JSON.parse(current.game_state):null});
  }
  await env.DB.prepare("UPDATE rooms SET game_state=?,revision=revision+1,updated_at=? WHERE code=?").bind(raw,Date.now(),code).run();
  return json({ok:true,revision:r.revision+1});
 }
 return json({error:"不支援的操作"},400);
}

export async function GET(req:Request){
 const u=new URL(req.url),code=(u.searchParams.get("code")||"").toUpperCase(),t=u.searchParams.get("token")||"",r=await getRoom(code);
 if(!r||seatOf(r,t)<0)return json({error:"房間驗證失敗"},403);
 return json({players:playerCount(r),maxPlayers:r.max_players,revision:r.revision,state:r.game_state?JSON.parse(r.game_state):null,names:names(r),seat:seatOf(r,t)});
}
