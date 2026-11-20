
# Copilot Playbook — **Full Lua + Node Stack** with Dual Namespaces
**Goal:** Implement a production‑ready pipeline for **all RMonitor message types** using **Redis + Lua** (atomic, idempotent) and maintain **two mirrored namespaces**:

- **`default:lua:*`** → internal, canonical, high‑fidelity keys (ZSETs, streams, hashes).  
- **`default:human:*`** → flattened, human‑friendly mirrors for overlays/APIs:
  - `default:human:leaderboard` (JSON string, top N)
  - `default:human:drivers` (Hash: field=`rid`, value=JSON per piloto)
  - `default:human:session` (Hash: metadatos de sesión y estado)

A **trigger** publishes `default:lua:race:{S}:ch:dirty` after cada escritura atómica. Un **Sync Worker** llama a un **Lua de sincronización** para reflejar los cambios en las claves “human”.

> `{S}` = `SESSION_KEY`. **Usa `{S}` entre llaves** en todas las claves para *Redis Cluster slot affinity*.

---

## ENV (ejemplo)
```bash
REDIS_URL=redis://127.0.0.1:6379
SESSION_KEY=SimCarrera
RAW_STREAM_KEY=rmon:raw
RAW_GROUP=parser
RAW_CONSUMER=parser-1

# Lua script paths
J_LUA_PATH=lua/j_update.lua
G_LUA_PATH=lua/g_apply.lua
H_LUA_PATH=lua/h_update.lua
F_LUA_PATH=lua/f_update.lua
A_LUA_PATH=lua/a_upsert.lua
COMP_LUA_PATH=lua/comp_upsert.lua
B_LUA_PATH=lua/b_set.lua
C_LUA_PATH=lua/c_set.lua
E_LUA_PATH=lua/e_set.lua
I_LUA_PATH=lua/i_epoch.lua
COR_LUA_PATH=lua/cor_apply.lua
SYNC_LUA_PATH=lua/sync_human.lua

# Leaderboard weight
LBRD_W=1000000000  # 1e9
HUMAN_TOPN=20      # top N para default:human:leaderboard
```

---

## Keyspace (internal, **default:lua:***)
```
default:lua:race:{S}:run                     (H)  # epoch, run_number, last_init_time/date, updated_at_ms
default:lua:race:{S}:event                   (H)  # TRACKNAME, TRACKLENGTH, etc (from $E)
default:lua:race:{S}:class:{cid}             (H)  # name (from $C)
default:lua:race:{S}:rid                     (H)  # map reg -> rid
default:lua:race:{S}:rid:seq                 (I)  # INCR for new rid

default:lua:race:{S}:driver:{rid}:catalog    (H)  # reg, number, first_name, last_name, class, transponder...
default:lua:race:{S}:driver:{rid}:state      (H)  # laps, last_total_ms, pos, best_ms, best_lap, updated_at_ms
default:lua:race:{S}:driver:{rid}:laps       (H)  # field "<lap>" = "lap_ms,total_ms"
default:lua:race:{S}:driver:{rid}:pass_recent(L)  # recientes (LPUSH/LTRIM)

default:lua:race:{S}:lbrd                    (Z)  # leaderboard global (score compuesto)
default:lua:race:{S}:class:{cid}:lbrd        (Z)  # leaderboard por clase

default:lua:race:{S}:x:pass                  (X)  # stream de passings (capped)
default:lua:race:{S}:x:cor                   (X)  # stream de correcciones (capped)
default:lua:race:{S}:x:init                  (X)  # stream de inits (capped)
default:lua:race:{S}:x:dead                  (X)  # dead-letter
default:lua:race:{S}:x:unknown               (X)  # mensajes desconocidos
default:lua:race:{S}:ch:pass                 (PubSub)
default:lua:race:{S}:ch:init                 (PubSub)
default:lua:race:{S}:ch:flag                 (PubSub)
default:lua:race:{S}:ch:dirty                (PubSub) # TRIGGER → invocar sync_human.lua
```

