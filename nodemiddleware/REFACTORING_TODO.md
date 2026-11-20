# Tareas Pendientes de Refactorización

## Notificaciones NodeCG

**Prioridad: Alta**

Las notificaciones individuales de NodeCG en los servicios (`notifyNodeCG`) deben eliminarse, ya que ahora implementamos un sistema centralizado de notificaciones en `RedisService` que automáticamente publica eventos en los canales de NodeCG cuando hay cambios en Redis.

### Archivos que contienen estos métodos y deben refactorizarse:
- `src/services/NewLeaderboardService.js`
- `src/services/MessageProcessor.js`
- `src/services/LapService.js`
- `src/services/DriverService.js`

### Cambios necesarios:
1. Eliminar los métodos `notifyNodeCG` de cada servicio
2. Eliminar las llamadas a estos métodos dentro de los servicios
3. Confiar en el sistema automático implementado en `RedisService` mediante el proxy

### Beneficios:
- Reducción de código duplicado
- Evita múltiples notificaciones para una misma operación
- Mejora el rendimiento al reducir el número de operaciones de publicación en Redis
- Simplifica el mantenimiento del código

## Limpieza de Redis

**Prioridad: Alta**

Se ha implementado un nuevo sistema de limpieza segura en `DataSimulator.js` que preserva el consumer group. Es necesario eliminar el antiguo método `clearRedisData` y asegurarse de que todas las referencias utilicen `clearRedisDataSafely`.

### Archivos afectados:
- `src/utils/DataSimulator.js`
- `src/MylapsMiddleware.js` (para actualizar referencias)

### Cambios necesarios:
1. Eliminar completamente el método `clearRedisData`
2. Reemplazar todas las llamadas a `clearRedisData` por `clearRedisDataSafely`
3. Actualizar comentarios y documentación

### Beneficios:
- Prevenir la pérdida de configuración del consumer group
- Mayor robustez en entornos de producción
- Evitar errores de reconexión después de reiniciar el simulador

## Sincronización de ServiceRegistry

**Prioridad: Media**

Asegurarse de que todos los componentes del sistema utilicen la misma instancia de `ServiceRegistry` para evitar problemas de sincronización de estado.

### Archivos afectados:
- `src/MylapsMiddleware.js`
- `src/services/MessageProcessor.js`
- Todos los servicios que utilizan ServiceRegistry

### Cambios necesarios:
1. Revisar y documentar el flujo de inicialización de ServiceRegistry
2. Asegurarse de que la instancia se pasa correctamente a todos los componentes
3. Implementar validaciones de seguridad para evitar instancias duplicadas

### Beneficios:
- Evitar problemas de sincronización de estado
- Mejorar la consistencia de los datos
- Facilitar el debugging y seguimiento del flujo de datos
