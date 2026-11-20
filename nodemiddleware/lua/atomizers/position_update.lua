--[[
  Script Lua para PositionAtomizer
  Maneja la lógica atómica de actualización de posiciones
  
  KEYS[1] = race:{S}:driver:{rid}:state (nuevo)
  KEYS[2] = race:{S}:pos (nuevo standings)
  KEYS[3] = {S}:driver:{rid}:state (legacy)
  KEYS[4] = {S}:pos (legacy standings)
  
  ARGV[1] = rid
  ARGV[2] = driver_number
  ARGV[3] = position
  ARGV[4] = laps_completed (opcional)
  ARGV[5] = total_time_ms (opcional)
  ARGV[6] = timestamp_iso
--]]

local new_state_key = KEYS[1]
local new_pos_key = KEYS[2]
local legacy_state_key = KEYS[3]
local legacy_pos_key = KEYS[4]

local rid = ARGV[1]
local driver_number = ARGV[2]
local position = tonumber(ARGV[3])
local laps_completed = tonumber(ARGV[4]) or nil
local total_time_ms = tonumber(ARGV[5]) or nil
local timestamp_iso = ARGV[6]

-- Validar posición
if not position or position <= 0 then
    return {
        "false",  -- success
        "invalid_position",  -- error
        position and tostring(position) or "nil"  -- position
    }
end

-- Obtener estado actual para preservar datos existentes
local current_state = redis.call('HGETALL', new_state_key)
local state_data = {}
for i = 1, #current_state, 2 do
    state_data[current_state[i]] = current_state[i + 1]
end

-- === ACTUALIZAR POSICIONES EN STANDINGS ===

-- Verificar si ya existe una posición para este RID
local current_position = redis.call('ZSCORE', new_pos_key, rid)
if current_position and tonumber(current_position) == position then
    -- Misma posición, no hacer nada en standings
else
    -- Actualizar posición en ambas estructuras
    redis.call('ZADD', new_pos_key, position, rid)
    redis.call('ZADD', legacy_pos_key, position, rid)
end

-- === ACTUALIZAR ESTADO DEL DRIVER ===

-- Preparar datos del estado a actualizar
local state_update = {
    "position", tostring(position),
    "updated_at_ms", tostring(redis.call('TIME')[1] * 1000),
    "updated_at_iso", timestamp_iso
}

-- Agregar datos opcionales si vienen en el mensaje
if laps_completed then
    table.insert(state_update, "laps")
    table.insert(state_update, tostring(laps_completed))
end

if total_time_ms then
    table.insert(state_update, "total_time")
    table.insert(state_update, tostring(total_time_ms))
end

-- Asegurar que hay datos básicos del driver
if not state_data.registration then
    table.insert(state_update, "registration")
    table.insert(state_update, driver_number)
    table.insert(state_update, "driverid")
    table.insert(state_update, driver_number)
end

-- Actualizar estado en ambas estructuras
redis.call('HSET', new_state_key, unpack(state_update))
redis.call('HSET', legacy_state_key, unpack(state_update))

-- Retornar resultado exitoso como array para compatibilidad con Redis
return {
    "true",  -- success
    rid,     -- rid
    tostring(position), -- position
    current_position and tostring(current_position) or "", -- previous_position
    laps_completed and tostring(laps_completed) or "", -- laps_completed
    total_time_ms and tostring(total_time_ms) or "", -- total_time_ms
    "position_updated_new", "position_updated_legacy", "state_updated_new", "state_updated_legacy" -- operations
}
