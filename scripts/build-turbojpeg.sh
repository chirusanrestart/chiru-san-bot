#!/data/data/com.termux/files/usr/bin/bash
set -eu

cd "$(dirname "$0")/.."
mkdir -p bin

if ! command -v clang >/dev/null 2>&1; then
  echo "clang não encontrado. Instale com: pkg install clang"
  exit 1
fi

if [ ! -f "$PREFIX/include/turbojpeg.h" ]; then
  echo "turbojpeg.h não encontrado. Instale libjpeg-turbo primeiro."
  exit 1
fi

clang -O3 -Wall -Wextra \
  -I"$PREFIX/include" \
  scripts/turbojpeg-ppm.c \
  -L"$PREFIX/lib" -Wl,-rpath,"$PREFIX/lib" \
  -lturbojpeg \
  -o bin/turbojpeg-ppm

chmod 755 bin/turbojpeg-ppm
echo "TurboJPEG helper compilado: bin/turbojpeg-ppm"
echo "Teste antes de ativar no bot."
