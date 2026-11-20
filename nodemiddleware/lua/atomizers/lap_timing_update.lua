--[[
  Script Lua para LapTimingAtomizer
  Maneja la lógica atómica de actualización de vueltas con validaciones
  
  KEYS[1] = race:{S}:driver:{rid}:state (nuevo)
  KEYS[2] = race:{S}:driver:{rid}:laps (nuevo)
  KEYS[3] = {S}:driver:{rid}:state (legacy)
  KEYS[4] = {S}:driver:{rid}:laps (legacy)
  KEYS[5] = race:{S}:x:pass (stream nuevo)
  KEYS[6] = {S}:x:pass (stream legacy)
  
  ARGV[1] = rid
  ARGV[2] = registration
  ARGV[3] = lap_time (string original)
  ARGV[4] = lap_ms (milisegundos de la vuelta)
  ARGV[5] = total_time (string original)
  ARGV[6] = total_ms (milisegundos acumulados DESDE EL MENSAJE)
  ARGV[7] = rtc_time
  ARGV[8] = timestamp_iso
--]]

local new_state_key = KEYS[1]
local new_laps_key = KEYS[2]
local legacy_state_key = KEYS[3]
local legacy_laps_key = KEYS[4]
local new_stream_key = KEYS[5]
local legacy_stream_key = KEYS[6]

local rid = ARGV[1]
local registration = ARGV[2]
local lap_time = ARGV[3]
local lap_ms = tonumber(ARGV[4]) or 0
local total_time = ARGV[5]
local total_ms = tonumber(ARGV[6]) or 0  -- Este viene directamente del mensaje
local rtc_time = ARGV[7]
local timestamp_iso = ARGV[8]

-- Obtener estado actual (de la estructura nueva)
local current_state = redis.call('HGETALL', new_state_key)
local state_data = {}
for i = 1, #current_state, 2 do
    state_data[current_state[i]] = current_state[i + 1]
end

-- Validaciones y cálculos
local current_laps = tonumber(state_data.laps) or 0
local current_total_ms = tonumber(state_data.total_time) or 0

-- Validar que el total_ms del mensaje sea mayor al actual (anti-duplicados)
if total_ms <= current_total_ms and current_total_ms > 0 then
    return {
        "false", -- success
        "total_time_not_greater", -- error
        tostring(current_total_ms), -- current_total
        tostring(total_ms) -- message_total
    }
end

-- Calcular nuevo número de vuelta
local new_lap_number = current_laps + 1

-- === ACTUALIZAR ESTADO EN AMBAS ESTRUCTURAS ===

-- Datos para el estado
local state_update = {
    "laps", tostring(new_lap_number),
    "last_lap_time", tostring(lap_ms),
    "total_time", tostring(total_ms),  -- Usar el valor que viene del mensaje
    "last_total_ms", tostring(total_ms),
    "updated_at_ms", tostring(redis.call('TIME')[1] * 1000),
    "updated_at_iso", timestamp_iso
}

-- Si es la primera vuelta, también actualizar algunos campos base
if current_laps == 0 then
    table.insert(state_update, "registration")
    table.insert(state_update, registration)
    table.insert(state_update, "driverid")
    table.insert(state_update, registration)
end

-- Actualizar estado en estructura nueva
redis.call('HSET', new_state_key, unpack(state_update))

-- Actualizar estado en estructura legacy
redis.call('HSET', legacy_state_key, unpack(state_update))

-- === AGREGAR VUELTA HISTÓRICA EN AMBAS ESTRUCTURAS ===

local lap_data = {
    lap_number = new_lap_number,
    registration = registration,
    lap_time = lap_time,
    lap_ms = lap_ms,
    total_time = total_time,
    total_ms = total_ms,
    rtc_time = rtc_time,
    timestamp = timestamp_iso
}

-- Serializar datos de la vuelta  
local lap_json = '{"lap_number":' .. new_lap_number .. ',"registration":"' .. registration .. 
                 '","lap_time":"' .. lap_time .. '","lap_ms":' .. lap_ms .. 
                 ',"total_time":"' .. total_time .. '","total_ms":' .. total_ms .. 
                 ',"rtc_time":"' .. rtc_time .. '","timestamp":"' .. timestamp_iso .. '"}'

-- Agregar a estructura nueva
redis.call('HSET', new_laps_key, tostring(new_lap_number), lap_json)

-- Agregar a estructura legacy
redis.call('HSET', legacy_laps_key, tostring(new_lap_number), lap_json)

-- === AGREGAR A STREAMS EN AMBAS ESTRUCTURAS ===

-- Datos para el stream
local stream_data = {
    "rid", rid,
    "registration", registration,
    "lap_time", lap_time,
    "total_time", total_time,
    "rtc_time", rtc_time,
    "timestamp", timestamp_iso
}

-- Agregar a stream nuevo
redis.call('XADD', new_stream_key, '*', unpack(stream_data))

-- Agregar a stream legacy
redis.call('XADD', legacy_stream_key, '*', unpack(stream_data))

-- Retornar resultado exitoso
return {
    "true", -- success
    tostring(new_lap_number), -- lap_number
    tostring(total_ms), -- total_ms
    tostring(lap_ms), -- lap_ms
    tostring(current_total_ms), -- previous_total
    "state_updated_new", -- operations_completed[1]
    "state_updated_legacy", -- operations_completed[2]
    "lap_history_added_new", -- operations_completed[3]
    "lap_history_added_legacy", -- operations_completed[4]
    "stream_added_new", -- operations_completed[5]
    "stream_added_legacy" -- operations_completed[6]
}
