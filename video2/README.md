# Comercial nº 2 (storyboard + narração 2)

- `node video2/render.mjs video <v|h> video2/out/<x>_silent.mp4` renderiza (ou `still <v|h> <t> out.png`).
- `python3 video2/audio.py video2/out/mix.wav` mixa narração + trilha + efeitos.
- Mux: `ffmpeg -i x_silent.mp4 -i mix.wav -c:v copy -c:a aac -shortest saida.mp4`.
- Site exibido: `?url=` na página ou variável `URL_SITE`. Legendas têm tempo estimado por frase.
