/**
 * migrate_session_keys.js
 * 
 * Script para migrar datos de la clave 'session' (plana) a 'default:session' (prefijada)
 * de acuerdo con la nueva estructura de claves centralizada.
 * 
 * Uso: node migrate_session_keys.js [--dry-run]
 */

require('dotenv').config();
const Redis = require('ioredis');

// Configuración de Redis desde .env
const redisConfig = {
  host: process.env.REDIS_HOST || '66.42.90.210',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || 'Rd$2025!NodeCG#Secure@77X9P&Ultra*Strong'
};

// Opciones
const dryRun = process.argv.includes('--dry-run');
if (dryRun) {
  console.log('⚠️ Modo simulación activado. No se realizarán cambios en Redis.');
}

// Cliente Redis
const redis = new Redis(redisConfig);

/**
 * Migra los datos de session a default:session
 */
async function migrateSessionKeys() {
  try {
    console.log('Conectando a Redis...');
    console.log(`Host: ${redisConfig.host}, Puerto: ${redisConfig.port}`);

    // Verificar existencia de las claves
    const sourceKey = 'session';
    const targetKey = 'default:session';
    
    const sourceExists = await redis.exists(sourceKey);
    const targetExists = await redis.exists(targetKey);
    
    console.log(`Estado inicial:`);
    console.log(`- Clave origen '${sourceKey}': ${sourceExists ? 'Existe' : 'No existe'}`);
    console.log(`- Clave destino '${targetKey}': ${targetExists ? 'Existe' : 'No existe'}`);
    
    if (!sourceExists) {
      console.log(`\n✅ No hay datos que migrar. La clave '${sourceKey}' no existe.`);
      redis.disconnect();
      return;
    }

    // Obtener tipo de clave origen
    const sourceType = await redis.type(sourceKey);
    if (sourceType !== 'hash') {
      console.error(`\n❌ Error: La clave '${sourceKey}' no es un hash, es de tipo '${sourceType}'.`);
      redis.disconnect();
      return;
    }

    // Obtener datos de clave origen
    const sourceData = await redis.hgetall(sourceKey);
    const fieldCount = Object.keys(sourceData).length;
    
    if (fieldCount === 0) {
      console.log(`\n✅ La clave '${sourceKey}' existe pero está vacía. Nada que migrar.`);
      
      if (!dryRun) {
        console.log(`Eliminando clave vacía '${sourceKey}'...`);
        await redis.del(sourceKey);
        console.log(`Clave '${sourceKey}' eliminada.`);
      }
      
      redis.disconnect();
      return;
    }

    console.log(`\nEncontrados ${fieldCount} campos en '${sourceKey}'.`);
    console.log('Campos disponibles:');
    
    // Agrupar campos por prefijo para mejor análisis
    const prefixGroups = {};
    Object.keys(sourceData).forEach(field => {
      const prefix = field.split('_')[0] || 'other';
      if (!prefixGroups[prefix]) {
        prefixGroups[prefix] = [];
      }
      prefixGroups[prefix].push(field);
    });
    
    // Mostrar resumen de campos
    for (const [prefix, fieldList] of Object.entries(prefixGroups)) {
      console.log(`- ${prefix}_* (${fieldList.length}): ${fieldList.slice(0, 3).join(', ')}${fieldList.length > 3 ? '...' : ''}`);
    }

    // Verificar si hay conflictos en destino
    if (targetExists) {
      const targetData = await redis.hgetall(targetKey);
      const targetFields = Object.keys(targetData);
      
      if (targetFields.length > 0) {
        console.log(`\n⚠️ La clave destino '${targetKey}' ya existe con ${targetFields.length} campos.`);
        
        // Verificar campos duplicados
        const duplicateFields = Object.keys(sourceData).filter(field => targetData[field] !== undefined);
        if (duplicateFields.length > 0) {
          console.log(`\n⚠️ Se encontraron ${duplicateFields.length} campos duplicados que podrían sobrescribirse:`);
          duplicateFields.slice(0, 10).forEach(field => {
            console.log(`- ${field}:`);
            console.log(`  Origen: ${sourceData[field]}`);
            console.log(`  Destino actual: ${targetData[field]}`);
          });
          
          if (duplicateFields.length > 10) {
            console.log(`  ... y ${duplicateFields.length - 10} más.`);
          }
          
          console.log('\n⚠️ Se recomienda revisar manualmente los datos antes de continuar.');
          
          if (!dryRun) {
            const confirmation = await new Promise(resolve => {
              const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
              });
              
              readline.question('¿Desea continuar con la migración? (s/n): ', answer => {
                readline.close();
                resolve(answer.toLowerCase() === 's');
              });
            });
            
            if (!confirmation) {
              console.log('Operación cancelada por el usuario.');
              redis.disconnect();
              return;
            }
          }
        }
      }
    }

    // Realizar migración
    console.log(`\nMigrando datos de '${sourceKey}' a '${targetKey}'...`);
    
    if (!dryRun) {
      // Si la clave destino no existe, la creamos con todos los campos de origen
      if (!targetExists) {
        const pipeline = redis.pipeline();
        
        Object.entries(sourceData).forEach(([field, value]) => {
          pipeline.hset(targetKey, field, value);
        });
        
        await pipeline.exec();
        console.log(`✅ Creada clave '${targetKey}' con ${fieldCount} campos.`);
      } else {
        // Si la clave destino ya existe, actualizamos campo por campo
        const pipeline = redis.pipeline();
        
        Object.entries(sourceData).forEach(([field, value]) => {
          pipeline.hset(targetKey, field, value);
        });
        
        await pipeline.exec();
        console.log(`✅ Actualizada clave '${targetKey}' con ${fieldCount} campos.`);
      }
      
      // Eliminar clave origen
      console.log(`\nEliminando clave origen '${sourceKey}'...`);
      await redis.del(sourceKey);
      console.log(`✅ Clave '${sourceKey}' eliminada.`);
    } else {
      console.log('⚠️ Modo simulación: No se realizaron cambios en Redis.');
    }

    // Verificar estado final
    if (!dryRun) {
      const finalTargetExists = await redis.exists(targetKey);
      const finalSourceExists = await redis.exists(sourceKey);
      
      console.log(`\nEstado final:`);
      console.log(`- Clave origen '${sourceKey}': ${finalSourceExists ? '⚠️ Todavía existe' : '✅ Eliminada'}`);
      console.log(`- Clave destino '${targetKey}': ${finalTargetExists ? '✅ Existe' : '❌ No existe'}`);
      
      if (finalTargetExists) {
        const finalData = await redis.hgetall(targetKey);
        console.log(`  La clave destino contiene ${Object.keys(finalData).length} campos.`);
      }
    }

    // Cerrar conexión
    redis.disconnect();
    console.log('\nMigración completada.');

  } catch (error) {
    console.error('Error durante la migración:', error);
    redis.disconnect();
    process.exit(1);
  }
}

// Ejecutar migración
migrateSessionKeys();
