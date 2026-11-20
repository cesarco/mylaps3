/**
 * extract_redis_structure.js
 * Script para extraer toda la estructura de datos de Redis a un archivo JSON.
 * 
 * Este script analiza todas las claves en Redis y extrae su contenido,
 * manteniendo la estructura y tipos de datos para validar y documentar
 * la estructura actual.
 * 
 * Uso: node extract_redis_structure.js [output_file.json]
 */

require('dotenv').config();
const Redis = require('ioredis');
const fs = require('fs').promises;
const path = require('path');

// Configuración de Redis desde .env
const redisConfig = {
  host: process.env.REDIS_HOST || '66.42.90.210',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || 'Rd$2025!NodeCG#Secure@77X9P&Ultra*Strong'
};

// Ruta del archivo de salida
const outputFile = process.argv[2] || 'redis_structure.json';

// Cliente Redis
const redis = new Redis(redisConfig);

/**
 * Analiza el tipo de una clave y extrae su contenido según el tipo
 * @param {string} key - Clave Redis a analizar
 * @returns {Object} - Objeto con tipo y contenido de la clave
 */
async function analyzeKey(key) {
  // Determinar el tipo de la clave
  const type = await redis.type(key);
  let data;
  
  try {
    switch (type) {
      case 'string':
        data = await redis.get(key);
        // Intentar parsear como JSON si es posible
        try {
          data = JSON.parse(data);
        } catch (e) {
          // Mantener como string si no es JSON válido
        }
        break;
      
      case 'list':
        const listLength = await redis.llen(key);
        data = await redis.lrange(key, 0, listLength - 1);
        break;
      
      case 'set':
        data = await redis.smembers(key);
        break;
      
      case 'zset':
        data = await redis.zrange(key, 0, -1, 'WITHSCORES');
        // Convertir array [value1, score1, value2, score2, ...] a objeto {value1: score1, value2: score2, ...}
        const zsetObj = {};
        for (let i = 0; i < data.length; i += 2) {
          zsetObj[data[i]] = parseFloat(data[i + 1]);
        }
        data = zsetObj;
        break;
      
      case 'hash':
        data = await redis.hgetall(key);
        // Intentar parsear los valores como JSON si es posible
        for (const field in data) {
          try {
            data[field] = JSON.parse(data[field]);
          } catch (e) {
            // Mantener como string si no es JSON válido
          }
        }
        break;
      
      case 'stream':
        // Para streams, obtener los últimos 100 elementos
        const streamData = await redis.xrange(key, '-', '+', 'COUNT', 100);
        data = streamData.map(item => {
          const [id, fields] = item;
          const fieldObj = {};
          for (let i = 0; i < fields.length; i += 2) {
            fieldObj[fields[i]] = fields[i + 1];
          }
          return { id, fields: fieldObj };
        });
        break;
      
      default:
        data = `Tipo no soportado: ${type}`;
    }
    
    return { key, type, data };
  } catch (error) {
    console.error(`Error analizando clave ${key}:`, error);
    return { key, type, error: error.message };
  }
}

/**
 * Organiza las claves en una estructura jerárquica basada en sus prefijos
 * @param {Array} keyDataArray - Array de objetos {key, type, data}
 * @returns {Object} - Estructura jerárquica de claves
 */
function organizeKeysByPrefix(keyDataArray) {
  const structure = {};
  
  keyDataArray.forEach(keyData => {
    const { key, type, data, error } = keyData;
    const parts = key.split(':');
    
    // Construir estructura jerárquica
    let current = structure;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
    
    // Añadir la clave final con su tipo y datos
    const lastPart = parts[parts.length - 1];
    current[lastPart] = { 
      __type: type,
      __fullKey: key,
      ...(error ? { __error: error } : { __data: data })
    };
  });
  
  return structure;
}

/**
 * Extrae todas las claves de Redis y su contenido
 */
async function extractRedisStructure() {
  try {
    console.log('Conectando a Redis...');
    
    // Obtener todas las claves
    const keys = await redis.keys('*');
    console.log(`Encontradas ${keys.length} claves en Redis.`);
    
    // Analizar cada clave
    console.log('Analizando estructura de datos...');
    const keyDataPromises = keys.map(analyzeKey);
    const keyDataArray = await Promise.all(keyDataPromises);
    
    // Organizar por prefijo
    console.log('Organizando estructura jerárquica...');
    const structure = {
      _metadata: {
        extractedAt: new Date().toISOString(),
        totalKeys: keys.length,
        redisHost: redisConfig.host,
        redisPort: redisConfig.port
      },
      _rawKeys: keyDataArray,
      hierarchy: organizeKeysByPrefix(keyDataArray)
    };
    
    // Guardar a archivo
    const outputPath = path.resolve(outputFile);
    await fs.writeFile(outputPath, JSON.stringify(structure, null, 2));
    console.log(`Estructura guardada en ${outputPath}`);
    
    // Información adicional sobre prefijos
    const prefixes = new Set();
    keys.forEach(key => {
      const parts = key.split(':');
      if (parts.length > 1) {
        prefixes.add(parts[0]);
      }
    });
    console.log(`Prefijos encontrados: ${Array.from(prefixes).join(', ')}`);
    
    // Cerrar conexión
    redis.disconnect();
    console.log('Conexión a Redis cerrada.');
    
  } catch (error) {
    console.error('Error extrayendo estructura de Redis:', error);
    redis.disconnect();
    process.exit(1);
  }
}

// Ejecutar el script
console.log('Iniciando extracción de estructura Redis...');
extractRedisStructure().then(() => {
  console.log('Extracción completada.');
}).catch(err => {
  console.error('Error durante la extracción:', err);
});
