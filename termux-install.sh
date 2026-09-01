#!/data/data/com.termux/files/usr/bin/bash
# ════════════════════════════════════════════════════════════════════
#  termux-install.sh — Instalación limpia y robusta de un bot MD en Termux
#
#  Adaptado de Ruby-Hoshino-Bot (patrón probado) para el stack de Ginko-MD:
#   · Usa node:sqlite (builtin) → EXIGE Node >= 22.5 y lo verifica.
#   · No requiere node-gyp ni módulos nativos, pero instala las
#     herramientas por si algún paquete opcional las necesita.
#
#  Qué hace (sin tocar tu código):
#   1. Desinfecta variables tóxicas de npm/sharp (evitan builds que fallan).
#   2. Evita Node no-LTS (a veces Termux trae nodejs-current roto).
#   3. Instala la base de compilación nativa + multimedia (ffmpeg, libwebp...).
#   4. Configura CC/CXX/PKG_CONFIG_PATH/GYP_DEFINES/NODE_PATH en ~/.bashrc.
#   5. Instalación limpia (borra node_modules/package-lock viejos).
#   6. Verifica la versión de Node (>=22.5) y módulos críticos.
#
#  Uso (dentro de la carpeta del bot):
#     bash termux-install.sh
# ════════════════════════════════════════════════════════════════════

set -Eeuo pipefail

PREFIX_DIR="${PREFIX:-/data/data/com.termux/files/usr}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NPM_FLAGS=(--no-audit --no-fund)

# Versión mínima de Node requerida (por node:sqlite)
MIN_NODE_MAJOR=22
MIN_NODE_MINOR=5

print_step() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "💖 $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

fail() {
  echo "❌ $*" >&2
  exit 1
}

# ── ¿Estamos en Termux? ───────────────────────────────────────────
if [[ "${OSTYPE:-}" != linux-android* && ! -d "$PREFIX_DIR" ]]; then
  fail "Este instalador está diseñado para Termux en Android."
fi

cd "$PROJECT_DIR"

print_step "Detectando proyecto"
PROJECT_NAME="$(node -e "try{console.log(require('./package.json').name||'bot')}catch{console.log('bot')}" 2>/dev/null || echo 'bot')"
echo "Proyecto: $PROJECT_NAME"
echo "Directorio: $PROJECT_DIR"

print_step "Desinfectando variables tóxicas del sistema..."
if [ -f "$HOME/.bashrc" ]; then
  sed -i '/npm_config_/d' "$HOME/.bashrc"
  sed -i '/SHARP_FORCE_GLOBAL_LIBVIPS/d' "$HOME/.bashrc"
fi
unset npm_config_python || true
unset npm_config_build_from_source || true
unset npm_config_platform || true
unset npm_config_target_platform || true
unset npm_config_arch || true
unset npm_config_target_arch || true
unset npm_config_sharp_libvips_global || true
unset SHARP_FORCE_GLOBAL_LIBVIPS || true

rm -f "$HOME/.npmrc"
rm -f "$PROJECT_DIR/.npmrc"

print_step "Actualizando repositorios de Termux"
pkg update -y && pkg upgrade -y

print_step "Evitando versiones no-LTS/problemáticas de Node.js"
pkg remove -y nodejs nodejs-current nodejs-lts 2>/dev/null || true

print_step "Instalando Node LTS + base de compilación + multimedia"
pkg install -y nodejs-lts git python make clang binutils pkg-config cmake libsqlite ffmpeg imagemagick libwebp

print_step "Configurando entorno Android/ARM64 limpio"
export CC="${PREFIX_DIR}/bin/clang"
export CXX="${PREFIX_DIR}/bin/clang++"
export PKG_CONFIG_PATH="${PREFIX_DIR}/lib/pkgconfig:${PREFIX_DIR}/share/pkgconfig:${PKG_CONFIG_PATH:-}"
export GYP_DEFINES="android_ndk_path= host_os=linux OS=android"
export NODE_PATH="${PREFIX_DIR}/lib/node_modules:${NODE_PATH:-}"

touch "$HOME/.bashrc"
grep -qxF "export CC=\"${PREFIX_DIR}/bin/clang\"" "$HOME/.bashrc" || echo "export CC=\"${PREFIX_DIR}/bin/clang\"" >> "$HOME/.bashrc"
grep -qxF "export CXX=\"${PREFIX_DIR}/bin/clang++\"" "$HOME/.bashrc" || echo "export CXX=\"${PREFIX_DIR}/bin/clang++\"" >> "$HOME/.bashrc"
grep -qxF "export GYP_DEFINES=\"android_ndk_path= host_os=linux OS=android\"" "$HOME/.bashrc" || echo "export GYP_DEFINES=\"android_ndk_path= host_os=linux OS=android\"" >> "$HOME/.bashrc"
grep -qxF "export NODE_PATH=\"${PREFIX_DIR}/lib/node_modules:\${NODE_PATH:-}\"" "$HOME/.bashrc" || echo "export NODE_PATH=\"${PREFIX_DIR}/lib/node_modules:\${NODE_PATH:-}\"" >> "$HOME/.bashrc"

print_step "Limpiando caché de npm"
npm cache clean --force 2>/dev/null || true

print_step "Preparando instalación limpia de dependencias"
rm -rf node_modules package-lock.json

print_step "Instalando node-gyp global (por si algún paquete opcional lo pide)"
npm install -g node-gyp 2>/dev/null || true

print_step "Instalando dependencias principales del bot..."
npm install "${NPM_FLAGS[@]}"

print_step "Verificando Node >= 22.5 (necesario para node:sqlite)"
NODE_VERSION_NUM="$(node -e "const v=process.versions.node.split('.').map(Number); console.log(v[0]*100 + v[1])")"
REQUIRED=$(( MIN_NODE_MAJOR * 100 + MIN_NODE_MINOR ))
if [ "$NODE_VERSION_NUM" -lt "$REQUIRED" ]; then
  echo "⚠️  Tu Node ($(node -v)) es menor que ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}."
  echo "    Ese bot usa node:sqlite (builtin) y puede NO arrancar en Node < 22.5."
  echo "    → Prueba: pkg upgrade y reiniciar Termux; o consulta docs para otro Node."
else
  echo "✅ Node $(node -v) OK (>= ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR})"
fi

print_step "Verificando módulos críticos"
node --input-type=module - <<'NODECHECK'
const pkgs = ['baileys'];
for (const name of pkgs) {
  try { await import(name); console.log(`✅ ${name} OK`); }
  catch (error) { console.warn(`⚠️ ${name}: ${error.message} (revísalo al arrancar)`); process.exitCode = 1; }
}
NODECHECK

print_step "Verificando binarios de multimedia"
for bin in ffmpeg convert; do
  if command -v "$bin" >/dev/null 2>&1; then echo "✅ $bin OK"; else echo "⚠️ falta $bin"; fi
done

print_step "Instalación completada"
echo "✨ $PROJECT_NAME lista. Inicia el bot con: npm start"
echo "   … y si la sesión está rota, borra la carpeta session/ y vuelve a escanear QR."
