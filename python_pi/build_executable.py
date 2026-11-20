#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script para empaquetar la aplicación UDP Scanner en un ejecutable
"""

import os
import sys
import subprocess
import platform
import shutil
from pathlib import Path

def check_requirements():
    """Verifica que estén instalados los requisitos necesarios"""
    try:
        import PyInstaller
        print("✅ PyInstaller está instalado")
    except ImportError:
        print("❌ PyInstaller no está instalado")
        install = input("¿Desea instalarlo ahora? (s/n): ").lower()
        if install == 's':
            subprocess.run([sys.executable, "-m", "pip", "install", "pyinstaller"], check=True)
        else:
            print("Abortando. PyInstaller es necesario para continuar.")
            sys.exit(1)
    
    try:
        import tkinter
        print("✅ Tkinter está instalado")
    except ImportError:
        print("❌ Tkinter no está instalado")
        print("Tkinter es parte de la biblioteca estándar de Python pero puede requerir instalación adicional.")
        print("En macOS: brew install python-tk")
        print("En Linux: sudo apt-get install python3-tk")
        print("En Windows: Normalmente viene instalado con Python")
        sys.exit(1)
    
    # Verificar dependencias opcionales
    try:
        import scapy.all
        print("✅ Scapy está instalado (opcional)")
    except ImportError:
        print("❓ Scapy no está instalado (opcional)")
        install = input("¿Desea instalar Scapy para mejor detección de puertos? (s/n): ").lower()
        if install == 's':
            subprocess.run([sys.executable, "-m", "pip", "install", "scapy"], check=True)
    
    try:
        import nmap
        print("✅ python-nmap está instalado (opcional)")
    except ImportError:
        print("❓ python-nmap no está instalado (opcional)")
        install = input("¿Desea instalar python-nmap para escaneo avanzado? (s/n): ").lower()
        if install == 's':
            subprocess.run([sys.executable, "-m", "pip", "install", "python-nmap"], check=True)

def create_icon():
    """Crea un icono simple para la aplicación si no existe"""
    icon_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mylaps_icon.ico")
    
    if not os.path.exists(icon_path):
        print("Icono no encontrado, creando uno simple...")
        
        try:
            # Intentar crear un icono básico con PIL
            try:
                from PIL import Image, ImageDraw
            except ImportError:
                subprocess.run([sys.executable, "-m", "pip", "install", "pillow"], check=True)
                from PIL import Image, ImageDraw
            
            # Crear una imagen simple con un círculo azul
            img = Image.new('RGBA', (256, 256), color=(0, 0, 0, 0))
            draw = ImageDraw.Draw(img)
            
            # Dibujar un círculo azul con borde
            draw.ellipse((10, 10, 246, 246), fill=(30, 144, 255, 230), outline=(0, 0, 128, 255), width=3)
            
            # Dibujar un triángulo como símbolo de "scan"
            draw.polygon([(64, 128), (192, 64), (192, 192)], fill=(255, 255, 255, 230))
            
            # Guardar como .ico en Windows, o como .png en otros sistemas
            if platform.system() == "Windows":
                img.save(icon_path, format="ICO")
            else:
                # En macOS/Linux usaremos PNG y lo convertiremos a ICO con PyInstaller
                icon_path = icon_path.replace(".ico", ".png")
                img.save(icon_path, format="PNG")
            
            print(f"✅ Icono creado en {icon_path}")
            return icon_path
            
        except Exception as e:
            print(f"No se pudo crear el icono: {e}")
            return None
    
    return icon_path

def build_executable(icon_path=None):
    """
    Construye el ejecutable con PyInstaller
    
    Args:
        icon_path: Ruta al icono a usar (opcional)
    """
    # Archivo principal
    main_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "udp_scanner_gui.py")
    
    # Verificar que existe
    if not os.path.exists(main_file):
        print(f"❌ No se encuentra el archivo principal {main_file}")
        sys.exit(1)
    
    # Archivos adicionales que incluir
    scanner_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "advanced_udp_scanner.py")
    
    # Directorio para el ejecutable compilado
    dist_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")
    
    # Construir los argumentos de PyInstaller
    pyinstaller_args = [
        "--name=MyLaps_UDP_Scanner",
        "--onefile",  # Crear un único ejecutable
        "--windowed",  # Sin consola en Windows
        "--clean",     # Limpiar archivos temporales
        f"--distpath={dist_dir}",
        "--add-data=%s%s%s" % (scanner_file, os.pathsep, "."),
    ]
    
    # Agregar icono si está disponible
    if icon_path:
        pyinstaller_args.append(f"--icon={icon_path}")
    
    # Ejecutar PyInstaller
    print("\n🔨 Creando ejecutable con PyInstaller...\n")
    
    cmd = [sys.executable, "-m", "PyInstaller"] + pyinstaller_args + [main_file]
    
    try:
        subprocess.run(cmd, check=True)
        print("\n✅ Ejecutable creado correctamente")
        
        # Ruta al ejecutable
        if platform.system() == "Windows":
            exe_path = os.path.join(dist_dir, "MyLaps_UDP_Scanner.exe")
        else:
            exe_path = os.path.join(dist_dir, "MyLaps_UDP_Scanner")
        
        print(f"\n📦 Ejecutable disponible en: {exe_path}")
        
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Error al crear el ejecutable: {e}")
        sys.exit(1)

def main():
    """Función principal"""
    print("\n===============================")
    print("MyLaps UDP Scanner - Empaquetador")
    print("===============================\n")
    
    # Verificar requisitos
    check_requirements()
    
    # Crear icono si no existe
    icon_path = create_icon()
    
    # Construir el ejecutable
    build_executable(icon_path)
    
    print("\n✨ Proceso completado!")
    input("Presione Enter para salir...")

if __name__ == "__main__":
    main()