## Keyspace (public, **default:human:***)
```
default:human:leaderboard     (S)  # JSON compact con top N [{rid, pos, laps, total_ms, gap_ms, interval_ms, number, first_name, last_name, class}]
default:human:drivers         (H)  # field=rid, value=JSON {reg, number, name, class, laps, total_ms, best_ms, best_lap, pos}
default:human:session         (H)  # {epoch, run_number, flag, laps_to_go, time_of_day, race_time_ms, TRACKNAME, TRACKLENGTH, updated_at_ms}
```

---

# 1) **Lua** — `$A` (a_upsert.lua)
Actualiza catálogo del piloto. No toca leaderboard.

```lua
-- KEYS:
-- 1 catalogKey   = default:lua:race:{S}:driver:{rid}:catalog
-- 2 ridMapKey    = default:lua:race:{S}:rid
-- 3 ridSeqKey    = default:lua:race:{S}:rid:seq
-- 4 dirtyChan    = default:lua:race:{S}:ch:dirty
-- ARGV:
-- 1 reg, 2 number, 3 transponder, 4 first, 5 last, 6 nationality, 7 class, 8 now_ms, 9 sessionKey

local reg = ARGV[1]
local rid = redis.call('HGET', KEYS[2], reg)
if not rid then
  rid = tostring(redis.call('INCR', KEYS[3]))
  redis.call('HSET', KEYS[2], reg, rid)
end

redis.call('HSET', KEYS[1],
  'reg', reg, 'number', ARGV[2], 'transponder', ARGV[3],
  'first_name', ARGV[4], 'last_name', ARGV[5], 'nationality', ARGV[6],
  'class', ARGV[7], 'updated_at_ms', ARGV[8]
)

redis.call('PUBLISH', KEYS[4], '{"type":"A","rid":'..rid..'}')
return rid
```

# 2) **Lua** — `$COMP` (comp_upsert.lua)
Refresca datos básicos (como $A).

```lua
-- KEYS: 1 catalogKey, 2 ridMapKey, 3 ridSeqKey, 4 dirtyChan
-- ARGV: 1 reg, 2 number, 3 class, 4 first, 5 last, 6 now_ms
local reg = ARGV[1]
local rid = redis.call('HGET', KEYS[2], reg)
if not rid then
  rid = tostring(redis.call('INCR', KEYS[3]))
  redis.call('HSET', KEYS[2], reg, rid)
end
redis.call('HSET', KEYS[1],
  'reg', reg, 'number', ARGV[2], 'class', ARGV[3],
  'first_name', ARGV[4], 'last_name', ARGV[5], 'updated_at_ms', ARGV[6]
)
redis.call('PUBLISH', KEYS[4], '{"type":"COMP","rid":'..rid..'}')
return rid
```

# 3) **Lua** — `$B` (b_set.lua)
```lua
-- KEYS: 1 runKey=default:lua:race:{S}:run, 2 dirtyChan
-- ARGV: 1 run_number, 2 description, 3 now_ms
redis.call('HSET', KEYS[1], 'run_number', ARGV[1], 'description', ARGV[2], 'updated_at_ms', ARGV[3])
redis.call('PUBLISH', KEYS[2], '{"type":"B"}')
return 'OK'
```

# 4) **Lua** — `$C` (c_set.lua)
```lua
-- KEYS: 1 classKey=default:lua:race:{S}:class:{cid}, 2 dirtyChan
-- ARGV: 1 name
redis.call('HSET', KEYS[1], 'name', ARGV[1])
redis.call('PUBLISH', KEYS[2], '{"type":"C","cid":"'..ARGV[1]..'"}')
return 'OK'
```

# 5) **Lua** — `$E` (e_set.lua)
```lua
-- KEYS: 1 eventKey=default:lua:race:{S}:event, 2 dirtyChan
-- ARGV: 1 key, 2 value
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('PUBLISH', KEYS[2], '{"type":"E","k":"'..ARGV[1]..'"}')
return 'OK'
```

# 6) **Lua** — `$F` (f_update.lua)
```lua
-- KEYS: 1 runKey=default:lua:race:{S}:run, 2 flagChan=default:lua:race:{S}:ch:flag, 3 dirtyChan
-- ARGV: 1 laps_to_go, 2 time_to_go_ms, 3 time_of_day, 4 race_time_ms, 5 flag, 6 now_ms
redis.call('HSET', KEYS[1],
  'laps_to_go', ARGV[1], 'time_to_go_ms', ARGV[2], 'time_of_day', ARGV[3],
  'race_time_ms', ARGV[4], 'flag', ARGV[5], 'updated_at_ms', ARGV[6]
)
redis.call('PUBLISH', KEYS[2], '{"flag":"'..ARGV[5]..'"}')
redis.call('PUBLISH', KEYS[3], '{"type":"F"}')
return 'OK'
```

