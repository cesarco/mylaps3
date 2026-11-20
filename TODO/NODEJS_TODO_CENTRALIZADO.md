# Node.js TODOs - MyLaps MVP2

**Actualizado:** 9 de septiembre de 2025

## TODOs Críticos

- [ ] Implementar detección de formato en DataNormalizer
- [ ] Agregar flag `isPreparsed` en estructura de mensaje
- [ ] Crear método `detectMessageFormat()` en utils
- [ ] Implementar `DriverOverrideService` para sobrescrituras persistentes
- [ ] Crear API REST para cambiar nombres/datos de pilotos
- [ ] Integrar overrides con AParser y COMPParser
- [ ] Prioridad de datos: Override > $COMP > $A > Default
- [ ] Crear tests de integración completos para middleware Node.js
- [ ] Configurar pipeline de testing automatizado con Jest/Mocha
- [ ] Implementar generadores de datos de test para diferentes escenarios de carrera
- [ ] Crear datos mock de MYLAPS para testing de desarrollo
- [ ] Agregar unit tests para todas las clases parser y atomizer
- [ ] Implementar tests de benchmarking de performance
## TODOs Alta Prioridad

- [ ] Crear tests de validación de datos
- [ ] Configurar coverage reporting
- [ ] Implementar endpoint `/api/leaderboard` con filtering
- [ ] Crear endpoint `/api/drivers` con CRUD operations
- [ ] Implementar endpoint `/api/session` para gestión de sesiones
- [ ] Agregar endpoints para `/api/laps` y `/api/timing`
- [ ] Implementar WebSocket server para updates en tiempo real
- [ ] Configurar canales para leaderboard, lap times, flags
- [ ] Implementar autenticación en WebSocket connections
- [ ] Crear middleware de logging detallado
- [ ] Implementar error handling globalizado
- [ ] Agregar request/response logging
- [ ] Crear debug mode configurable
- [ ] Implementar rate limiting por IP
- [ ] Crear middleware de validación de input
- [ ] Implementar CORS configuration
- [ ] Agregar helmet.js para security headers
- [ ] Crear middleware de autenticación JWT
- [ ] Implementar validación de configuración al startup
- [ ] Crear configuraciones específicas por entorno (dev/staging/prod)
- [ ] Documentar todas las variables de configuración
- [ ] Optimizar Dockerfile para Node.js middleware
- [ ] Configurar multi-stage builds para optimización
- [ ] Implementar health checks en containers
- [ ] Crear docker-compose para desarrollo local

## TODOs Prioridad Media

- [ ] Implementar filtering avanzado en `/api/leaderboard`
- [ ] Crear endpoints para análisis histórico
- [ ] Implementar pagination para grandes datasets
- [ ] Agregar export de datos (CSV, JSON, XML)
- [ ] Optimizar WebSocket performance para múltiples clientes
- [ ] Implementar rate limiting para WebSocket connections
- [ ] Crear sistema de subscripciones granulares
- [ ] Implementar compression para mensajes WebSocket
- [ ] Implementar Redis caching para queries frecuentes
- [ ] Crear cache invalidation strategies
- [ ] Optimizar leaderboard caching
- [ ] Implementar CDN-ready endpoints
- [ ] Optimizar garbage collection en Node.js
- [ ] Implementar memory leak detection
- [ ] Crear memory usage monitoring
- [ ] Optimizar object pooling para alta frecuencia
- [ ] Crear interface web para administración
- [ ] Implementar gestión de sesiones vía UI
- [ ] Crear debugging tools avanzados

## TODOs Completados

- [x] Nueva Arquitectura V4 - Parsers con interfaces consistentes
- [x] ParserRegistry centralizado con método `parseMessage()`
- [x] BaseParser con interfaz estándar implementada
- [x] Eliminación de ProcessorFactory (incompatible con V4)
- [x] Eliminación de RMonitorCoordinator (capa innecesaria)
- [x] Migración de lógica de Processors a Services especializados
- [x] Implementación de arquitectura dual Parser + Atomizer
- [x] Implementar organización de keys por sesión con TTL management
- [x] Configurar leaderboard con sorted sets para tracking en tiempo real
- [x] Crear estructura de sesión Redis con gestión de estado de drivers
- [x] Implementar políticas de expiración de datos Redis
- [x] Optimizar uso de memoria Redis con compresión de datos
- [x] Implementar connection pooling para escenarios de alta carga
- [x] Configurar Redis clustering si es necesario
- [x] Implementar monitoring de memoria Redis
- [x] Refactorizar modelo Driver con validación y métodos apropiados
- [x] Implementar modelo Session con gestión de estado
- [x] Crear modelo Lap con cálculos de timing
- [x] Implementar validación de datos en todos los modelos
- [x] Optimizar LapService para cálculos de tiempo de vuelta
- [x] Mejorar DriverService para gestión de estado de pilotos
- [x] Optimizar LeaderboardService para actualizaciones en tiempo real
- [x] Implementar caching en servicios críticos

## TODOs Adicionales (Prioridad Baja)

- [ ] Implementar configuración dinámica vía UI
- [ ] Implementar analytics básicos de performance
- [ ] Crear reportes automáticos de sesiones
- [ ] Implementar trending analysis
- [ ] Crear data export scheduling
- [ ] Crear testing utilities para developers
- [ ] Implementar snapshot testing para outputs
- [ ] Crear performance regression testing
- [ ] Implementar automated testing en CI/CD
- [ ] Crear developer documentation completa
