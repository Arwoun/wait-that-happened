#!/usr/bin/env bash
# Downloads the CC0 Kenney 3D kits into public/kenney/<kit>/*.glb (runs on GitHub Actions; kenney.nl is reachable there).
# nature-kit and fantasy-town-kit are also flattened into public/kenney/ (names used by the engine's world.ts KENNEY list).
set -euo pipefail
KITS=${KITS:-"nature-kit fantasy-town-kit castle-kit pirate-kit city-kit-suburban city-kit-commercial survival-kit furniture-kit graveyard-kit car-kit"}
FLAT="nature-kit fantasy-town-kit"
dest=public/kenney; mkdir -p "$dest" tmp/kenney
for kit in $KITS; do
  [ -d "$dest/$kit" ] && [ -n "$(ls -A "$dest/$kit" 2>/dev/null)" ] && { echo "have $kit"; continue; }
  # the site hands out a signed link: GET /download-link/<hex("assets/<kit>")> -> {"url": ...}
  id=$(printf 'assets/%s' "$kit" | xxd -p | tr -d '\n')
  url=$(curl -fsSL -A "Mozilla/5.0" "https://kenney.nl/download-link/$id" | python3 -c "import json,sys;print(json.load(sys.stdin).get('url',''))" || true)
  if [ -z "$url" ]; then echo "::warning::no download link for $kit"; continue; fi
  echo "$kit <- $url"
  curl -fsSL -A "Mozilla/5.0" "$url" -o "tmp/kenney/$kit.zip" || { echo "::warning::download failed for $kit"; continue; }
  rm -rf "tmp/kenney/$kit"; unzip -qo "tmp/kenney/$kit.zip" -d "tmp/kenney/$kit"
  mkdir -p "$dest/$kit"
  find "tmp/kenney/$kit" -iname '*.glb' -exec cp -f {} "$dest/$kit/" \;
  echo "$kit: $(ls "$dest/$kit" | wc -l) glb"
done
for kit in $FLAT; do [ -d "$dest/$kit" ] && cp -n "$dest/$kit"/*.glb "$dest/" 2>/dev/null || true; done
echo "flattened: $(ls "$dest"/*.glb 2>/dev/null | wc -l) glb"
