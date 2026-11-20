# 🟪 SHARED - Redis Architecture Design

## 🔴 REDIS STREAMS ARCHITECTURE

### 1. **STREAM STRUCTURE DEFINITION**

#### Primary Streams
```
mylaps:raw          # Python → Redis (datos crudos UDP)
mylaps:processed    # Node.js → Redis (datos procesados)
mylaps:events       # Node.js → API (eventos en tiempo real)
```

#### Key Structure Standard
```
{session_id}:drivers:{driver_id}        # Datos de piloto
{session_id}:laps:{driver_id}          # Vueltas del piloto
{session_id}:leaderboard               # Clasificación actual
{session_id}:session:info              # Metadatos de sesión
{session_id}:timing:current            # Timing en tiempo real
{session_id}:flags:status              # Estado de banderas
```

### 2. **MESSAGE SCHEMAS**

#### Raw Data Stream (Python → Redis)
```json
{
  "raw_data": "línea UDP cruda",
  "timestamp": 1694234567.123,
  "source_ip": "192.168.1.100",
  "datagram_id": "uuid-v4",
  "session_id": "default",
  "metadata": {
    "line_number": 1,
    "total_lines": 3,
    "checksum": "hash"
  }
}
```

#### Processed Data Stream (Node.js → API)
```json
{
  "message_type": "LAP_TIME",
  "session_id": "default", 
  "timestamp": 1694234567.123,
  "data": {
    "driver_id": "123",
    "lap_number": 15,
    "lap_time_ms": 87432,
    "sector_times": [28123, 31456, 27853]
  },
  "processing_info": {
    "processed_at": 1694234567.456,
    "parser_version": "v4.1.2",
    "validation_status": "valid"
  }
}
```

---

## 🔴 REDIS CONFIGURATION

### 3. **MEMORY MANAGEMENT**
```redis
# Configuration for high-throughput race timing
maxmemory 2gb
maxmemory-policy allkeys-lru
stream-node-max-bytes 4096
stream-node-max-entries 100

# TTL Policies
expire mylaps:raw:* 3600          # 1 hour for raw data
expire mylaps:processed:* 86400   # 24 hours for processed
expire {session}:* 604800         # 1 week for session data
```

### 4. **PERFORMANCE OPTIMIZATION**
```redis
# Stream optimization
xadd mylaps:raw * field value MAXLEN ~ 100000
xgroup CREATE mylaps:raw nodejs_processors $ MKSTREAM

# Connection optimization
tcp-keepalive 300
timeout 0
tcp-backlog 511
```

---

## 🔴 INTEGRATION PATTERNS

### 5. **PYTHON PRODUCER PATTERN**
```python
import redis
import time
import uuid

class MylapsProducer:
    def __init__(self, redis_client):
        self.redis = redis_client
        
    async def send_raw_data(self, udp_line, source_ip, session_id="default"):
        message = {
            'raw_data': udp_line,
            'timestamp': time.time(),
            'source_ip': source_ip,
            'datagram_id': str(uuid.uuid4()),
            'session_id': session_id
        }
        
        # Send to stream with memory management
        await self.redis.xadd(
            'mylaps:raw',
            message,
            maxlen=100000,
            approximate=True
        )
```

### 6. **NODE.JS CONSUMER PATTERN**
```javascript
class MylapsConsumer {
    constructor(redisClient) {
        this.redis = redisClient;
    }
    
    async consumeRawData() {
        const result = await this.redis.xreadgroup(
            'GROUP', 'nodejs_processors',
            'CONSUMER', 'processor_1',
            'COUNT', 10,
            'BLOCK', 1000,
            'STREAMS', 'mylaps:raw', '>'
        );
        
        for (const [stream, messages] of result) {
            for (const [messageId, fields] of messages) {
                await this.processMessage(messageId, fields);
                await this.redis.xack('mylaps:raw', 'nodejs_processors', messageId);
            }
        }
    }
}
```

---

## 🔴 MONITORING & HEALTH

### 7. **REDIS MONITORING METRICS**
```bash
# Critical metrics to monitor
INFO memory
INFO replication  
INFO persistence
INFO stats
INFO commandstats

# Stream-specific monitoring
XINFO STREAM mylaps:raw
XINFO GROUPS mylaps:raw
XPENDING mylaps:raw nodejs_processors
```

### 8. **HEALTH CHECK ENDPOINTS**
```javascript
// Node.js health check
app.get('/health/redis', async (req, res) => {
    try {
        await redis.ping();
        const streamInfo = await redis.xinfoStream('mylaps:raw');
        res.json({
            status: 'healthy',
            stream_length: streamInfo.length,
            last_generated_id: streamInfo.lastGeneratedId
        });
    } catch (error) {
        res.status(500).json({ status: 'unhealthy', error: error.message });
    }
});
```

---

## 🔴 DISASTER RECOVERY

### 9. **BACKUP STRATEGIES**
```bash
# Automated Redis backup
redis-cli --rdb /backup/redis-$(date +%Y%m%d-%H%M%S).rdb

# Stream data export
redis-cli XRANGE mylaps:raw - + > /backup/raw-data-$(date +%Y%m%d).txt

# Configuration backup
cp /etc/redis/redis.conf /backup/redis-config-$(date +%Y%m%d).conf
```

### 10. **FAILOVER PROCEDURES**
```yaml
# Redis Sentinel configuration for HA
sentinel monitor mylaps-master 127.0.0.1 6379 2
sentinel down-after-milliseconds mylaps-master 30000
sentinel parallel-syncs mylaps-master 1
sentinel failover-timeout mylaps-master 180000
```

---

## 🎯 IMPLEMENTATION CHECKLIST

### Phase 1: Basic Architecture (Week 1)
- [ ] Configure Redis streams structure
- [ ] Implement basic producer/consumer pattern
- [ ] Setup TTL policies
- [ ] Create monitoring basics

### Phase 2: Optimization (Week 2)  
- [ ] Implement memory optimization
- [ ] Configure performance settings
- [ ] Setup health checking
- [ ] Implement error handling

### Phase 3: Production Ready (Week 3)
- [ ] Configure backup procedures
- [ ] Setup disaster recovery
- [ ] Implement security measures
- [ ] Create monitoring dashboards

### Phase 4: High Availability (Week 4)
- [ ] Configure Redis clustering
- [ ] Setup failover mechanisms
- [ ] Implement load balancing
- [ ] Create automated recovery

---

**📝 Status**: 
- 🔄 **En Progreso**: Architecture design
- ⏳ **Pendiente**: Implementation coordination
- 🎯 **Next**: Phase 1 implementation con ambos equipos

**⚠️ CRÍTICO**: Esta arquitectura debe implementarse coordinadamente entre equipos Python y Node.js para evitar incompatibilidades.