# 7) **Lua** — `$I` (i_epoch.lua)
```lua
-- KEYS: 1 runKey, 2 initStream=default:lua:race:{S}:x:init, 3 initChan=default:lua:race:{S}:ch:init, 4 dirtyChan
-- ARGV: 1 time_of_day, 2 date_str, 3 now_ms
local epoch = tonumber(redis.call('HINCRBY', KEYS[1], 'epoch', 1))
redis.call('HSET', KEYS[1], 'last_init_time', ARGV[1], 'last_init_date', ARGV[2], 'updated_at_ms', ARGV[3])
redis.call('XADD', KEYS[2], 'MAXLEN', '~', '2000', '*', 'epoch', tostring(epoch), 'time', ARGV[1], 'date', ARGV[2], 'ts_ms', ARGV[3])
redis.call('PUBLISH', KEYS[3], '{"epoch":'..tostring(epoch)..'}')
redis.call('PUBLISH', KEYS[4], '{"type":"I"}')
return tostring(epoch)
```

# 8) **Lua** — `$J` (j_update.lua) con **leaderboard** y **trigger**
```lua
-- KEYS:
-- 1 stateKey, 2 lapsKey, 3 recentKey, 4 passStream, 5 passChan, 6 lbrdKey, 7 catalogKey, 8 dirtyChan
-- ARGV:
-- 1 rid, 2 lap_ms, 3 total_ms, 4 now_ms, 5 classZsetPrefix, 6 W

local last = tonumber(redis.call('HGET', KEYS[1], 'last_total_ms') or '0')
local laps = tonumber(redis.call('HGET', KEYS[1], 'laps') or '0')
local total = tonumber(ARGV[3])

if last > 0 and total <= last then
  return 'SKIP'
end

local nextlap = laps + 1

redis.call('HSET', KEYS[1], 'last_total_ms', total, 'laps', nextlap, 'updated_at_ms', ARGV[4])
redis.call('HSET', KEYS[2], tostring(nextlap), tostring(ARGV[2]) .. ',' .. tostring(total))
redis.call('LPUSH', KEYS[3], tostring(nextlap) .. ',' .. tostring(ARGV[2]) .. ',' .. tostring(total))
redis.call('LTRIM', KEYS[3], 0, 49)

redis.call('XADD', KEYS[4], 'MAXLEN', '~', '20000', '*',
  'rid', ARGV[1], 'lap', nextlap, 'lap_ms', ARGV[2], 'total_ms', total, 'ts_ms', ARGV[4]
)

local W = tonumber(ARGV[6])
local score = (nextlap * W) - total
redis.call('ZADD', KEYS[6], score, ARGV[1])

local cid = redis.call('HGET', KEYS[7], 'class')
if cid then
  local classKey = ARGV[5] .. cid .. ':lbrd'
  redis.call('ZADD', classKey, score, ARGV[1])
end

local rank = redis.call('ZREVRANK', KEYS[6], ARGV[1])
if rank then
  redis.call('HSET', KEYS[1], 'pos', rank + 1)
end

local payload = '{"rid":'..ARGV[1]..',"lap":'..nextlap..',"lap_ms":'..ARGV[2]..',"total_ms":'..total..'}'
redis.call('PUBLISH', KEYS[5], payload)

-- TRIGGER → marcar dirty para sincronizar a default:human:*
redis.call('PUBLISH', KEYS[8], '{"type":"J"}')
return tostring(nextlap)
```

