# Centralización de Claves Redis

Este documento detalla las tareas necesarias para centralizar y estandarizar todas las claves Redis utilizadas en el middleware.

## Motivación

Actualmente, la estructura de claves está dispersa en varios archivos, lo que dificulta su mantenimiento y consistencia. Necesitamos centralizar estas definiciones para:

- Facilitar el mantenimiento
- Garantizar consistencia
- Permitir cambios en la estructura de claves sin afectar múltiples archivos
- Mejorar la legibilidad del código

## Tareas

### 1. Crear el Generador de Claves Centralizado

- [ ] Crear un nuevo archivo `src/utils/RedisKeyGenerator.js`
- [ ] Definir la clase principal con constructor que acepte un prefijo
- [ ] Implementar métodos para todas las claves existentes:
  - [ ] `session()` → "{prefix}:session"
  - [ ] `driverCatalog(rid)` → "{prefix}:driver:catalog:{rid}"
  - [ ] `driverState(rid)` → "{prefix}:driver:state:{rid}"
  - [ ] `ridMapping()` → "{prefix}:driver:rid:mapping"
  - [ ] `leaderboardRanking()` → "{prefix}:leaderboard:ranking"
  - [ ] `leaderboardDriver(position)` → "{prefix}:leaderboard:driver:{position}"
  - [ ] `leaderboardClass(classId)` → "{prefix}:leaderboard:class:{classId}"
  - [ ] `lapsHistory(driverId)` → "{prefix}:laps:history:{driverId}"
  - [ ] `bestLap(driverId)` → "{prefix}:laps:best:{driverId}"
  - [ ] `lastLap(driverId)` → "{prefix}:laps:last:{driverId}"
  - [ ] `passingsStream()` → "{prefix}:stream:passings"
  - [ ] `flagsChannel()` → "{prefix}:channel:flags"
- [ ] Agregar documentación JSDoc para cada método

### 2. Actualizar ServiceRegistry

- [ ] Modificar `src/utils/ServiceRegistry.js` para usar el nuevo generador
- [ ] Inicializar una instancia de `RedisKeyGenerator` con el sessionKey
- [ ] Pasar este generador a todos los servicios relevantes
- [ ] Eliminar dependencia del viejo KeyGenerator en los servicios

### 3. Actualizar los Servicios

#### 3.1 SessionService
- [ ] Modificar el constructor para aceptar el generador de claves
- [ ] Reemplazar todas las referencias directas a claves por llamadas al generador
- [ ] Actualizar todos los métodos para usar `keyGen.session()` en lugar de strings hardcoded
- [ ] Verificar que los logs muestren las claves correctas

#### 3.2 DriverService
- [ ] Actualizar para usar `keyGen.driverCatalog(rid)` y `keyGen.driverState(rid)`
- [ ] Reemplazar código de generación de claves por llamadas al generador
- [ ] Actualizar método `updateDriverCentralized` para usar las nuevas claves

#### 3.3 LeaderboardService
- [ ] Actualizar para usar `keyGen.leaderboardRanking()`
- [ ] Refactorizar métodos para usar el generador de claves
- [ ] Verificar compatibilidad con el formato de leaderboard

#### 3.4 Otros Servicios
- [ ] RidService: actualizar para usar `keyGen.ridMapping()`
- [ ] LapService: usar `keyGen.lapsHistory()` y `keyGen.bestLap()`
- [ ] PassingsService: actualizar para usar `keyGen.passingsStream()`
- [ ] FlagService: usar `keyGen.flagsChannel()`

### 4. Actualizar los Parsers

- [ ] Verificar que todos los parsers usen servicios con claves estandarizadas
- [ ] Actualizar cualquier parser que utilice claves directamente

### 5. Pruebas y Validación

- [ ] Ejecutar el middleware y verificar funcionamiento con la nueva estructura de claves
- [ ] Comprobar el almacenamiento correcto de:
  - [ ] Flags y datos de sesión en `{prefix}:session`
  - [ ] Datos de pilotos en `{prefix}:driver:catalog:{rid}`
  - [ ] Posiciones en el leaderboard
  - [ ] Vueltas y mejores tiempos
- [ ] Verificar que la migración de datos funcione correctamente

### 6. Limpieza y Documentación

- [ ] Eliminar código duplicado de generación de claves
- [ ] Actualizar o eliminar el antiguo KeyGenerator.js según sea necesario
- [ ] Documentar la nueva estructura de claves Redis
- [ ] Actualizar REFACTORING_PLAN.md para reflejar este cambio

## Notas adicionales

- La sesión actual usa "default" como prefijo
- Mantener compatibilidad con la estructura legacy si es necesario
- Considerar implementar una función de migración para claves existentes

---

## Estructura propuesta de claves Redis

```
{prefix}:session                     → Datos generales de la sesión (flags, run, event)
{prefix}:driver:catalog:{rid}        → Datos fijos de piloto (nombre, número, etc.)
{prefix}:driver:state:{rid}          → Estado actual del piloto (vueltas, tiempos, etc.)
{prefix}:driver:rid:mapping          → Mapeo registration → rid
{prefix}:leaderboard:ranking         → Ranking del leaderboard (ZSET)
{prefix}:leaderboard:driver:{pos}    → Datos de piloto en posición específica
{prefix}:leaderboard:class:{classId} → Ranking por clase
{prefix}:laps:history:{driverId}     → Historial de vueltas de un piloto
{prefix}:laps:best:{driverId}        → Mejor vuelta de un piloto
{prefix}:laps:last:{driverId}        → Última vuelta de un piloto
{prefix}:stream:passings             → Stream de passings
{prefix}:channel:flags               → Canal para notificaciones de banderas
```

## Referencias

- [Redis Best Practices](https://redis.io/docs/manual/patterns/naming-keys/)
- [Redis Data Types](https://redis.io/docs/data-types/)
