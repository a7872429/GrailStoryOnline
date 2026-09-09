"use client";
import {useEffect,useState} from "react";

type Room={code:string;seat:number;token:string;players:number;maxPlayers:number;names?:Array<string|null>};
const seatName=(seat:number,max:number)=>max===4?["紅方一號","藍方一號","紅方二號","藍方二號"][seat]:`玩家${seat+1}`;

export default function Home(){
 const[name,setName]=useState("玩家"),[code,setCode]=useState(""),[room,setRoom]=useState<Room|null>(null),[msg,setMsg]=useState("");
 async function call(body:object){setMsg("連線中…");const r=await fetch("/api/rooms",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),x=await r.json();if(!r.ok)throw Error(x.error||"連線失敗");return x}
 async function create(maxPlayers:number){try{setRoom(await call({action:"create",name,maxPlayers}));setMsg("")}catch(e){setMsg((e as Error).message)}}
 async function join(){try{setRoom(await call({action:"join",name,code}));setMsg("")}catch(e){setMsg((e as Error).message)}}
 useEffect(()=>{if(!room)return;const id=setInterval(async()=>{try{const r=await fetch(`/api/rooms?code=${room.code}&token=${room.token}`);if(r.ok){const x=await r.json();setRoom(v=>v?{...v,players:x.players,maxPlayers:x.maxPlayers,names:x.names}:v)}}catch{}},1500);return()=>clearInterval(id)},[room?.code,room?.token]);
 if(room){const ready=room.players===room.maxPlayers;return <main className="lobby"><section className="room"><p className="eyebrow">線上對戰房間</p><h1>{room.code}</h1><p>你是{seatName(room.seat,room.maxPlayers)}｜{room.players}/{room.maxPlayers} 人已連線</p>{room.maxPlayers===4&&<p className="team-order">隊伍與順序：紅一 → 藍一 → 紅二 → 藍二</p>}<div className="status"><i className={ready?"on":""}/>{ready?"所有玩家已就緒":`等待玩家加入（尚缺 ${room.maxPlayers-room.players} 人）`}</div><p className="timer-rule">60 秒提醒（計 1 次）｜120 秒系統代打（再計 1 次）<br/>單回合 5 分鐘或累計 5 次自動判負</p>{ready?<a className="primary" href={`/game/index.html?room=${room.code}&seat=${room.seat}&token=${room.token}`}>進入對戰桌</a>:null}<button onClick={()=>navigator.clipboard.writeText(room.code)}>複製房號</button></section></main>}
 return <main className="lobby"><section className="room"><p className="eyebrow">LEGEND CHRONICLE</p><h1>傳說紀行</h1><p>選擇遊玩方式</p><label>你的名稱<input value={name} onChange={e=>setName(e.target.value)} maxLength={12}/></label><button className="primary" onClick={()=>create(2)}>建立雙人房間</button><button className="primary" onClick={()=>create(4)}>建立四人隊伍房間</button><div className="join"><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="輸入六位房號" maxLength={6}/><button onClick={join}>加入房間</button></div><a href="/game/index.html">同一台電腦遊玩</a>{msg&&<p className="message">{msg}</p>}</section></main>
}