# 9) **Lua** — `$G` (g_apply.lua)
```lua
-- KEYS: 1 stateKey, 2 lbrdKey, 3 catalogKey, 4 dirtyChan
-- ARGV: 1 rid, 2 pos, 3 laps, 4 total_ms, 5 classZsetPrefix, 6 W, 7 now_ms

redis.call('HSET', KEYS[1], 'pos', ARGV[2], 'laps', ARGV[3], 'last_total_ms', ARGV[4], 'updated_at_ms', ARGV[7])
local W = tonumber(ARGV[6])
local score = (tonumber(ARGV[3]) * W) - tonumber(ARGV[4])
redis.call('ZADD', KEYS[2], score, ARGV[1])

local cid = redis.call('HGET', KEYS[3], 'class')
if cid then
  local classKey = ARGV[5] .. cid .. ':lbrd'
  redis.call('ZADD', classKey, score, ARGV[1])
end

redis.call('PUBLISH', KEYS[4], '{"type":"G"}')
return 'OK'
```

# 10) **Lua** — `$H` (h_update.lua)
```lua
-- KEYS: 1 stateKey, 2 dirtyChan
-- ARGV: 1 best_lap, 2 best_ms, 3 now_ms
redis.call('HSET', KEYS[1], 'best_lap', ARGV[1], 'best_ms', ARGV[2], 'updated_at_ms', ARGV[3])
redis.call('PUBLISH', KEYS[2], '{"type":"H"}')
return 'OK'
```

# 11) **Lua** — `$COR` (cor_apply.lua)
```lua
-- KEYS: 1 stateKey, 2 lapsKey, 3 lbrdKey, 4 catalogKey, 5 dirtyChan
-- ARGV: 1 rid, 2 lapCount, 3 new_total_ms, 4 classZsetPrefix, 5 W, 6 now_ms

local lapVal = redis.call('HGET', KEYS[2], tostring(ARGV[2]))
if lapVal then
  local sep = string.find(lapVal, ',')
  local lap_ms = tonumber(string.sub(lapVal, 1, sep-1)) or 0
  local old_total = tonumber(string.sub(lapVal, sep+1)) or 0
  local delta = tonumber(ARGV[3]) - old_total
  local new_lap_ms = math.max(0, lap_ms + delta)
  redis.call('HSET', KEYS[2], tostring(ARGV[2]), tostring(new_lap_ms)..','..tostring(ARGV[3]))
end

redis.call('HSET', KEYS[1], 'last_total_ms', ARGV[3], 'updated_at_ms', ARGV[6])

local laps = tonumber(redis.call('HGET', KEYS[1], 'laps') or '0')
local W = tonumber(ARGV[5])
local score = (laps * W) - tonumber(ARGV[3])
redis.call('ZADD', KEYS[3], score, ARGV[1])

local cid = redis.call('HGET', KEYS[4], 'class')
if cid then
  local classKey = ARGV[4] .. cid .. ':lbrd'
  redis.call('ZADD', classKey, score, ARGV[1])
end

redis.call('PUBLISH', KEYS[5], '{"type":"COR"}')
return 'OK'
```

---

# 12) **Lua** — **sync_human.lua** (TRIGGER: refleja `default:lua:*` → `default:human:*`)
Construye:
- `default:human:leaderboard` (JSON, top N del ZSET global con `gap`/`interval`)
- `default:human:drivers` (Hash: rid → JSON plano)
- `default:human:session` (Hash plano)

