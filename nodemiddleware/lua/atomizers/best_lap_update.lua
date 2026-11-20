--[[
  Script Lua para BestLapAtomizer
  Maneja la lógica atómica de actualización de mejores vueltas
  
  KEYS[1] = race:{S}:driver:{rid}:state (nuevo)
  KEYS[2] = race:{S}:best (nuevo standings)
  KEYS[3] = {S}:driver:{rid}:state (legacy)
  KEYS[4] = {S}:best (legacy standings)
  
  ARGV[1] = rid
  ARGV[2] = driver_number
  ARGV[3] = best_lap_time_ms
  ARGV[4] = lap_number
  ARGV[5] = timestamp_iso
--]]

local new_state_key = KEYS[1]
local new_best_key = KEYS[2]
local legacy_state_key = KEYS[3]
local legacy_best_key = KEYS[4]

local rid = ARGV[1]
local driver_number = ARGV[2]
local best_lap_time_ms = tonumber(ARGV[3])
local lap_number = tonumber(ARGV[4])
local timestamp_iso = ARGV[5]

-- Validar tiempo
if not best_lap_time_ms or best_lap_time_ms <= 0 then
    return {
        success = false,
        error = "invalid_best_time",
        best_time = best_lap_time_ms
    }
end

-- Obtener estado actual
local current_state = redis.call('HGETALL', new_state_key)
local state_data = {}
for i = 1, #current_state, 2 do
    state_data[current_state[i]] = current_state[i + 1]
end

local current_best_ms = tonumber(state_data.best_ms) or 0
local should_update_best = false

-- Verificar si es un nuevo mejor tiempo
if current_best_ms == 0 or best_lap_time_ms < current_best_ms then
    should_update_best = true
end

-- === ACTUALIZAR SOLO SI ES MEJOR TIEMPO ===
if should_update_best then
    
    -- Actualizar standings de mejor vuelta en ambas estructuras
    redis.call('ZADD', new_best_key, best_lap_time_ms, rid)
    redis.call('ZADD', legacy_best_key, best_lap_time_ms, rid)
    
    -- Preparar datos del estado a actualizar
    local state_update = {
        "best_ms", tostring(best_lap_time_ms),
        "best_lap", tostring(lap_number),
        "updated_at_ms", tostring(redis.call('TIME')[1] * 1000),
        "updated_at_iso", timestamp_iso
    }
    
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
    
    return {
        success = true,
        updated = true,
        rid = rid,
        new_best_ms = best_lap_time_ms,
        previous_best_ms = current_best_ms,
        lap_number = lap_number,
        operations_completed = {
            "best_standings_updated_new",
            "best_standings_updated_legacy",
            "state_updated_new",
            "state_updated_legacy"
        }
    }
else
    return {
        success = true,
        updated = false,
        rid = rid,
        current_best_ms = current_best_ms,
        message_time_ms = best_lap_time_ms,
        reason = "not_better_than_current"
    }
end
