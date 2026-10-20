#!/usr/bin/env python3
"""Mixagem do comercial: narração (original) + trilha ambiente sintetizada + efeitos sutis nos cortes. Só ffmpeg, sem arquivos externos."""
import subprocess, sys
DUR = 37.6
out = sys.argv[1] if len(sys.argv) > 1 else "video/out/mix.wav"
# (tempo, tipo, ganho)
cues = [(2.16, "whoosh", .5), (5.6, "whoosh", .45), (11.9, "riser", .55), (13.0, "impact", .9), (14.3, "whoosh", .5), (20.0, "whoosh", .38),
        (22.3, "whoosh", .34), (24.4, "whoosh", .34), (26.1, "whoosh", .4), (28.75, "ding", .5), (31.6, "impact", .6), (34.1, "ding", .55)]
syn = {
  "whoosh": "anoisesrc=color=pink:d=1.3:a=0.9,highpass=f=400,lowpass=f=5200,afade=t=in:d=0.55,afade=t=out:st=0.55:d=0.75",
  "riser": "aevalsrc='0.35*sin(2*PI*(180+520*t)*t)+0.18*sin(2*PI*(360+1040*t)*t)':d=1.1:s=44100,lowpass=f=4200,afade=t=in:d=0.9,afade=t=out:st=1.0:d=0.1",
  "impact": "aevalsrc='0.9*sin(2*PI*46*t)*exp(-2.4*t)+0.35*sin(2*PI*92*t)*exp(-3.2*t)':d=2.2:s=44100,lowpass=f=520",
  "ding": "aevalsrc='(0.55*sin(2*PI*1318.5*t)+0.3*sin(2*PI*1975.5*t)+0.12*sin(2*PI*2637*t))*exp(-3.6*t)':d=1.8:s=44100",
}
inputs = ["-i", "video/assets/narracao.mp3"]
fc = []
labels = []
for i, (t, kind, g) in enumerate(cues):
    inputs += ["-f", "lavfi", "-t", "2.3", "-i", syn[kind]]
    ms = int(t * 1000)
    fc.append(f"[{i+1}:a]aformat=sample_rates=44100:channel_layouts=mono,volume={g},adelay={ms}[s{i}]")
    labels.append(f"[s{i}]")
n = len(cues)
# trilha: acorde sustentado (Lá menor 9) com leve movimento; filtrada e baixa para ficar sob a voz
bed = ("aevalsrc='0.5*sin(2*PI*110*t)+0.35*sin(2*PI*164.8*t)+0.3*sin(2*PI*220*t)+0.22*sin(2*PI*261.6*t)+0.16*sin(2*PI*329.6*t)"
       "+0.1*sin(2*PI*(440+1.2*sin(2*PI*0.2*t))*t)':d=%s:s=44100,lowpass=f=1100,tremolo=f=0.18:d=0.35,volume=0.07,afade=t=in:d=2.5,afade=t=out:st=%s:d=2.2" % (DUR, DUR - 2.2))
inputs += ["-f", "lavfi", "-t", str(DUR), "-i", bed]
fc.append(f"[0:a]aformat=sample_rates=44100:channel_layouts=mono,apad=whole_dur={DUR},volume=1.0[vo]")
fc.append(f"[{n+1}:a]aformat=sample_rates=44100:channel_layouts=mono[bed]")
fc.append("[vo][bed]" + "".join(labels) + f"amix=inputs={n+2}:normalize=0:duration=longest,atrim=0:{DUR},loudnorm=I=-15:TP=-1.5:LRA=9,aresample=48000[a]")
cmd = ["ffmpeg", "-y", "-loglevel", "error"] + inputs + ["-filter_complex", ";".join(fc), "-map", "[a]", "-ac", "2", out]
subprocess.run(cmd, check=True)
print("ok", out)