```lua
-- KEYS:
-- 1 lbrdKey         = default:lua:race:{S}:lbrd
-- 2 runKey          = default:lua:race:{S}:run
-- 3 eventKey        = default:lua:race:{S}:event
-- 4 ridMapKey       = default:lua:race:{S}:rid
-- 5 humanLbKey      = default:human:leaderboard
-- 6 humanDriversKey = default:human:drivers
-- 7 humanSessionKey = default:human:session
-- ARGV:
-- 1 topN, 2 sessionKey

local function hgetall_map(key)
  local arr = redis.call('HGETALL', key)
  local map = {}
  for i=1,#arr,2 do map[arr[i]] = arr[i+1] end
  return map
end

-- Build leaderboard JSON
local ids = redis.call('ZREVRANGE', KEYS[1], 0, tonumber(ARGV[1]) - 1)
local rows = {}
for i=1,#ids do
  local rid = ids[i]
  local st = hgetall_map('default:lua:race:'..ARGV[2]..':driver:'..rid..':state')
  local cat = hgetall_map('default:lua:race:'..ARGV[2]..':driver:'..rid..':catalog')
  local laps = tonumber(st['laps'] or '0')
  local total_ms = tonumber(st['last_total_ms'] or '0')
  local item = '{"rid":'..rid..',"pos":'..i..',"laps":'..laps..',"total_ms":'..total_ms..
               ',"number":"'..(cat['number'] or '')..'","first_name":"'..(cat['first_name'] or '')..'","last_name":"'..(cat['last_name'] or '')..'","class":"'..(cat['class'] or '')..'"}'
  table.insert(rows, item)
end

-- Compute gap & interval on the fly (approx: second pass in JS is nicer, but keep it simple)
-- Here we do a minimalistic approach: rewrite JSON with gap/interval later in app if needed.
local lbJson = '['..table.concat(rows, ',')..']'
redis.call('SET', KEYS[5], lbJson)

-- Build drivers hash (rid -> JSON)
-- We scan all rids in rid map
local ridPairs = redis.call('HGETALL', KEYS[4])
for i=1,#ridPairs,2 do
  local reg = ridPairs[i]; local rid = ridPairs[i+1]
  local st = hgetall_map('default:lua:race:'..ARGV[2]..':driver:'..rid..':state')
  local cat = hgetall_map('default:lua:race:'..ARGV[2]..':driver:'..rid..':catalog')
  local laps = tonumber(st['laps'] or '0')
  local total_ms = tonumber(st['last_total_ms'] or '0')
  local best_ms = tonumber(st['best_ms'] or '0')
  local best_lap = tonumber(st['best_lap'] or '0')
  local pos = tonumber(st['pos'] or '0')
  local j = '{"rid":'..rid..',"reg":"'..(cat['reg'] or reg)..'","number":"'..(cat['number'] or '')..'","name":"'..(cat['first_name'] or '')..' '..(cat['last_name'] or '')..'","class":"'..(cat['class'] or '')..'","laps":'..laps..',"total_ms":'..total_ms..',"best_ms":'..best_ms..',"best_lap":'..best_lap..',"pos":'..pos..'}'
  redis.call('HSET', KEYS[6], rid, j)
end

-- Build session hash
local run = hgetall_map(KEYS[2])
local evt = hgetall_map(KEYS[3])
redis.call('HSET', KEYS[7],
  'epoch', run['epoch'] or '0',
  'run_number', run['run_number'] or '',
  'flag', run['flag'] or '',
  'laps_to_go', run['laps_to_go'] or '0',
  'time_of_day', run['time_of_day'] or '',
  'race_time_ms', run['race_time_ms'] or '0',
  'TRACKNAME', evt['TRACKNAME'] or '',
  'TRACKLENGTH', evt['TRACKLENGTH'] or '',
  'updated_at_ms', run['updated_at_ms'] or '0'
)
return 'OK'
```

---

# 13) **Node** — *Glue*: loader de scripts y **Sync Worker**
`src/luaLoader.ts`
```ts
import fs from "node:fs/promises";
import path from "node:path";
import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");

const cache = new Map<string, string>();

export async function loadLua(p: string): Promise<string> {
  if (cache.has(p)) return cache.get(p)!;
  const code = await fs.readFile(p, "utf8");
  const sha = await redis.script("LOAD", code);
  cache.set(p, sha);
  return sha;
}

export async function evalLua(p: string, keys: string[], argv: string[]) {
  try {
    const sha = await loadLua(p);
    return await redis.evalsha(sha, keys.length, ...keys, ...argv);
  } catch (e: any) {
    if (String(e?.message || e).includes("NOSCRIPT")) {
      cache.delete(p);
      const sha = await loadLua(p);
      return await redis.evalsha(sha, keys.length, ...keys, ...argv);
    }
    throw e;
  }
}
```

