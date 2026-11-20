# RMonitor Protocol Parsers Architecture

## Overview

Esta carpeta contiene los parsers especializados para el protocolo RMonitor oficial de Orbits. La arquitectura está diseñada para ser modular, mantenible y extensible, basada en la documentación oficial del protocolo.

## Arquitectura

```
src/parsers/
├── BaseParser.js          # Clase base con utilidades comunes
├── CompetitorParser.js    # Parser para información de competidores ($A, $COMP)
├── TimingParser.js        # Parser para datos de timing ($G, $H, $J)
├── SessionParser.js       # Parser para control de sesión ($B, $C, $E, $F, $I)
├── CorrectionParser.js    # Parser para correcciones y datos especiales ($COR, $L, $T)
└── README.md             # Este archivo
```

## Tipos de Mensaje RMonitor

### 📋 Competitor Messages (CompetitorParser)
- **$A** - Driver registration: Registro básico de piloto con transponder
- **$COMP** - Competitor info extended: Información extendida del competidor

### ⏱️ Timing Messages (TimingParser)
- **$G** - Race position/times: Posiciones y tiempos de carrera
- **$H** - Practice/Qualy best lap: Mejores vueltas en práctica/clasificación
- **$J** - **PASSING** ⭐ **EVENTOS DE VUELTA INDIVIDUALES** ⭐

### 🏁 Session Messages (SessionParser)
- **$B** - Run/Session info: Información de la sesión actual
- **$C** - Class definition: Definición de categorías
- **$E** - Event metadata/settings: Metadatos y configuración del evento
- **$F** - Heartbeat/Flag status: Estado de banderas y latido del sistema
- **$I** - Init/Resync: Inicialización y resincronización del sistema

### 🔧 Correction Messages (CorrectionParser)
- **$COR** - Time corrections: Correcciones de tiempo
- **$L** - Line crossing (IMSA): Cruces de línea especiales IMSA
- **$T** - Track description (IMSA): Descripción del circuito IMSA

## BaseParser

Todas las clases heredan de `BaseParser` que proporciona:

```javascript
// Utilidades comunes
cleanString(str)           // Limpia comillas y espacios
safeParseInt(str)         // Parsing seguro a entero
validateFieldCount(parts, min, type)  // Validación de campos

// Cada parser implementa:
parse(parts, rawData)     // Método principal de parsing
getMessageTypes()         // Tipos de mensaje soportados
```

## Uso

### Con RMonitorParser principal:

```javascript
const RMonitorParser = require('../utils/RMonitorParser');

const parser = new RMonitorParser(logger);
const result = parser.parseMessage('$J,"12345","1:23.456","12:34.567"');

// Resultado:
// {
//   type: "PASSING",
//   messageType: "$J",
//   registration: "12345",
//   lap_time: "1:23.456",
//   lap_time_ms: 83456,
//   total_time: "12:34.567",
//   race_time_ms: 754567,
//   timestamp: "2024-01-15T10:30:00.000Z"
// }
```

### Uso directo de parsers especializados:

```javascript
const TimingParser = require('./TimingParser');

const timingParser = new TimingParser(logger);
const parts = ['$J', '12345', '1:23.456', '12:34.567'];
const result = timingParser.parse(parts, rawData);
```

## Estrategia Redis

Cada tipo de mensaje se almacena en Redis de manera específica:

### Competitor Data ($A, $COMP)
```redis
# Hash por piloto
drivers:{registration} -> {transponder_id, first_name, last_name, ...}
drivers:by_transponder:{transponder_id} -> registration
```

### Timing Data ($G, $H, $J)
```redis
# Posiciones actuales
race:positions -> sorted set por position
race:drivers:{registration}:current -> current position data

# Vueltas individuales (¡$J PASSING!)
race:drivers:{registration}:laps -> list de vueltas
race:lap_events -> stream de eventos por vuelta
```

### Session Data ($B, $C, $E, $F, $I)
```redis
# Metadatos de sesión
session:current -> session info
session:classes -> hash de categorías
session:flags -> current flag status
```

### Corrections ($COR, $L, $T)
```redis
# Correcciones y eventos especiales
corrections -> list de correcciones
track:description -> track layout info
imsa:line_crossings -> special IMSA events
```

## Debugging

Para debugging, cada parser registra:

```javascript
✅ [RMONITOR] Parsed $J: PASSING
⚠️ [RMONITOR] Failed to parse $G: invalid field count
❓ [RMONITOR] Unknown message type: $UNKNOWN
```

## Integración con MessageProcessor

El `MessageProcessor` enruta automáticamente cada tipo parseado:

```javascript
// En MessageProcessor.js
case 'PASSING':
  await this.passingProcessor.processPassingData(data);  // ¡$J LAPS!
  break;
  
case 'DRIVER_REG':
  await this.competitorProcessor.processCompetitorInfo(data);  // $A
  break;
  
case 'POSITION_DATA':
  await this.positionProcessor.processPositionData(data);  // $G
  break;
```

## Ventajas de esta Arquitectura

1. **Modular**: Cada tipo de mensaje tiene su parser dedicado
2. **Extensible**: Fácil agregar nuevos tipos de mensaje
3. **Mantenible**: Lógica separada por responsabilidad
4. **Testeable**: Cada parser se puede probar independientemente
5. **Documentado**: Basado en documentación oficial RMonitor
6. **Compatible**: Mantiene compatibilidad con parser legacy

## Notas Importantes

- **$J PASSING** son los eventos de vuelta individuales reales
- **$H** son clasificaciones/mejores vueltas, no vueltas individuales
- Todos los tiempos se convierten automáticamente a milisegundos
- La validación de campos previene errores de parsing
- El logging facilita el debugging del protocolo

## Testing

Para probar los parsers:

```bash
# En el directorio nodemiddleware
npm test parsers

# O manualmente:
node -e "
const TimingParser = require('./src/parsers/TimingParser');
const parser = new TimingParser(console);
console.log(parser.parse(['$J', '12345', '1:23.456', '12:34.567']));
"
```
