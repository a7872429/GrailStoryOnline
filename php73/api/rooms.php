<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');
const MAX_STATE_BYTES = 300000;
const ROOM_TTL_SECONDS = 86400;
$storage = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'rooms';
if (!is_dir($storage) && !@mkdir($storage, 0775, true)) respond(array('error'=>'無法建立房間資料夾，請將 storage 設為可寫入'),500);
function respond($data,int $status=200):void{http_response_code($status);echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);exit;}
function cleanName($value):string{$value=trim((string)$value);if($value==='')return '玩家';return function_exists('mb_substr')?mb_substr($value,0,12,'UTF-8'):substr($value,0,36);}
function cleanCode($value):string{$code=strtoupper(trim((string)$value));return preg_match('/^[A-Z0-9]{6}$/',$code)?$code:'';}
function roomPath(string $storage,string $code):string{return $storage.DIRECTORY_SEPARATOR.$code.'.json';}
function makeToken():string{return bin2hex(random_bytes(24));}
function makeCode():string{$a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';$out='';for($i=0;$i<6;$i++)$out.=$a[random_int(0,strlen($a)-1)];return $out;}
function normalizeRoom(array $room):array{
 if(!isset($room['max_players']))$room['max_players']=2;
 if(!isset($room['tokens']))$room['tokens']=array($room['host_token']??null,$room['guest_token']??null);
 if(!isset($room['names']))$room['names']=array($room['host_name']??'玩家',$room['guest_name']??null);
 while(count($room['tokens'])<$room['max_players'])$room['tokens'][]=null;
 while(count($room['names'])<$room['max_players'])$room['names'][]=null;
 return $room;
}
function seatOf(array $room,string $token):int{$room=normalizeRoom($room);foreach($room['tokens'] as $i=>$stored)if($stored!==null&&hash_equals((string)$stored,$token))return (int)$i;return -1;}
function playerCount(array $room):int{$room=normalizeRoom($room);$n=0;foreach($room['tokens'] as $t)if(!empty($t))$n++;return $n;}
function readRoom(string $path):?array{if(!is_file($path))return null;$fp=@fopen($path,'rb');if(!$fp)return null;flock($fp,LOCK_SH);$raw=stream_get_contents($fp);flock($fp,LOCK_UN);fclose($fp);$room=json_decode((string)$raw,true);return is_array($room)?normalizeRoom($room):null;}
function updateRoom(string $path,callable $change):array{$fp=@fopen($path,'c+');if(!$fp)respond(array('error'=>'房間資料無法寫入，請檢查 storage 權限'),500);if(!flock($fp,LOCK_EX)){fclose($fp);respond(array('error'=>'房間目前忙碌，請稍後重試'),503);}rewind($fp);$room=json_decode((string)stream_get_contents($fp),true);if(!is_array($room))$room=array();$room=$change(normalizeRoom($room));rewind($fp);ftruncate($fp,0);fwrite($fp,json_encode($room,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));fflush($fp);flock($fp,LOCK_UN);fclose($fp);return $room;}
function cleanupRooms(string $storage):void{if(random_int(1,100)!==1)return;$cutoff=time()-ROOM_TTL_SECONDS;foreach((array)glob($storage.DIRECTORY_SEPARATOR.'*.json') as $file)if(@filemtime($file)<$cutoff)@unlink($file);}
cleanupRooms($storage);
if($_SERVER['REQUEST_METHOD']==='GET'){
 $code=cleanCode($_GET['code']??'');$token=(string)($_GET['token']??'');$room=$code?readRoom(roomPath($storage,$code)):null;
 if(!$room||seatOf($room,$token)<0)respond(array('error'=>'房間驗證失敗'),403);
 $known=isset($_GET['revision'])?(int)$_GET['revision']:-1;
 $base=array('players'=>playerCount($room),'maxPlayers'=>(int)$room['max_players'],'revision'=>(int)$room['revision'],'names'=>$room['names'],'seat'=>seatOf($room,$token));
 if($known===(int)$room['revision'])respond($base+array('unchanged'=>true));
 respond($base+array('state'=>$room['game_state']));
}
if($_SERVER['REQUEST_METHOD']!=='POST')respond(array('error'=>'不支援的請求'),405);
$body=json_decode((string)file_get_contents('php://input'),true);if(!is_array($body))respond(array('error'=>'資料格式錯誤'),400);
$action=(string)($body['action']??'');$name=cleanName($body['name']??'玩家');
if($action==='create'){
 $maxPlayers=isset($body['maxPlayers'])&&(int)$body['maxPlayers']===4?4:2;
 for($attempt=0;$attempt<10;$attempt++){$code=makeCode();$path=roomPath($storage,$code);$fp=@fopen($path,'x');if(!$fp)continue;$token=makeToken();$tokens=array_fill(0,$maxPlayers,null);$names=array_fill(0,$maxPlayers,null);$tokens[0]=$token;$names[0]=$name;$room=array('max_players'=>$maxPlayers,'tokens'=>$tokens,'names'=>$names,'revision'=>0,'game_state'=>null,'updated_at'=>time());fwrite($fp,json_encode($room,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));fclose($fp);respond(array('code'=>$code,'seat'=>0,'token'=>$token,'players'=>1,'maxPlayers'=>$maxPlayers,'names'=>$names),201);}
 respond(array('error'=>'暫時無法建立房間'),500);
}
$code=cleanCode($body['code']??'');if($code==='')respond(array('error'=>'房號格式錯誤'),400);$path=roomPath($storage,$code);if(!is_file($path))respond(array('error'=>'找不到這個房間'),404);
if($action==='join'){
 $newToken=makeToken();$seat=-1;
 $room=updateRoom($path,function(array $room)use($name,$newToken,&$seat):array{for($i=1;$i<(int)$room['max_players'];$i++)if(empty($room['tokens'][$i])){$seat=$i;break;}if($seat<0)respond(array('error'=>'房間已滿'),409);$room['names'][$seat]=$name;$room['tokens'][$seat]=$newToken;$room['revision']=(int)($room['revision']??0)+1;$room['updated_at']=time();return $room;});
 respond(array('code'=>$code,'seat'=>$seat,'token'=>$newToken,'players'=>playerCount($room),'maxPlayers'=>(int)$room['max_players'],'names'=>$room['names']));
}
$token=(string)($body['token']??'');$incoming=$body['state']??null;$encoded=json_encode($incoming,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);if($encoded===false||strlen($encoded)>MAX_STATE_BYTES)respond(array('error'=>'牌桌資料過大或格式錯誤'),413);
if($action==='init'||$action==='state'){$room=updateRoom($path,function(array $room)use($action,$token,$incoming):array{if(seatOf($room,$token)<0)respond(array('error'=>'房間驗證失敗'),403);if($action==='init'&&$room['game_state']!==null)return $room;$room['game_state']=$incoming;$room['revision']=(int)$room['revision']+1;$room['updated_at']=time();return $room;});respond(array('ok'=>true,'revision'=>(int)$room['revision'],'state'=>$action==='init'?$room['game_state']:null));}
respond(array('error'=>'不支援的操作'),400);
