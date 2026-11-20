# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['/Users/amiranda/Github/mylaps mvp2/python_pi/udp_scanner_gui.py'],
    pathex=[],
    binaries=[],
    datas=[('/Users/amiranda/Github/mylaps mvp2/python_pi/advanced_udp_scanner.py', '.')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='MyLaps_UDP_Scanner',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['/Users/amiranda/Github/mylaps mvp2/python_pi/mylaps_icon.png'],
)
app = BUNDLE(
    exe,
    name='MyLaps_UDP_Scanner.app',
    icon='/Users/amiranda/Github/mylaps mvp2/python_pi/mylaps_icon.png',
    bundle_identifier=None,
)
