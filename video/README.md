# Comercial "SaldoUP" (37,6 s)

Narração: `assets/narracao.mp3` (a sua, do ElevenLabs). Imagens: telas **reais** do aplicativo com dados fictícios (`assets/*.webp`, geradas por `scripts/landing-shots.mjs`).

- `index.html` — o filme inteiro como uma linha do tempo determinística (`render(t)`): textos, telas, transições, legendas.
- `audio.py` — mixagem: narração + trilha ambiente sintetizada + efeitos sutis nos cortes (só ffmpeg).
- `render.mjs` / `render_all.sh` — desenha cada quadro (30 fps) e codifica em H.264 + AAC.
- `out/saldoup_vertical_1080x1920.mp4` (Reels/Stories/TikTok) e `out/saldoup_horizontal_1920x1080.mp4` (site/YouTube).

Refazer: `python3 video/audio.py video/out/mix.wav && video/render_all.sh` (≈ 12 min). Pré-visualizar um instante: `node video/render.mjs still v 21.2 /tmp/quadro.png`.
Endereço mostrado no final: `URL_SITE` no `index.html` (ou `?url=` na URL). Nome da marca: `BRAND`/`logoHTML` (no vídeo é "SaldoUP", como na narração; no app e na landing está "Finance OS").
Para trocar a trilha: substitua o trecho `bed` em `audio.py` por um arquivo seu (`-i trilha.mp3`) com volume baixo.
