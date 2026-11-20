# MyLaps UDP Scanner - Instrucciones de Instalación

Este documento proporciona instrucciones para instalar, configurar y empaquetar la aplicación MyLaps UDP Scanner, que permite detectar dispositivos en la red que están transmitiendo datos UDP en el puerto utilizado por RMonitor.

## Requisitos previos

Para utilizar o compilar la aplicación, necesitas:

- Python 3.7 o superior
- Tkinter (para la interfaz gráfica)
- PyInstaller (para crear el ejecutable)

Bibliotecas opcionales para mejorar el rendimiento:
- Scapy (para detección avanzada de puertos UDP)
- python-nmap (para escaneo completo)

## Instalación de dependencias

```bash
# Instalar PyInstaller y Pillow (para crear iconos)
pip3 install PyInstaller pillow

# Dependencias opcionales pero recomendadas
pip3 install scapy python-nmap
```

En macOS, es posible que necesites instalar Tkinter si no viene con tu distribución de Python:
```bash
brew install python-tk
```

En Linux:
```bash
sudo apt-get install python3-tk
```

## Ejecución directa (sin empaquetar)

Puedes ejecutar la aplicación directamente sin crear un ejecutable:

```bash
python3 udp_scanner_gui.py
```

## Creación del ejecutable

Hemos proporcionado un script que automatiza el proceso de empaquetado:

```bash
python3 build_executable.py
```

El script realizará las siguientes acciones:
1. Verificar que todas las dependencias estén instaladas
2. Crear un icono para la aplicación
3. Empaquetar la aplicación en un único archivo ejecutable

El ejecutable resultante estará disponible en la carpeta `dist`.

## Ejecución del ejecutable

### Windows
Simplemente haz doble clic en `MyLaps_UDP_Scanner.exe` en la carpeta `dist`.

### macOS
Desde la terminal:
```bash
./dist/MyLaps_UDP_Scanner
```

O desde Finder, haz doble clic en el archivo (es posible que necesites dar permisos de ejecución).

### Linux
```bash
./dist/MyLaps_UDP_Scanner
```

## Uso de la aplicación

1. Configura los parámetros de escaneo:
   - Puerto UDP: El puerto a escanear (por defecto 5403)
   - CIDR: La máscara de subred (por defecto /24)
   - Duración: Tiempo de monitoreo en segundos
   - Método: Selecciona entre auto, scapy, nmap o socket

2. Haz clic en "Iniciar escaneo" para comenzar el proceso.

3. La aplicación escaneará la red en busca de dispositivos con el puerto UDP abierto y luego monitoreará el tráfico para detectar transmisores activos.

4. Los resultados se mostrarán en las pestañas "Resultados" y "Transmisores activos".

5. Si se encuentran transmisores activos, puedes usar el botón "Auto-configurar ingestor" para actualizar automáticamente la configuración del ingestor MyLaps.

## Solución de problemas

- **Error "Import error"**: Asegúrate de haber instalado todas las dependencias requeridas.
- **No se detectan dispositivos**: Verifica que estés conectado a la misma red que los dispositivos transmisores.
- **La aplicación se bloquea durante el escaneo**: Prueba con un valor CIDR más alto para reducir el número de hosts a escanear.

## Notas adicionales

- La detección basada en Scapy ofrece los mejores resultados pero requiere permisos de administrador en algunos sistemas.
- Si tienes problemas con el escaneo basado en nmap, asegúrate de tener instalada la utilidad nmap en tu sistema.