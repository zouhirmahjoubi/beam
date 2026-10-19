#!/usr/bin/env bash
# Dev-only: plays First Light in the emulator with the right hand and prints
# the board state after each move. Needs `iwsdk dev up --allow-browser-automation`.
set -euo pipefail
cd "$(dirname "$0")/.."
cli() { npx @iwsdk/cli "$@" 2>&1; }
probe() { cli browser run tools/probe.mjs | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).data.result;console.log(JSON.stringify(r))})'; }
field() { node -e "const r=JSON.parse(process.argv[1]);console.log(eval('r.'+process.argv[2]))" "$1" "$2"; }

if ! cli xr status | grep -q '"sessionActive": true'; then cli xr enter >/dev/null; fi
cli xr set-input-mode --input-json '{"mode":"hand"}' >/dev/null
sleep 5
state=$(probe); echo "start: $state"
bx=$(field "$state" 'boardAt[0]'); by=$(field "$state" 'boardAt[1]'); bz=$(field "$state" 'boardAt[2]')

# World position of a board cell at mirror-knob height (board yaw is 0 in the emulator).
cell() { node -e "const [c,r]=[+process.argv[1],+process.argv[2]];console.log(JSON.stringify({x:$bx+(c-2.5)*0.06,y:$by+0.012+0.03,z:$bz+(r-2.5)*0.06}))" "$1" "$2"; }

move_mirror() { # index col row yaw
  local m from to
  m=$(probe)
  # The emulated pinch point sits about 7 cm behind the hand pose (+z), so aim the
  # hand pose 7 cm in front of the piece, rotated with the hand's yaw.
  from=$(node -e "const r=JSON.parse(process.argv[1]);const p=r.mirrors[$1];console.log(JSON.stringify({x:p[0],y:p[1]+0.03,z:p[2]-0.07}))" "$m")
  to=$(node -e "const c=JSON.parse(process.argv[1]);const a=$4*Math.PI/180;console.log(JSON.stringify({x:c.x-0.07*Math.sin(a),y:c.y,z:c.z-0.07*Math.cos(a)}))" "$(cell "$2" "$3")")
  cli xr set-transform --input-json "{\"device\":\"hand-right\",\"position\":$from,\"orientation\":{\"pitch\":0,\"yaw\":0,\"roll\":0}}" >/dev/null
  sleep 0.5
  cli xr set-select-value --input-json '{"device":"hand-right","value":1}' >/dev/null
  sleep 0.5
  echo "pinched $1: $(probe)"
  cli xr animate-to --input-json "{\"device\":\"hand-right\",\"position\":$to,\"orientation\":{\"pitch\":0,\"yaw\":$4,\"roll\":0},\"duration\":0.8}" >/dev/null
  sleep 1.5
  echo "holding over ($2,$3): $(probe)"
  cli xr set-select-value --input-json '{"device":"hand-right","value":0}' >/dev/null
  sleep 0.5
  echo "released: $(probe)"
}

move_mirror 0 2 4 45
move_mirror 1 2 1 45
