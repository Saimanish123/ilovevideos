#!/usr/bin/env bash
# Person fixtures for the background tools (tests/e2e/blur-video-background.spec.ts): a real person
# cut out by hand, laid over varied backgrounds with known motion, plus the right answer (the mask)
# frame for frame. Never used in production. Run from scripts/make-fixtures.sh, or alone.
#
# Sources (tests/fixtures/person/), all free of copyright restrictions, taken from scikit-image's
# bundled sample data (skimage.data), whose docstrings state the licence:
# - astronaut-bust.png: Eileen Collins, NASA portrait, public domain ("No known copyright
#   restrictions, released into the public domain"). Cut to the head and shoulders (rows 0 to 335)
#   with OpenCV GrabCut from hand-placed seeds, then checked by eye at 3× zoom; the alpha is the cut.
# - coffee.jpg (CC0, Rachel Michetti), chelsea.jpg (CC0, Stefan van der Walt), grass.jpg (CC0,
#   DeviantArt linolafett), rocket.jpg (SpaceX, public domain), hubble.jpg (NASA, public domain).
# The mask videos are FFV1 (lossless): white where the person is, black elsewhere, with the cut's
# own anti-aliased edge where the scaler softened it; tests threshold it at half.
set -euo pipefail
cd "$(dirname "$0")/.."
P=tests/fixtures/person
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
q=(-hide_banner -loglevel error -y)

# One segment: background $1 fitted to $2x$3, the bust scaled to height $4, placed by x=$5, y=$6
# (ffmpeg expressions in t, seconds from the segment's start), $7 seconds long, then $9 (a filter,
# optional) on the picture alone. Writes the picture and its mask.
segment() {
  local bg=$1 W=$2 H=$3 bh=$4 x=$5 y=$6 d=$7 out=$8 post=${9:-null} bgsrc
  if [[ $bg == lavfi:* ]]; then bgsrc=(-f lavfi -i "${bg#lavfi:}"); else bgsrc=(-loop 1 -framerate 30 -i "$bg"); fi
  ffmpeg "${q[@]}" "${bgsrc[@]}" -loop 1 -framerate 30 -i "$P/astronaut-bust.png" -filter_complex "
    [0:v]scale=$W:$H:force_original_aspect_ratio=increase,crop=$W:$H,setsar=1,format=rgb24,fps=30[bg];
    [1:v]scale=-2:$bh:flags=bicubic,format=rgba,split[p][q];
    [q]lutrgb=r=255:g=255:b=255[w];
    color=black:s=${W}x$H:r=30,format=rgb24[k];
    [bg][p]overlay=x='$x':y='$y':eval=frame:format=rgb,$post,format=yuv420p[v];
    [k][w]overlay=x='$x':y='$y':eval=frame:format=rgb,format=gray[m]" \
    -map '[v]' -t "$d" -c:v libx264 -crf 12 -pix_fmt yuv420p "$tmp/$out.mp4" \
    -map '[m]' -t "$d" -c:v ffv1 "$tmp/$out-mask.mkv"
}

# 16:9, 640×360, 6 s: still over coffee (flicker on a still subject), swaying over rocket and over
# the Hubble field, then walking in from beyond the left edge over a moving gradient.
segment "$P/coffee.jpg" 640 360 300 91 60 1.5 a
segment "$P/rocket.jpg" 640 360 300 '91+60*sin(2*PI*t/1.5)' 60 1.5 b
segment "$P/hubble.jpg" 640 360 300 '91-50*sin(2*PI*t/1.5)' '60+10*sin(4*PI*t/1.5)' 1.5 c
segment "lavfi:gradients=s=640x360:r=30:speed=0.03:n=3" 640 360 280 '-200+330*t/1.5' 80 1.5 d
# 9:16, 360×640, 3 s: shoulders beyond both edges, as a phone selfie is framed.
segment "$P/chelsea.jpg" 360 640 400 '-125+20*sin(2*PI*t/1.5)' 240 1.5 e
segment "$P/grass.jpg" 360 640 400 '-125-30*sin(2*PI*t/1.5)' '240+12*sin(2*PI*t/1.5)' 1.5 f

# Low light, 640×360, 3 s: the same person still, then swaying, over the dim launch pad photo,
# darkened, with fresh sensor-like noise on every frame and a slight exposure flicker, as a webcam
# in a dim room gives. The model's answer wavers here; the steadying is measured on it.
dim="eq=brightness=-0.12:contrast=0.8:eval=frame:gamma='1+0.04*sin(2*PI*t*7)',noise=alls=22:allf=t"
segment "$P/rocket.jpg" 640 360 300 91 60 1.5 g "$dim"
segment "$P/rocket.jpg" 640 360 300 '91+40*sin(2*PI*t/1.5)' 60 1.5 h "$dim"

join() {
  local name=$1 ext=$2
  shift 2
  : >"$tmp/list.txt"
  for s in "$@"; do echo "file '$tmp/$s.$ext'" >>"$tmp/list.txt"; done
  if [[ $ext == mp4 ]]; then
    ffmpeg "${q[@]}" -f concat -safe 0 -i "$tmp/list.txt" -f lavfi -i "sine=frequency=330:duration=60" \
      -shortest -vf "scale=out_range=tv,format=yuv420p" -c:v libx264 -crf "${crf:-20}" -g 30 -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart "$P/$name.mp4"
  else
    ffmpeg "${q[@]}" -f concat -safe 0 -i "$tmp/list.txt" -c:v ffv1 "$P/$name.mkv"
  fi
}
join person-16x9 mp4 a b c d
join person-16x9-mask mkv a-mask b-mask c-mask d-mask
join person-9x16 mp4 e f
join person-9x16-mask mkv e-mask f-mask
crf=30 join person-lowlight mp4 g h
join person-lowlight-mask mkv g-mask h-mask
