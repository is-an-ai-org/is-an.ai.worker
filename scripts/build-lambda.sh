#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p dist

# Bundle SDK dependencies so the ZIP does not depend on the runtime's SDK version.
./node_modules/.bin/esbuild src/lambda.ts \
  --bundle --platform=node --target=node20 --format=cjs \
  --outfile=dist/lambda.js --minify --metafile=dist/api-metafile.json
./node_modules/.bin/esbuild hosting-lambda/index.ts hosting-lambda/origin-response.ts \
  --bundle --platform=node --target=node20 --format=cjs \
  --outdir=dist --minify

rm -f dist/api-lambda.zip dist/hosting-lambda.zip
zip -j dist/api-lambda.zip dist/lambda.js
zip -j dist/hosting-lambda.zip dist/index.js dist/origin-response.js
