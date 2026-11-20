#!/bin/bash

# Script para iniciar el MyLaps Simulator
# Uso: ./start-simulator.sh

echo "🏁 Iniciando MyLaps Simulator..."
echo "================================="
echo ""
echo "✅ Configuración:"
echo "   - Redis Host: 66.42.90.210"
echo "   - Redis Stream: mylaps:stream"
echo "   - Web Port: 6050"
echo "   - Data Folder: ../data"
echo ""
echo "🌐 Una vez iniciado, visita: http://localhost:6050"
echo ""

# Verificar si node_modules existe
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias..."
    npm install
    echo ""
fi

# Iniciar el simulador
echo "🚀 Iniciando servidor..."
npm start
