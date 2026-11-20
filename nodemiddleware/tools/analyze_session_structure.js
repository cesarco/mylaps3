/**
 * analyze_session_structure.js
 * 
 * Script especializado para analizar la estructura de las claves de sesión en Redis
 * y validar si están correctamente estructuradas según la nueva propuesta.
 * 
 * Uso: node analyze_session_structure.js
 */

require('dotenv').config();
const Redis = require('ioredis');

// Configuración de Redis desde .env
const redisConfig = {
  host: process.env.REDIS_HOST || '66.42.90.210',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || 'Rd$2025!NodeCG#Secure@77X9P&Ultra*Strong'
};

// Cliente Redis
const redis = new Redis(redisConfig);

/**
 * Analiza la estructura de claves de sesión
 */
async function analyzeSessionStructure() {
  try {
    console.log('Analizando estructura de claves de sesión en Redis...');
    
    // Buscar claves de sesión (actual y esperada)
    const allKeys = await redis.keys('*');
    
    // Analizar claves encontradas
    const flatSessionKey = 'session';
    const defaultSessionKey = 'default:session';
    const sessionKeys = allKeys.filter(key => 
      key === flatSessionKey || 
      key === defaultSessionKey || 
      key.includes(':session:') || 
      key.includes(':leaderboard:session')
    );
    
    console.log(`\nClaves de sesión encontradas (${sessionKeys.length}):`);
    sessionKeys.forEach(key => console.log(`- ${key}`));
    
    // Analizar el contenido de cada clave de sesión
    console.log('\nAnalizando contenido de claves de sesión:');
    for (const key of sessionKeys) {
      const type = await redis.type(key);
      
      if (type === 'hash') {
        const data = await redis.hgetall(key);
        const fields = Object.keys(data);
        
        console.log(`\n📝 Clave: ${key} (${type}) - ${fields.length} campos`);
        
        // Clasificar campos por prefijo
        const prefixGroups = {};
        fields.forEach(field => {
          const prefix = field.split('_')[0] || 'other';
          if (!prefixGroups[prefix]) {
            prefixGroups[prefix] = [];
          }
          prefixGroups[prefix].push(field);
        });
        
        // Mostrar grupos
        for (const [prefix, fieldList] of Object.entries(prefixGroups)) {
          console.log(`  - ${prefix}_* (${fieldList.length}): ${fieldList.slice(0, 3).join(', ')}${fieldList.length > 3 ? '...' : ''}`);
          
          // Mostrar algunos valores ejemplo
          if (fieldList.length > 0) {
            const exampleField = fieldList[0];
            console.log(`    Ejemplo: ${exampleField} = ${data[exampleField]}`);
          }
        }
        
        // Verificar existencia de flags
        const hasFlags = fields.some(f => f.startsWith('flags_'));
        if (hasFlags) {
          console.log(`  ✅ Contiene datos de banderas: ${data.flags_flag || 'undefined'}, Vueltas restantes: ${data.flags_laps_to_go || '0'}`);
        } else {
          console.log(`  ❌ No contiene datos de banderas`);
        }
        
        // Verificar existencia de datos de run
        const hasRun = fields.some(f => f.startsWith('run_'));
        if (hasRun) {
          console.log(`  ✅ Contiene datos de run: ${data.run_number || 'undefined'} - ${data.run_description || 'Sin descripción'}`);
        } else {
          console.log(`  ❌ No contiene datos de run`);
        }
        
        // Verificar existencia de datos de evento
        const hasEvent = fields.some(f => f.startsWith('event_'));
        if (hasEvent) {
          const eventKeys = fields.filter(f => f.startsWith('event_'));
          console.log(`  ✅ Contiene ${eventKeys.length} datos de evento. Ejemplo: ${eventKeys[0]} = ${data[eventKeys[0]]}`);
        } else {
          console.log(`  ❌ No contiene datos de evento`);
        }
      } else {
        console.log(`\n⚠️ Clave: ${key} (${type}) - No es un hash, no se puede analizar su estructura interna`);
      }
    }
    
    // Análisis de clave 'default:session' (objetivo de la refactorización)
    const targetKey = 'default:session';
    if (sessionKeys.includes(targetKey)) {
      console.log(`\n✅ La clave objetivo '${targetKey}' existe.`);
      
      // Verificar si tiene datos
      const targetData = await redis.hgetall(targetKey);
      if (Object.keys(targetData).length > 0) {
        console.log(`   Contiene ${Object.keys(targetData).length} campos.`);
      } else {
        console.log(`   ⚠️ Existe pero está vacía.`);
      }
    } else {
      console.log(`\n❌ La clave objetivo '${targetKey}' NO existe. Será creada durante la refactorización.`);
    }
    
    // Análisis de clave plana 'session' (actual)
    const flatKey = 'session';
    if (sessionKeys.includes(flatKey)) {
      console.log(`\n⚠️ La clave plana '${flatKey}' existe y debería migrarse a '${targetKey}'.`);
      
      // Verificar si tiene datos
      const flatData = await redis.hgetall(flatKey);
      if (Object.keys(flatData).length > 0) {
        console.log(`   Contiene ${Object.keys(flatData).length} campos que deberían migrarse.`);
      } else {
        console.log(`   Existe pero está vacía.`);
      }
    } else {
      console.log(`\n✅ La clave plana '${flatKey}' no existe, lo cual es bueno (no hay datos que migrar).`);
    }
    
    // Cerrar conexión
    redis.disconnect();
    console.log('\nAnálisis completado.');
    
  } catch (error) {
    console.error('Error analizando estructura de sesión:', error);
    redis.disconnect();
    process.exit(1);
  }
}

// Ejecutar análisis
analyzeSessionStructure();