`src/syncWorker.ts`
```ts
import { redis, evalLua } from "./luaLoader.js";

const S = process.env.SESSION_KEY!;
const TOPN = String(process.env.HUMAN_TOPN || "20");
const SYNC_LUA = process.env.SYNC_LUA_PATH || "lua/sync_human.lua";

async function syncHuman() {
  const keys = [
    `default:lua:race:${S}:lbrd`,
    `default:lua:race:${S}:run`,
    `default:lua:race:${S}:event`,
    `default:lua:race:${S}:rid`,
    `default:human:leaderboard`,
    `default:human:drivers`,
    `default:human:session`,
  ];
  const argv = [TOPN, S];
  await evalLua(SYNC_LUA, keys, argv);
}

export async function run() {
  const ch = `default:lua:race:${S}:ch:dirty`;
  const sub = new (redis.constructor as any)(process.env.REDIS_URL || "redis://127.0.0.1:6379");
  await sub.subscribe(ch);
  for await (const msg of (async function* () {
    while (true) {
      const m = await new Promise<{channel:string, message:string}>((resolve) => {
        (sub as any).once("message", (channel: string, message: string) => resolve({ channel, message }));
      });
      yield m.message;
    }
  })()) {
    // debounced sync to coalesce bursts if necessary
    await syncHuman();
  }
}

if (import.meta && import.meta.url && process?.argv?.[1]?.endsWith("syncWorker.js")) {
  run().catch(e => { console.error(e); process.exit(1); });
}
```

---

# 14) **Node** — LParser hooks → Lua por tipo
Ejemplo para `$J` (los demás son análogos cambiando KEYS/ARGV).

```ts
// $J handler
import { evalLua } from "./luaLoader.js";
const S = process.env.SESSION_KEY!;
const W = String(process.env.LBRD_W || 1_000_000_000);

export async function onJ(rid: number, lapMs: number, totalMs: number) {
  const base = `default:lua:race:${S}:driver:${rid}`;
  const keys = [
    `${base}:state`,
    `${base}:laps`,
    `${base}:pass_recent`,
    `default:lua:race:${S}:x:pass`,
    `default:lua:race:${S}:ch:pass`,
    `default:lua:race:${S}:lbrd`,
    `${base}:catalog`,
    `default:lua:race:${S}:ch:dirty`,
  ];
  const argv = [String(rid), String(lapMs), String(totalMs), String(Date.now()), `default:lua:race:${S}:class:`, String(W)];
  const LUAP = process.env.J_LUA_PATH || "lua/j_update.lua";
  return await evalLua(LUAP, keys, argv);
}
```

> Implementa funciones `onA`, `onCOMP`, `onB`, `onC`, `onE`, `onF`, `onI`, `onG`, `onH`, `onCOR` mapeando a sus Lua con las KEYS/ARGV correspondientes y publicando en `default:lua:race:{S}:ch:dirty` (ya incluido).

---

## Buenas prácticas clave
- **Atomicidad** por mensaje → una sola EVAL con *todas* las escrituras relacionadas.  
- **Idempotencia** en `$J` usando `last_total_ms`.  
- **Namespacing** estricto con `default:lua:` y `default:human:`.  
- **Trigger desacoplado**: publicar en `:ch:dirty` y hacer **sync** con un *worker* dedicado (evitas duplicar lógica de “mirror” en cada script).  
- **JSON** en `default:human:*` para lectura simple desde overlays sin n+1 lecturas.  
- **Capado** de Streams (`MAXLEN ~`) y listas recientes (`LTRIM`).  
- Todos los tiempos en **ms** (enteros).

---

## Test Plan resumido
1. Inyecta `$A/$COMP` → verifica `default:lua:*:catalog` + **mirroring** en `default:human:drivers` tras trigger.  
2. Inyecta `$J` válidos y duplicados → en válidos sube `laps/score`; duplicados devuelven `"SKIP"`. **Mirror** actualiza leaderboard/driver.  
3. Publica `$F`/`$I` → `default:human:session` se refresca.  
4. Aplica `$G`/`$H`/`$COR` → consistencia del leaderboard y reflejo “human”.  
5. Stress: 1000 `$J`/s → evalúa latencia del *sync worker* (puedes *debouncear* 50–100ms).

---

## Entregables
- `lua/*.lua`: scripts por mensaje + `sync_human.lua`
- `src/*.ts`: `luaLoader.ts`, `syncWorker.ts`, *handlers* por tipo
- **Claves publicadas**:  
  - `default:human:leaderboard` (GET)  
  - `default:human:drivers` (HGETALL / HGET rid)  
  - `default:human:session` (HGETALL)

Copilot: crea estos archivos exactamente como se especifica, respeta los nombres de KEYS y publica siempre en `default:lua:race:{S}:ch:dirty` para disparar la sincronización.
