<?php
declare(strict_types=1);
header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#19140f">
  <title>傳說紀行｜雙人連線版</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:"Noto Sans TC","PingFang TC",sans-serif;background:#120e0b;color:#f6ead5}body{background:radial-gradient(circle at 50% 45%,#382719 0,#17100c 42%,#0d0a08 100%)}main{min-height:100vh;display:grid;place-items:center;padding:24px}.room{width:min(520px,100%);padding:34px;border:1px solid #8d7043;border-radius:22px;background:rgba(30,22,16,.96);box-shadow:0 24px 80px #0009;text-align:center}.room::after{content:"v0.28.0｜更新：2026-09-08 23:51（台灣時間）";display:block;margin-top:16px;color:#9f9078;font-size:13px}.eyebrow{color:#ddb86b;letter-spacing:.18em;font-size:13px}.room h1{margin:8px 0 12px;font-size:42px}.room label{display:grid;gap:8px;text-align:left;margin:24px 0}.room input,.room button,.room a{width:100%;min-height:48px;border-radius:11px;border:1px solid #715833;background:#221910;color:#f6ead5;font-size:16px;padding:11px 14px}.room button,.room a{cursor:pointer;text-decoration:none;display:grid;place-items:center;margin-top:12px}.room .primary{background:#765424;border-color:#d4a44b;font-weight:700}.join{display:grid;grid-template-columns:1fr 130px;gap:10px;margin-top:14px}.join button{margin:0}.message{color:#ffb6a8}.status{margin:20px 0}.status i{display:inline-block;width:10px;height:10px;border-radius:50%;background:#777;margin-right:8px}.status i.on{background:#63d77c}.room-code{font:700 48px/1 monospace;letter-spacing:.12em;color:#f3cc75}.timer-rule{font-size:14px;line-height:1.7;color:#cdbd9f}@media(max-width:520px){.room{padding:24px}.join{grid-template-columns:1fr}.room h1{font-size:34px}}
  </style>
</head>
<body><main><section class="room" id="app"><p>載入中…</p></section></main>
<script>
(function(){
  var app=document.getElementById('app'),room=null,timer=null;
  function esc(s){return String(s||'').replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function lobby(msg){app.innerHTML='<p class="eyebrow">LEGEND CHRONICLE</p><h1>傳說紀行</h1><p>選擇遊玩方式</p><label>你的名稱<input id="name" value="玩家" maxlength="12"></label><button id="create" class="primary">建立線上房間</button><div class="join"><input id="code" placeholder="輸入六位房號" maxlength="6"><button id="join">加入房間</button></div><a href="game/index.html">同一台電腦遊玩</a><p class="message">'+esc(msg||'')+'</p>';document.getElementById('create').onclick=create;document.getElementById('join').onclick=join;document.getElementById('code').oninput=function(){this.value=this.value.toUpperCase()}}
  function request(body){return fetch('api/rooms.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(x){if(!r.ok)throw new Error(x.error||'連線失敗');return x})})}
  function create(){request({action:'create',name:document.getElementById('name').value}).then(openRoom).catch(function(e){lobby(e.message)})}
  function join(){request({action:'join',name:document.getElementById('name').value,code:document.getElementById('code').value}).then(openRoom).catch(function(e){lobby(e.message)})}
  function openRoom(x){room=x;drawRoom();clearInterval(timer);timer=setInterval(poll,1500)}
  function drawRoom(){var ready=room.players===2;app.innerHTML='<p class="eyebrow">線上對戰房間</p><div class="room-code">'+esc(room.code)+'</div><p>你是玩家'+(room.seat+1)+'｜'+room.players+'/2 人已連線</p><div class="status"><i class="'+(ready?'on':'')+'"></i>'+(ready?'雙方已就緒':'等待另一位玩家加入…')+'</div><p class="timer-rule">60 秒提醒｜120 秒系統代打<br>單回合 5 分鐘或累計 5 次直接判負</p>'+(ready?'<a class="primary" href="game/index.html?room='+encodeURIComponent(room.code)+'&seat='+room.seat+'&token='+encodeURIComponent(room.token)+'">進入對戰桌</a>':'')+'<button id="copy">複製房號</button>';document.getElementById('copy').onclick=function(){if(navigator.clipboard)navigator.clipboard.writeText(room.code)}}
  function poll(){fetch('api/rooms.php?code='+encodeURIComponent(room.code)+'&token='+encodeURIComponent(room.token),{cache:'no-store'}).then(function(r){return r.json()}).then(function(x){if(x.players!==room.players){room.players=x.players;drawRoom()}}).catch(function(){})}
  lobby('');
})();
</script></body></html>
