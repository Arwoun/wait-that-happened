#!/usr/bin/env bash
# usage: bash tools/new_episode.sh ep002_slug [from_episode]
# Copies the engine + the shared look modules from the previous episode into src/episodes/<new>/ and creates
# episodes/<new>/ (script.json to fill in). story.ts, world.ts, cast.ts and creatures.ts are the parts to rewrite.
set -euo pipefail
NEW=$1; FROM=${2:-$(ls -d src/episodes/ep[0-9]* | grep -v ep000 | sort | tail -1 | xargs basename)}
mkdir -p "src/episodes/$NEW" "episodes/$NEW/audio"
cp "src/episodes/$FROM"/*.ts "src/episodes/$FROM"/*.tsx "src/episodes/$NEW/"
sed -i "s#episodes/$FROM/voice/words.json#episodes/$NEW/voice/words.json#" "src/episodes/$NEW/Short.tsx"
cp "episodes/$FROM/audio/mix.py" "episodes/$NEW/audio/mix.py"
echo "created src/episodes/$NEW (from $FROM) and episodes/$NEW"
