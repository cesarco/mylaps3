-- KEYS:
-- 1: stateKey   = "{S}:driver:{rid}:state"
-- 2: lapsKey    = "{S}:driver:{rid}:laps"
-- 3: totalKey   = "{S}:driver:{rid}:total_ms"
-- 4: recentKey  = "{S}:driver:{rid}:pass_recent"
-- 5: streamKey  = "{S}:x:pass"
-- 6: pubCh      = "{S}:ch:pass"
-- ARGV:
-- 1: rid        (int as string)
-- 2: lap_ms     (int as string)
-- 3: total_ms   (int as string)
-- 4: now_ms     (int as string)

local last = tonumber(redis.call('HGET', KEYS[1], 'last_total_ms') or '0')
local laps = tonumber(redis.call('HGET', KEYS[1], 'laps') or '0')
local total = tonumber(ARGV[3])

if last > 0 and total <= last then
  return 'SKIP'  -- duplicate or out-of-order
end

local nextlap = laps + 1

redis.call('HSET', KEYS[1],
  'last_total_ms', total,
  'laps', nextlap,
  'updated_at_ms', ARGV[4]
)

-- Per-lap times separated: lap_ms only
redis.call('HSET', KEYS[2], tostring(nextlap), tostring(ARGV[2]))

-- Per-lap total times separated: total_ms only  
redis.call('HSET', KEYS[3], tostring(nextlap), tostring(total))

-- Recent list (last 50)
redis.call('LPUSH', KEYS[4], tostring(nextlap) .. ',' .. tostring(ARGV[2]) .. ',' .. tostring(total))
redis.call('LTRIM', KEYS[4], 0, 49)

-- Global stream (capped)
redis.call('XADD', KEYS[5], 'MAXLEN', '~', '20000', '*',
  'rid', ARGV[1], 'lap', nextlap, 'lap_ms', ARGV[2], 'total_ms', total, 'ts_ms', ARGV[4]
)

-- Notify listeners
local payload = '{"rid":'..ARGV[1]..',"lap":'..nextlap..',"lap_ms":'..ARGV[2]..',"total_ms":'..total..'}'
redis.call('PUBLISH', KEYS[6], payload)

return tostring(nextlap)
