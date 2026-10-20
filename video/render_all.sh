#!/bin/bash
# Renderiza as duas versões e junta com o áudio mixado (python3 video/audio.py gera video/out/mix.wav).
set -e
cd "$(dirname "$0")/.."
node video/render.mjs video v video/out/saldoup_v_silent.mp4 30
ffmpeg -y -loglevel error -i video/out/saldoup_v_silent.mp4 -i video/out/mix.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart video/out/saldoup_vertical_1080x1920.mp4
echo "VERTICAL_OK"
node video/render.mjs video h video/out/saldoup_h_silent.mp4 30
ffmpeg -y -loglevel error -i video/out/saldoup_h_silent.mp4 -i video/out/mix.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart video/out/saldoup_horizontal_1920x1080.mp4
echo "HORIZONTAL_OK"
