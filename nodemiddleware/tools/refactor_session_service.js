/**
 * refactor_session_service.js
 * 
 * Script para actualizar SessionService.js para usar el nuevo RedisKeyGenerator.
 * Este script lee el archivo actual, realiza las modificaciones necesarias y 
 * guarda la nueva versión con los cambios.
 * 
 * Uso: node refactor_session_service.js [--backup] [--apply]
 */

const fs = require('fs');
const path = require('path');

// Configuración
const sourcePath = path.join(__dirname, '..', 'src', 'services', 'SessionService.js');
const backupPath = path.join(__dirname, '..', 'src', 'services', 'SessionService.js.bak');
const shouldBackup = process.argv.includes('--backup');
const shouldApply = process.argv.includes('--apply');

// Verificar si el archivo existe
if (!fs.existsSync(sourcePath)) {
  console.error(`❌ Error: El archivo ${sourcePath} no existe.`);
  process.exit(1);
}

// Crear backup si se especifica
if (shouldBackup) {
  fs.copyFileSync(sourcePath, backupPath);
  console.log(`✅ Backup creado en ${backupPath}`);
}

// Leer el archivo original
console.log(`Leyendo archivo ${sourcePath}...`);
const originalContent = fs.readFileSync(sourcePath, 'utf8');

// Realizar las modificaciones
console.log('Aplicando refactorización...');

// Primero, añadir la importación de RedisKeyGenerator
let modifiedContent = originalContent;

// Buscar el bloque de importaciones
const importRegex = /(const\s+[A-Za-z0-9_]+\s*=\s*require\(['"][^'"]+['"]\);\s*)+/;
const importMatch = modifiedContent.match(importRegex);

if (importMatch) {
  const importBlock = importMatch[0];
  const newImportBlock = importBlock + "const RedisKeyGenerator = require('../utils/RedisKeyGenerator');\n";
  modifiedContent = modifiedContent.replace(importBlock, newImportBlock);
  console.log('✅ Importación de RedisKeyGenerator añadida');
} else {
  console.log('⚠️ No se encontró el bloque de importaciones. Añadiendo al inicio del archivo.');
  modifiedContent = "const RedisKeyGenerator = require('../utils/RedisKeyGenerator');\n" + modifiedContent;
}

// Reemplazar referencias directas a 'session' con RedisKeyGenerator
// Patrón 1: Acceso directo a la clave 'session'
modifiedContent = modifiedContent.replace(
  /redis\.hget\(['"]session['"], ?['"]([^'"]+)['"]\)/g, 
  `redis.hget(RedisKeyGenerator.getSessionKey(), '$1')`
);

modifiedContent = modifiedContent.replace(
  /redis\.hgetall\(['"]session['"]\)/g, 
  `redis.hgetall(RedisKeyGenerator.getSessionKey())`
);

modifiedContent = modifiedContent.replace(
  /redis\.hset\(['"]session['"], ?['"]([^'"]+)['"], ?([^)]+)\)/g, 
  `redis.hset(RedisKeyGenerator.getSessionKey(), '$1', $2)`
);

modifiedContent = modifiedContent.replace(
  /redis\.hmset\(['"]session['"], ?({[^}]+})\)/g, 
  `redis.hmset(RedisKeyGenerator.getSessionKey(), $1)`
);

// Patrón 2: Variables que contienen 'session' como clave
modifiedContent = modifiedContent.replace(
  /const\s+sessionKey\s*=\s*['"]session['"]/g,
  `const sessionKey = RedisKeyGenerator.getSessionKey()`
);

// Patrón 3: Cadenas de texto para 'default:session'
modifiedContent = modifiedContent.replace(
  /['"]default:session['"]/g,
  `RedisKeyGenerator.getSessionKey()`
);

// Mostrar cambios
const changes = countChanges(originalContent, modifiedContent);
console.log(`\nCambios detectados:`);
console.log(`- Líneas cambiadas: ${changes}`);

// Aplicar cambios si se especifica
if (shouldApply) {
  fs.writeFileSync(sourcePath, modifiedContent);
  console.log(`\n✅ Cambios aplicados a ${sourcePath}`);
} else {
  // Mostrar una porción de los cambios
  console.log('\nVista previa de los cambios (primeras 500 caracteres):');
  
  // Buscar diferencias para mostrar un contexto relevante
  let diffStart = 0;
  for (let i = 0; i < Math.min(originalContent.length, modifiedContent.length); i++) {
    if (originalContent[i] !== modifiedContent[i]) {
      diffStart = Math.max(0, i - 50); // 50 caracteres antes de la primera diferencia
      break;
    }
  }
  
  console.log('Original:\n' + originalContent.substr(diffStart, 200) + '...');
  console.log('\nModificado:\n' + modifiedContent.substr(diffStart, 200) + '...');
  
  console.log('\n⚠️ Para aplicar los cambios, ejecute el script con --apply');
}

// Función auxiliar para contar cambios
function countChanges(original, modified) {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  
  let changedLines = 0;
  
  for (let i = 0; i < Math.max(originalLines.length, modifiedLines.length); i++) {
    const originalLine = i < originalLines.length ? originalLines[i] : null;
    const modifiedLine = i < modifiedLines.length ? modifiedLines[i] : null;
    
    if (originalLine !== modifiedLine) {
      changedLines++;
    }
  }
  
  return changedLines;
}

console.log('\nProceso completado.');
