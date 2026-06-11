# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path

project_dir = Path.cwd()

datas = [
    (str(project_dir / 'templates'), 'templates'),
    (str(project_dir / 'static'), 'static'),
    (str(project_dir / 'data' / 'psychology_learning.db'), 'data'),
]

img_dir = project_dir / 'data' / 'img'
if img_dir.exists():
    datas.append((str(img_dir), 'data/img'))

excludes = [
    'IPython',
    'matplotlib',
    'numpy',
    'pandas',
    'PIL',
    'pytest',
    'setuptools',
    'tkinter',
    'unittest',
]


a = Analysis(
    ['launcher.py'],
    pathex=[str(project_dir)],
    binaries=[],
    datas=datas,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='PsychologyLearningWeb',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='PsychologyLearningWeb',
)
