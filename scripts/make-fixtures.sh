#!/usr/bin/env bash
# Generates tiny media fixtures for engine tests with the local ffmpeg. Never used in production.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p tests/fixtures
common=(-hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=640x360:rate=30:duration=3" -f lavfi -i "sine=frequency=440:duration=3" -shortest -pix_fmt yuv420p)
ffmpeg "${common[@]}" -c:v libx264 -profile:v baseline -g 30 -b:v 600k -c:a aac -b:a 96k -movflags +faststart tests/fixtures/sample.mp4
ffmpeg "${common[@]}" -c:v libx264 -profile:v baseline -g 30 -b:v 600k -c:a aac -b:a 96k tests/fixtures/sample.mov

ffmpeg "${common[@]}" -c:v libx264 -profile:v baseline -g 30 -b:v 600k -c:a aac -b:a 96k tests/fixtures/sample.mkv
ffmpeg "${common[@]}" -c:v libvpx-vp9 -b:v 600k -deadline realtime -cpu-used 8 -c:a libopus -b:a 96k tests/fixtures/sample.webm
ffmpeg "${common[@]}" -c:v mpeg4 -q:v 4 -c:a libmp3lame -b:a 96k tests/fixtures/sample.avi
ffmpeg "${common[@]}" -c:v wmv2 -q:v 4 -c:a wmav2 -b:a 96k tests/fixtures/sample.wmv
# MP4 holding Opus (legal in MP4, not in MOV): converting it to MOV must re-encode the sound to AAC.
ffmpeg -hide_banner -loglevel error -y -i tests/fixtures/sample.mp4 -c:v copy -c:a libopus -b:a 96k tests/fixtures/sample-opus.mp4
# M4V as iTunes sells them: AAC plus a second AC-3 track. MP4 output copies the AAC and leaves the AC-3 out.
ffmpeg -hide_banner -loglevel error -y -i tests/fixtures/sample.mp4 -f lavfi -i "sine=frequency=660:duration=3:sample_rate=48000" \
  -map 0:v -map 0:a -map 1:a -c:v copy -c:a:0 copy -c:a:1 ac3 -ac:a:1 2 -f mp4 tests/fixtures/sample-ac3.m4v
# Interlaced (top field first) H.264 in MPEG-TS, as broadcast and AVCHD 576i: the inspector must report 720×576.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=720x576:rate=50,tinterlace=interleave_top,fieldorder=tff" -f lavfi -i "sine=frequency=440:duration=1" \
  -t 1 -c:v libx264 -flags +ildct+ilme -x264opts tff=1 -pix_fmt yuv420p -b:v 400k -c:a aac -b:a 64k -f mpegts tests/fixtures/sample-interlaced.m2t
# Loud 16-bit big-endian PCM in MOV (peaks near 0.9 of full scale): MOV to WAV re-encodes the PCM and must be bit exact.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=320x180:rate=30:duration=2" -f lavfi -i "sine=frequency=440:duration=2,volume=7" \
  -shortest -pix_fmt yuv420p -c:v libx264 -g 30 -b:v 200k -c:a pcm_s16be tests/fixtures/sample-pcm.mov
# Merge timing: clicks every 100 ms (from 0 ms, 3 s; from 50 ms, 2 s), encoded alike so they join losslessly.
for spec in "sample-clicks.mp4 3 0" "sample-clicks-b.mp4 2 2205"; do
  set -- $spec
  ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=640x360:rate=30:duration=$2" \
    -f lavfi -i "aevalsrc='if(lt(mod(n-$3\,4410)\,32)*gte(n\,$3)\,0.6*sin(2*PI*n/8)\,0)':s=44100:d=$2" \
    -shortest -pix_fmt yuv420p -c:v libx264 -profile:v baseline -g 30 -b:v 600k -c:a aac -b:a 96k -movflags +faststart "tests/fixtures/$1"
done
# Tagged copy for the remove-metadata tests: title, comment, creation time and a GPS location as phones write it.
ffmpeg -hide_banner -loglevel error -y -i tests/fixtures/sample.mp4 -c copy -movflags +faststart \
  -metadata title="Holiday clip" -metadata comment="shot on the beach" \
  -metadata creation_time="2026-08-01T10:00:00Z" -metadata location="+48.8584+002.2945/" \
  tests/fixtures/sample-tagged.mp4
# Remove-audio settled case (no audio track) and rotate/info with a phone-style 90° rotation flag.
ffmpeg -hide_banner -loglevel error -y -i tests/fixtures/sample.mp4 -an -c copy tests/fixtures/sample-silent.mp4
ffmpeg -hide_banner -loglevel error -y -display_rotation 90 -i tests/fixtures/sample.mp4 -c copy tests/fixtures/sample-rotated.mp4
# Merge tests: sample-b.mp4 matches sample.mp4 stream for stream (lossless join); sample-square.mp4
# differs in size, frame rate and audio (square 480×480, 25 fps, 48 kHz mono) so the join re-encodes.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=640x360:rate=30:duration=2,negate" -f lavfi -i "sine=frequency=660:duration=2" \
  -shortest -pix_fmt yuv420p -c:v libx264 -profile:v baseline -g 30 -b:v 600k -c:a aac -b:a 96k -movflags +faststart tests/fixtures/sample-b.mp4
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc=size=480x480:rate=25:duration=2" -f lavfi -i "sine=frequency=330:sample_rate=48000:duration=2" \
  -shortest -pix_fmt yuv420p -ac 1 -c:v libx264 -profile:v main -g 25 -b:v 500k -c:a aac -b:a 64k -movflags +faststart tests/fixtures/sample-square.mp4
# Size-target tests: about 12 MB of hard-to-compress 720p (grain over the test pattern), so it sits over
# the 8 MB and 10 MB targets and the encoder has to work to hit them.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=1280x720:rate=30:duration=12,noise=alls=24:allf=t" -f lavfi -i "sine=frequency=440:duration=12" \
  -shortest -pix_fmt yuv420p -c:v libx264 -preset veryfast -b:v 8M -minrate 8M -maxrate 8M -bufsize 8M -c:a aac -b:a 128k -movflags +faststart tests/fixtures/sample-large.mp4
# Audio tests (convert-audio, add-audio): 4 s of two tones, left 440 Hz and right 660 Hz, swelling
# at 0.5 Hz so the waveform has a shape; tagged MP3 for the tag carry-over check; a 1 s clip for looping.
# Vorbis uses ffmpeg's own encoder (-strict -2) because Homebrew ffmpeg ships without libvorbis.
tone="aevalsrc=0.7*sin(2*PI*440*t)*(0.55+0.45*sin(2*PI*0.5*t))|0.7*sin(2*PI*660*t)*(0.55+0.45*sin(2*PI*0.5*t)):s=44100:d=4"
audio=(-hide_banner -loglevel error -y -f lavfi -i "$tone")
ffmpeg "${audio[@]}" -c:a libmp3lame -b:a 128k -metadata title="Two tones" -metadata artist="Test signal" tests/fixtures/sample.mp3
ffmpeg "${audio[@]}" -c:a pcm_s16le tests/fixtures/sample.wav
ffmpeg "${audio[@]}" -c:a flac -sample_fmt s16 tests/fixtures/sample.flac
# FLAC whose last frame is 15 bytes: 88 064 samples of tones, then a 140-sample partial frame held at
# +0.25/-0.25 (two constant subframes). mediabunny 1.55.5 stops before a frame under 16 bytes.
ffmpeg -hide_banner -loglevel error -y -f lavfi \
  -i "aevalsrc='if(gte(n,88064),0.25,0.5*sin(2*PI*440*n/44100))|if(gte(n,88064),-0.25,0.5*sin(2*PI*660*n/44100))':s=44100:d=2.0001" \
  -c:a flac -sample_fmt s16 tests/fixtures/sample-flac-tail.flac
ffmpeg "${audio[@]}" -c:a vorbis -strict -2 tests/fixtures/sample.ogg
ffmpeg "${audio[@]}" -c:a libopus -b:a 96k tests/fixtures/sample.opus
ffmpeg "${audio[@]}" -c:a aac -b:a 128k -movflags +faststart tests/fixtures/sample.m4a
ffmpeg "${audio[@]}" -c:a aac -b:a 128k -f adts tests/fixtures/sample.aac
ffmpeg "${audio[@]}" -c:a pcm_s16be tests/fixtures/sample.aiff
ffmpeg "${audio[@]}" -c:a wmav2 -b:a 128k tests/fixtures/sample.wma
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "sine=frequency=880:sample_rate=44100:duration=1" -c:a libmp3lame -b:a 128k tests/fixtures/sample-loop.mp3
# Formats and families (gif-to-mp4, legacy pairs, resize for platform):
# an animated GIF with odd edges (301×201 → 300×200), 20 frames at 10 hundredths, looping forever;
# FLV and MPEG-TS (.m2t and .m2ts: .ts and .mts fixtures would be read as TypeScript) holding H.264 + AAC (remux sources); 3GP with H.263 + AAC (ffmpeg-only codec in a
# native container); MPEG-2 program stream and DVD VOB (ffmpeg-only); an AVCHD-style M2TS with AC-3;
# a 1440×2560 vertical clip for the size-cap path.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc=size=301x201:rate=10:duration=2" \
  -vf "split[a][b];[a]palettegen[p];[b][p]paletteuse" -loop 0 tests/fixtures/sample.gif
ffmpeg "${common[@]}" -c:v libx264 -profile:v baseline -g 30 -b:v 600k -c:a aac -b:a 96k tests/fixtures/sample.flv
ffmpeg "${common[@]}" -c:v libx264 -profile:v baseline -g 30 -b:v 600k -c:a aac -b:a 96k -f mpegts tests/fixtures/sample.m2t
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=176x144:rate=15:duration=3" -f lavfi -i "sine=frequency=440:duration=3" \
  -shortest -pix_fmt yuv420p -c:v h263 -b:v 200k -c:a aac -b:a 32k -ar 16000 -ac 1 tests/fixtures/sample.3gp
ffmpeg "${common[@]}" -c:v mpeg2video -q:v 4 -c:a mp2 -b:a 128k -f mpeg tests/fixtures/sample.mpg
ffmpeg "${common[@]}" -c:v mpeg2video -q:v 4 -c:a ac3 -b:a 128k -ar 48000 -f vob tests/fixtures/sample.vob
ffmpeg "${common[@]}" -c:v libx264 -profile:v main -g 30 -b:v 600k -c:a ac3 -b:a 128k -ar 48000 -f mpegts -mpegts_m2ts_mode 1 tests/fixtures/sample.m2ts
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=1440x2560:rate=30:duration=1" -f lavfi -i "sine=frequency=440:duration=1" \
  -shortest -pix_fmt yuv420p -c:v libx264 -profile:v high -g 30 -b:v 2M -c:a aac -b:a 96k -movflags +faststart tests/fixtures/sample-vertical.mp4
# Watermark tests: a 200×80 logo with a transparent border (alpha 0) around a white box with a black bar.
# Drawn in RGB first, then padded with transparent pixels; drawbox on an RGBA frame would leave alpha at 0.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "color=c=white:s=168x48,drawbox=x=24:y=12:w=120:h=24:color=black:t=fill,format=rgba,pad=200:80:16:16:color=black@0" \
  -frames:v 1 tests/fixtures/logo.png
# Audio tracks (select audio tracks): an MKV with three languages (English AAC stereo, French AAC
# stereo, an English commentary in Opus) and an MP4 with two AAC tracks, each tagged and titled.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=320x180:rate=25:duration=2" \
  -f lavfi -i "sine=frequency=440:duration=2" -f lavfi -i "sine=frequency=660:duration=2" -f lavfi -i "sine=frequency=880:duration=2" \
  -map 0:v -map 1:a -map 2:a -map 3:a -shortest -pix_fmt yuv420p -c:v libx264 -g 25 -b:v 200k \
  -c:a:0 aac -ac:a:0 2 -c:a:1 aac -ac:a:1 2 -c:a:2 libopus -ac:a:2 1 -b:a 64k \
  -metadata:s:a:0 language=eng -metadata:s:a:0 title="English" -metadata:s:a:1 language=fra -metadata:s:a:1 title="Français" \
  -metadata:s:a:2 language=eng -metadata:s:a:2 title="Commentary" -disposition:a:0 default -disposition:a:1 0 -disposition:a:2 0 \
  tests/fixtures/sample-tracks.mkv
ffmpeg -hide_banner -loglevel error -y -i tests/fixtures/sample-tracks.mkv -map 0:v -map 0:a:0 -map 0:a:1 -c copy -movflags +faststart tests/fixtures/sample-tracks.mp4
# Remove silence: 8 s of a 300 Hz "voice" with pauses of 0.8 s (1.5–2.3), 0.3 s (3.5–3.8) and
# 1.2 s (5.0–6.2) over a faint noise floor; as WAV and as an H.264/AAC MP4 with a counter picture.
pauses="aevalsrc=0.3*sin(2*PI*300*t)*(between(t\,0\,1.5)+between(t\,2.3\,3.5)+between(t\,3.8\,5)+between(t\,6.2\,8))+0.002*(random(0)-0.5):s=44100:d=8"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "$pauses" -c:a pcm_s16le tests/fixtures/sample-pauses.wav
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=320x180:rate=25:duration=8" -i tests/fixtures/sample-pauses.wav \
  -shortest -pix_fmt yuv420p -c:v libx264 -g 25 -b:v 300k -c:a aac -b:a 96k -movflags +faststart tests/fixtures/sample-pauses.mp4
ls -la tests/fixtures
# Extract subtitles: soft tracks as ffmpeg writes them. MKV with SRT (English, named, default) and
# ASS (French, forced); MP4 with two mov_text (tx3g) tracks, one with italics in a style box; WebM
# with a WebVTT track (D_WEBVTT/SUBTITLES).
S=tests/fixtures/subtitles
ffmpeg -hide_banner -loglevel error -y -i tests/fixtures/sample.mp4 -i $S/sample.srt -i $S/styled.ass -map 0:v -map 0:a -map 1 -map 2 \
  -c:v copy -c:a copy -c:s:0 srt -c:s:1 ass -metadata:s:s:0 language=eng -metadata:s:s:0 title="English" -metadata:s:s:1 language=fre \
  -disposition:s:0 default -disposition:s:1 forced tests/fixtures/sample-subs.mkv
ffmpeg -hide_banner -loglevel error -y -i tests/fixtures/sample.mp4 -i $S/sample.srt -i $S/web.vtt -map 0:v -map 0:a -map 1 -map 2 \
  -c:v copy -c:a copy -c:s mov_text -metadata:s:s:0 language=eng -metadata:s:s:1 language=spa -movflags +faststart tests/fixtures/sample-subs.mp4
ffmpeg -hide_banner -loglevel error -y -i tests/fixtures/sample.webm -i $S/web.vtt -map 0:v -map 0:a -map 1 \
  -c:v copy -c:a copy -c:s webvtt -metadata:s:s:0 language=eng tests/fixtures/sample-subs.webm
# Change frame rate: 2 s of 60 fps (a phone's smooth mode) with AAC, index at the end as cameras write it,
# so 60 → 30 and fast start both have a real case.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=640x360:rate=60:duration=2" -f lavfi -i "sine=frequency=550:duration=2" \
  -shortest -pix_fmt yuv420p -c:v libx264 -profile:v high -g 60 -b:v 800k -c:a aac -b:a 96k tests/fixtures/sample-60fps.mp4
# Images to video and audio to video: three stills of different shapes and formats (landscape JPEG,
# portrait PNG, wide GIF whose first frame is used), each a distinct pattern so frames can be told apart.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=800x600" -frames:v 1 -q:v 3 tests/fixtures/slide-1.jpg
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc=size=600x800" -frames:v 1 tests/fixtures/slide-2.png
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "smptebars=size=1000x500" -frames:v 1 tests/fixtures/slide-3.gif
# QA 2026-10-08 (ffmpeg path, MPEG-TS, failures):
L=(-hide_banner -loglevel error -y)
V2=(-f lavfi -i "testsrc2=size=320x180:rate=25:duration=2")
# Two AC-3 tracks (eng, fra) in MKV: MP4 output must keep both, re-encoded to AAC, with their languages.
ffmpeg "${L[@]}" "${V2[@]}" -f lavfi -i "sine=frequency=440:duration=2:sample_rate=48000" -f lavfi -i "sine=frequency=660:duration=2:sample_rate=48000" \
  -map 0:v -map 1:a -map 2:a -shortest -pix_fmt yuv420p -c:v libx264 -g 25 -b:v 200k -c:a ac3 -b:a 64k \
  -metadata:s:a:0 language=eng -metadata:s:a:1 language=fra tests/fixtures/sample-ac3-tracks.mkv
# MPEG-4 Part 2 with FLAC in MKV: only ffmpeg.wasm reads the picture; FLAC is copied into MP4 (needs -strict -2 in FFmpeg 5.1).
ffmpeg "${L[@]}" -f lavfi -i "testsrc2=size=320x180:rate=25:duration=1" -f lavfi -i "sine=frequency=440:duration=1:sample_rate=48000" \
  -shortest -pix_fmt yuv420p -c:v mpeg4 -q:v 8 -c:a flac tests/fixtures/sample-mpeg4-flac.mkv
# 192-byte-packet M2TS (AVCHD/Blu-ray mode): ffmpeg files the AAC as private data (stream_type 0x06, no descriptor).
ffmpeg "${L[@]}" "${V2[@]}" -f lavfi -i "sine=frequency=440:duration=2:sample_rate=48000" -shortest -pix_fmt yuv420p \
  -c:v libx264 -g 25 -b:v 200k -c:a aac -b:a 64k -f mpegts -mpegts_m2ts_mode 1 tests/fixtures/sample-aac192.m2ts
# A recording cut off before its index was written: the first 60% of an MP4 whose moov is at the end.
tmp="$(mktemp -d)"
ffmpeg "${L[@]}" "${V2[@]}" -f lavfi -i "sine=frequency=440:duration=2:sample_rate=48000" -shortest -pix_fmt yuv420p \
  -c:v libx264 -g 25 -b:v 200k -c:a aac -b:a 64k "$tmp/full.mp4"
size=$(wc -c < "$tmp/full.mp4"); head -c $((size * 6 / 10)) "$tmp/full.mp4" > tests/fixtures/sample-nomoov.mp4; rm -r "$tmp"
# Theora in Ogg (sample.ogv, 640×360, 25 fps, Vorbis) was written by the site's own converter (ffmpeg.wasm
# libtheora), as Homebrew's ffmpeg has no Theora encoder. mediabunny does not list the stream; the inspector
# reads its header.
# 96 kHz WAV: Vorbis (OGG) at a bitrate has no tables above 48 kHz, so the converter resamples to 48 kHz.
ffmpeg "${L[@]}" -f lavfi -i "sine=frequency=440:duration=0.5:sample_rate=96000" -c:a pcm_s16le tests/fixtures/sample-96k.wav
# Frames that carry their index (two grey levels, 16 steps each) for change speed's frame mapping, with AAC.
ffmpeg "${L[@]}" -f lavfi -i "color=black:s=320x180:r=30:d=2,format=gray,geq=lum='if(lt(X\,160)\,mod(N\,16)*16+8\,floor(N/16)*16+8)'" \
  -f lavfi -i "sine=frequency=1000:sample_rate=48000:duration=2" -shortest -pix_fmt yuv420p -c:v libx264 -crf 10 \
  -c:a aac -b:a 64k tests/fixtures/sample-indexed.mp4
# Matroska CodecDelay (ffmpeg writes AAC's 1024 and MP3's 1105 samples there): FFmpeg 5.1 ignores it
# for everything but Opus, so extracting the sound must drop it on the page.
ffmpeg "${L[@]}" -i tests/fixtures/sample-clicks.mp4 -c copy tests/fixtures/sample-clicks.mkv
ffmpeg "${L[@]}" -i tests/fixtures/sample-clicks.mp4 -c:v copy -c:a libmp3lame -b:a 96k tests/fixtures/sample-clicks-mp3.mkv
# Odd size (641×361), VP9 at 300 kb/s and Opus in WebM: H.264 needs even edges, so picture re-encodes
# write 640×360 (the last column and row cut, never scaled); the bitrate cap follows the source's 300 kb/s.
ffmpeg "${L[@]}" -f lavfi -i "testsrc=size=641x361:rate=30:duration=3" -f lavfi -i "sine=frequency=440:duration=3:sample_rate=48000" \
  -shortest -pix_fmt yuv420p -c:v libvpx-vp9 -b:v 300k -deadline good -cpu-used 4 -g 30 -c:a libopus -b:a 64k tests/fixtures/sample-odd.webm
# Untagged standard definition (640×480 colour bars, BT.601 pixels, no colour tags): outputs must say BT.601
# (smpte170m), not the BT.709 Chromium's decoder assumes for every untagged picture.
ffmpeg "${L[@]}" -f lavfi -i "smptehdbars=size=640x480:rate=30:duration=2" -f lavfi -i "sine=frequency=440:duration=2:sample_rate=48000" \
  -shortest -vf "scale=out_color_matrix=bt601:out_range=tv,setparams=color_primaries=unknown:color_trc=unknown:colorspace=unknown" \
  -pix_fmt yuv420p -c:v libx264 -g 30 -b:v 1500k -c:a aac -b:a 64k -movflags +faststart tests/fixtures/sample-sd-untagged.mp4
# sample-odd.webm (641×361 VP9 + Opus, 3 s) is QA's fixture from 2026-10-08: lavfi sources here round
# odd sizes to even before libvpx, so it is kept as a file. H.264 needs an even size; a failure must
# name the codec asked for.
# Regions and layers (blur, add image, green screen). The PNGs are drawn by Chromium
# (scripts/make-overlay-fixtures.mjs) since this ffmpeg has no text renderer.
node scripts/make-overlay-fixtures.mjs
O=tests/fixtures/overlay
# A number plate on a still grey picture, two versions that differ only in their letters: blurring
# both with the same region must leave no measurable trace of which letters were there.
for p in a b; do
  ffmpeg -hide_banner -loglevel error -y -f lavfi -i "color=c=0x6e6e6e:size=640x360:rate=30:duration=3" -i $O/plate-$p.png \
    -f lavfi -i "sine=frequency=440:duration=3" -filter_complex "[0:v][1:v]overlay=210:148,format=yuv420p[v]" -map "[v]" -map 2:a \
    -c:v libx264 -preset slow -crf 16 -g 30 -c:a aac -b:a 96k -shortest -movflags +faststart $O/plate-$p.mp4
done
# The plate moving left to right at 100 px/s over the test pattern (x = 100 + 100 t), for key frames.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=640x360:rate=30:duration=3" -loop 1 -i $O/plate-a.png \
  -filter_complex "[0:v][1:v]overlay=x='100+100*t':y=148:shortest=1,format=yuv420p[v]" -map "[v]" \
  -c:v libx264 -preset slow -crf 16 -g 30 -an -movflags +faststart $O/plate-moving.mp4
# Animated stickers that blink black then white, half a second each, as GIF and as APNG.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "color=black:s=80x80:r=2:d=0.5" -f lavfi -i "color=white:s=80x80:r=2:d=0.5" \
  -filter_complex "[0][1]concat=n=2:v=1,split[g][p];[g]split[g1][g2];[g1]palettegen=reserve_transparent=0[pal];[g2][pal]paletteuse[gif]" \
  -map "[gif]" -loop 0 $O/blink.gif -map "[p]" -plays 0 -f apng $O/blink-apng.png
# Green screen: a synthetic shot with a known answer (tests/e2e/greenscreen-scene.ts).
pnpm -s tsx scripts/make-greenscreen-fixture.ts
# Key and BPM finder, change pitch, ringtone and merge audio (round 3, sound): synthetic music with a
# known tempo and key (scripts/synth-music.ts: kick, clap, hats, bass and chords; no copyrighted audio).
# 128 BPM in A minor (MP3), 90 BPM in E-flat major (M4A), and a tempo moving from 116 to 124 BPM in
# D major (MP3) whose average is 120.
music() {
  local tmp; tmp="$(mktemp -t music).wav"
  npx tsx scripts/synth-music.ts "$1" "$2" "$3" "$4" "$5" "$tmp"
  shift 5
  ffmpeg -hide_banner -loglevel error -y -i "$tmp" "$@"
  rm -f "$tmp"
}
music 128 128 9 minor 24 -c:a libmp3lame -b:a 160k tests/fixtures/music-128-a-minor.mp3
music 90 90 3 major 24 -c:a aac -b:a 160k -movflags +faststart tests/fixtures/music-90-e-flat-major.m4a
music 116 124 2 major 48 -c:a libmp3lame -b:a 128k tests/fixtures/music-116-124-d-major.mp3
# Merge audio: a 48 kHz mono WAV (to join with the 44.1 kHz stereo sample.wav) and a second MP3 encoded
# like sample.mp3 (same rate, layout and bitrate) so two MP3s can be joined by packet copy.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "sine=frequency=330:sample_rate=48000:duration=2" -c:a pcm_s16le tests/fixtures/sample-48k-mono.wav
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "aevalsrc=0.5*sin(2*PI*550*t)|0.5*sin(2*PI*550*t):s=44100:d=3" -c:a libmp3lame -b:a 128k tests/fixtures/sample-b.mp3
# Recorders (ADR-0099): a fake camera and microphone for Chromium's --use-file-for-fake-*-capture, a
# white flash and a 1 kHz click at the start of every second, for measuring sound-to-picture sync.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "color=c=black:s=160x90:r=30:d=2,geq=lum='if(lt(mod(T\,1)\,0.1)\,235\,16)':cb=128:cr=128" -pix_fmt yuv420p tests/fixtures/capture-sync.y4m
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "aevalsrc='if(lt(mod(t\,1)\,0.01)\,0.8*sin(2*PI*1000*t)\,0)':s=48000:d=2" -ac 1 -c:a pcm_s16le tests/fixtures/capture-sync.wav
# Clips for short-video platforms (cut-video-into-shorts): 18 s at 320×180, a scene change at 8 s
# (the moving pattern, then still colour bars) and a 440 Hz tone over a -60 dB noise floor with
# pauses at 4.0–4.6, 11.0–11.6 and 14.0–14.5 s. Kept under 20 s: headless Chromium stalls the
# sound analysis worker on longer videos (headed Chromium does not; see the round 3 report).
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=size=320x180:rate=30:duration=8" -f lavfi -i "smptebars=size=320x180:rate=30:duration=10" \
  -f lavfi -i "aevalsrc='0.001*(random(0)-0.5)+0.25*sin(2*PI*440*t)*not(between(t,4,4.6)+between(t,11,11.6)+between(t,14,14.5))':s=44100:d=18" \
  -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0,format=yuv420p[v]" -map "[v]" -map 2:a \
  -c:v libx264 -preset veryfast -g 30 -b:v 200k -c:a aac -b:a 64k -movflags +faststart tests/fixtures/sample-clips.mp4
# Text and time on the picture (builder B): 3 s of flat grey at 640×360, 30 fps, with a tone, so a
# progress bar's length and a timer's digits can be read back from every frame without footage
# behind them; and the same at 25 fps and 1 s for an intro clip of another size and rate.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "color=c=0x404040:s=640x360:r=30:d=3" -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=3" \
  -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 96k -shortest -movflags +faststart tests/fixtures/sample-flat.mp4
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "color=c=0xc0c0c0:s=480x480:r=25:d=1" -f lavfi -i "sine=frequency=880:sample_rate=44100:duration=1" \
  -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 96k -ac 1 -shortest -movflags +faststart tests/fixtures/sample-intro.mp4
# Thumbnail maker (ADR-0098): 1.5 s of black, 2.5 s of a moving test pattern, 2 s of colour bars,
# so suggestions must skip the black and come from both scenes.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "color=c=black:s=320x180:r=30:d=1.5" -f lavfi -i "testsrc2=s=320x180:r=30:d=2.5" \
  -f lavfi -i "smptebars=s=320x180:r=30:d=2" -filter_complex "[0][1][2]concat=n=3:v=1:a=0,format=yuv420p" -c:v libx264 -crf 20 -g 30 tests/fixtures/sample-fade.mp4
# Picture quality (builder D): sample-grainy.mp4 (denoise), sample-soft.mp4 (sharpen),
# sample-shaky.mp4 (stabilize) and sample-letterbox.mp4 (remove black bars), drawn over a
# dead-leaves texture by scripts/make-quality-fixtures.mjs (deterministic).
node scripts/make-quality-fixtures.mjs
