<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');

const MAX_STATE_BYTES = 180000;
const ROOM_TTL_SECONDS = 86400;

$storage = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'rooms';
if (!is_dir($storage) && !@mkdir($storage, 0775, true)) {
    respond(array('error' => '無法建立房間資料夾，請將 storage 設為可寫入'), 500);
}

function respond($data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function cleanName($value): string {
    $value = trim((string)$value);
    if ($value === '') return '玩家';
    return function_exists('mb_substr') ? mb_substr($value, 0, 12, 'UTF-8') : substr($value, 0, 36);
}

function cleanCode($value): string {
    $code = strtoupper(trim((string)$value));
    return preg_match('/^[A-Z0-9]{6}$/', $code) ? $code : '';
}

function roomPath(string $storage, string $code): string {
    return $storage . DIRECTORY_SEPARATOR . $code . '.json';
}

function makeToken(): string {
    return bin2hex(random_bytes(24));
}

function makeCode(): string {
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $out = '';
    for ($i = 0; $i < 6; $i++) $out .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    return $out;
}

function seatOf(array $room, string $token): int {
    if (hash_equals((string)$room['host_token'], $token)) return 0;
    if (!empty($room['guest_token']) && hash_equals((string)$room['guest_token'], $token)) return 1;
    return -1;
}

function readRoom(string $path): ?array {
    if (!is_file($path)) return null;
    $fp = @fopen($path, 'rb');
    if (!$fp) return null;
    flock($fp, LOCK_SH);
    $raw = stream_get_contents($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    $room = json_decode((string)$raw, true);
    return is_array($room) ? $room : null;
}

function updateRoom(string $path, callable $change): array {
    $fp = @fopen($path, 'c+');
    if (!$fp) respond(array('error' => '房間資料無法寫入，請檢查 storage 權限'), 500);
    if (!flock($fp, LOCK_EX)) { fclose($fp); respond(array('error' => '房間目前忙碌，請稍後重試'), 503); }
    rewind($fp);
    $raw = stream_get_contents($fp);
    $room = json_decode((string)$raw, true);
    if (!is_array($room)) $room = array();
    $room = $change($room);
    rewind($fp);
    ftruncate($fp, 0);
    fwrite($fp, json_encode($room, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    return $room;
}

function cleanupRooms(string $storage): void {
    if (random_int(1, 100) !== 1) return;
    $cutoff = time() - ROOM_TTL_SECONDS;
    foreach ((array)glob($storage . DIRECTORY_SEPARATOR . '*.json') as $file) {
        if (@filemtime($file) < $cutoff) @unlink($file);
    }
}

cleanupRooms($storage);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $code = cleanCode($_GET['code'] ?? '');
    $token = (string)($_GET['token'] ?? '');
    $room = $code ? readRoom(roomPath($storage, $code)) : null;
    if (!$room || seatOf($room, $token) < 0) respond(array('error' => '房間驗證失敗'), 403);
    $knownRevision = isset($_GET['revision']) ? (int)$_GET['revision'] : -1;
    if ($knownRevision === (int)$room['revision']) {
        respond(array(
            'players' => empty($room['guest_token']) ? 1 : 2,
            'revision' => (int)$room['revision'],
            'unchanged' => true
        ));
    }
    respond(array(
        'players' => empty($room['guest_token']) ? 1 : 2,
        'revision' => (int)$room['revision'],
        'state' => $room['game_state'],
        'names' => array($room['host_name'], $room['guest_name']),
        'seat' => seatOf($room, $token)
    ));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(array('error' => '不支援的請求'), 405);
$rawInput = file_get_contents('php://input');
$body = json_decode((string)$rawInput, true);
if (!is_array($body)) respond(array('error' => '資料格式錯誤'), 400);
$action = (string)($body['action'] ?? '');
$name = cleanName($body['name'] ?? '玩家');

if ($action === 'create') {
    for ($attempt = 0; $attempt < 10; $attempt++) {
        $code = makeCode();
        $path = roomPath($storage, $code);
        $fp = @fopen($path, 'x');
        if (!$fp) continue;
        $token = makeToken();
        $room = array('host_token'=>$token,'guest_token'=>null,'host_name'=>$name,'guest_name'=>null,'revision'=>0,'game_state'=>null,'updated_at'=>time());
        fwrite($fp, json_encode($room, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        fclose($fp);
        respond(array('code'=>$code,'seat'=>0,'token'=>$token,'players'=>1), 201);
    }
    respond(array('error' => '暫時無法建立房間'), 500);
}

$code = cleanCode($body['code'] ?? '');
if ($code === '') respond(array('error' => '房號格式錯誤'), 400);
$path = roomPath($storage, $code);
if (!is_file($path)) respond(array('error' => '找不到這個房間'), 404);

if ($action === 'join') {
    $guestToken = makeToken();
    $room = updateRoom($path, function(array $room) use ($name, $guestToken): array {
        if (!empty($room['guest_token'])) respond(array('error' => '房間已滿'), 409);
        $room['guest_name'] = $name;
        $room['guest_token'] = $guestToken;
        $room['revision'] = (int)($room['revision'] ?? 0) + 1;
        $room['updated_at'] = time();
        return $room;
    });
    respond(array('code'=>$code,'seat'=>1,'token'=>$guestToken,'players'=>2));
}

$token = (string)($body['token'] ?? '');
$incomingState = $body['state'] ?? null;
$encodedState = json_encode($incomingState, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($encodedState === false || strlen($encodedState) > MAX_STATE_BYTES) respond(array('error' => '牌桌資料過大或格式錯誤'), 413);

if ($action === 'init' || $action === 'state') {
    $room = updateRoom($path, function(array $room) use ($action, $token, $incomingState): array {
        if (seatOf($room, $token) < 0) respond(array('error' => '房間驗證失敗'), 403);
        if ($action === 'init' && $room['game_state'] !== null) return $room;
        $room['game_state'] = $incomingState;
        $room['revision'] = (int)$room['revision'] + 1;
        $room['updated_at'] = time();
        return $room;
    });
    respond(array('ok'=>true,'revision'=>(int)$room['revision'],'state'=>$action === 'init' ? $room['game_state'] : null));
}

respond(array('error' => '不支援的操作'), 400);
