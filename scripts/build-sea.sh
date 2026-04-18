#!/usr/bin/env bash
set -euo pipefail

# Build Paseo daemon as a Node.js SEA binary
# Usage: ./scripts/build-sea.sh [target]
# Targets: x64-linux, arm64-linux, x64-darwin, arm64-darwin

TARGET="${1:-$(node -e "console.log(process.arch + '-' + process.platform)")}"
OUT_DIR="${PASEO_HOME:-$HOME/.paseo}/cache"
OUT_NAME="paseo-daemon-${TARGET}"

echo "Building SEA for target: ${TARGET}"
echo "Output: ${OUT_DIR}/${OUT_NAME}"

# 1. Bundle the daemon into a single JS file
npx esbuild packages/server/src/server/index.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --outfile=dist/sea/daemon.cjs \
  --format=cjs \
  --external:@anthropic-ai/sdk \
  --external:pino \
  --external:ws \
  --external:express

# 2. Generate SEA config
cat > dist/sea/sea-config.json << EOF
{
  "main": "daemon.cjs",
  "output": "sea-prep.blob",
  "disableExperimentalSEAWarning": true
}
EOF

# 3. Generate the blob
cd dist/sea
node --experimental-sea-config sea-config.json

# 4. Copy node binary and inject blob
cp "$(which node)" "${OUT_NAME}"
if [[ "${TARGET}" == *darwin* ]]; then
  codesign --remove-signature "${OUT_NAME}"
  npx postject "${OUT_NAME}" NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
    --macho-segment-name NODE_SEA
  codesign --sign - "${OUT_NAME}"
else
  npx postject "${OUT_NAME}" NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
fi

# 5. Move to cache
mkdir -p "${OUT_DIR}"
mv "${OUT_NAME}" "${OUT_DIR}/${OUT_NAME}"
chmod +x "${OUT_DIR}/${OUT_NAME}"

echo "SEA binary built: ${OUT_DIR}/${OUT_NAME}"
