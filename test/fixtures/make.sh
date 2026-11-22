#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
out=media
mkdir -p "$out"

video() {
  local h=$1 w=$2
  [ -f "$out/v$h.mp4" ] && return
  ffmpeg -loglevel error -y \
    -f lavfi -i "testsrc2=size=${w}x${h}:rate=15:duration=60" \
    -f lavfi -i "sine=frequency=440:duration=60" \
    -c:v libx264 -preset ultrafast -crf 40 -g 30 -pix_fmt yuv420p \
    -c:a aac -b:a 32k -shortest -movflags +faststart "$out/v$h.mp4"
}

video 360 640
video 720 1280
video 1080 1920

[ -f "$out/audio-only.mp4" ] || ffmpeg -loglevel error -y \
  -f lavfi -i "sine=frequency=220:duration=60" \
  -c:a aac -b:a 32k -movflags +faststart "$out/audio-only.mp4"

if [ ! -f "$out/hls/master.m3u8" ]; then
  for h in 360 720 1080; do
    mkdir -p "$out/hls/$h"
    ffmpeg -loglevel error -y -i "$out/v$h.mp4" -c copy -f hls -hls_time 4 -hls_playlist_type vod \
      -hls_segment_filename "$out/hls/$h/seg%03d.ts" "$out/hls/$h/index.m3u8"
  done
  cat > "$out/hls/master.m3u8" <<'M3U8'
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080,CODECS="avc1.42c028,mp4a.40.2"
1080/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720,CODECS="avc1.42c01f,mp4a.40.2"
720/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360,CODECS="avc1.42c016,mp4a.40.2"
360/index.m3u8
M3U8
fi

if [ ! -f "$out/dash/manifest.mpd" ]; then
  mkdir -p "$out/dash"
  ffmpeg -loglevel error -y -i "$out/v360.mp4" -i "$out/v720.mp4" -i "$out/v1080.mp4" \
    -map 0:v -map 1:v -map 2:v -map 0:a -c copy -f dash -seg_duration 4 -use_template 1 -use_timeline 0 \
    -adaptation_sets "id=0,streams=v id=1,streams=a" "$out/dash/manifest.mpd"
fi

[ -f "$out/short.mp4" ] || ffmpeg -loglevel error -y \
  -f lavfi -i "testsrc2=size=640x360:rate=15:duration=10" \
  -f lavfi -i "sine=frequency=660:duration=10" \
  -c:v libx264 -preset ultrafast -crf 40 -g 30 -pix_fmt yuv420p \
  -c:a aac -b:a 32k -shortest -movflags +faststart "$out/short.mp4"

if [ ! -f "$out/hls-fmp4/master.m3u8" ]; then
  for h in 360 720; do
    mkdir -p "$out/hls-fmp4/$h"
    (cd "$out/hls-fmp4/$h" && ffmpeg -loglevel error -y -i "../../v$h.mp4" -map 0:v -c copy -f hls -hls_time 4 -hls_playlist_type vod \
      -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 -hls_segment_filename "seg%03d.m4s" index.m3u8)
  done
  mkdir -p "$out/hls-fmp4/audio"
  (cd "$out/hls-fmp4/audio" && ffmpeg -loglevel error -y -i ../../v360.mp4 -map 0:a -c copy -f hls -hls_time 4 -hls_playlist_type vod \
    -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 -hls_segment_filename "seg%03d.m4s" index.m3u8)
  cat > "$out/hls-fmp4/master.m3u8" <<'M3U8'
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,URI="audio/index.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720,CODECS="avc1.42c01f,mp4a.40.2",AUDIO="aud"
720/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360,CODECS="avc1.42c016,mp4a.40.2",AUDIO="aud"
360/index.m3u8
M3U8
fi

[ -f "$out/frag.mp4" ] || ffmpeg -loglevel error -y -i "$out/short.mp4" -c copy \
  -movflags frag_keyframe+empty_moov+default_base_moof "$out/frag.mp4"

[ -f "$out/frag-mid.mp4" ] || ffmpeg -loglevel error -y -i "$out/short.mp4" -c copy \
  -movflags empty_moov+default_base_moof -frag_duration 500000 "$out/frag-mid.mp4"

# Noise at a known loudness: -8 LUFS and -24 LUFS (checked in direct-level.test.js).
noise() {
  local name=$1 filter=$2
  [ -f "$out/$name.mp4" ] || ffmpeg -loglevel error -y \
    -f lavfi -i "testsrc2=size=640x360:rate=15:duration=30" \
    -f lavfi -i "anoisesrc=c=pink:r=48000:d=30:seed=7,aformat=channel_layouts=stereo,$filter" \
    -c:v libx264 -preset ultrafast -crf 40 -g 30 -pix_fmt yuv420p \
    -c:a aac -b:a 160k -shortest -movflags +faststart "$out/$name.mp4"
}

noise loud "volume=8dB,alimiter=limit=0.98:level=false"
noise soft "volume=-9dB"

tsdir="$out/ts"
mkdir -p "$tsdir"

source_clip() {
  local name=$1 freq=$2 vcodec=$3 acodec=$4
  [ -f "$tsdir/$name.mp4" ] && return
  local args=()
  [ "$vcodec" != none ] && args+=(-f lavfi -i "testsrc2=size=640x360:rate=15:duration=10")
  [ "$acodec" != none ] && args+=(-f lavfi -i "sine=frequency=$freq:duration=10:sample_rate=48000" -ac 2)
  case "$vcodec" in
    h264) args+=(-c:v libx264 -preset veryfast -bf 2 -crf 40 -g 30 -pix_fmt yuv420p) ;;
    hevc) args+=(-c:v libx265 -preset ultrafast -crf 40 -g 30 -pix_fmt yuv420p -tag:v hvc1 -x265-params log-level=error) ;;
  esac
  case "$acodec" in
    aac) args+=(-c:a aac -b:a 64k) ;;
    mp3) args+=(-c:a libmp3lame -b:a 64k) ;;
    ac3) args+=(-c:a ac3 -b:a 96k) ;;
    eac3) args+=(-c:a eac3 -b:a 96k) ;;
  esac
  ffmpeg -loglevel error -y "${args[@]}" -shortest "$tsdir/$name.mp4"
}

ts_hls() {
  local name=$1 src=$2 prefix=${3:-seg}
  shift 3 || shift $#
  mkdir -p "$tsdir/$name"
  ffmpeg -loglevel error -y -i "$tsdir/$src.mp4" -c copy "$@" -f hls -hls_time 2 -hls_playlist_type vod \
    -hls_segment_filename "$tsdir/$name/$prefix%03d.ts" "$tsdir/$name/$prefix.m3u8"
}

for spec in "h264-aac 440 h264 aac" "hevc-aac 550 hevc aac" "audio-only 330 none aac" "mp3 660 none mp3" "ac3 770 none ac3" "eac3 880 none eac3" "second 220 h264 aac"; do
  set -- $spec
  source_clip "$1" "$2" "$3" "$4"
done

for name in h264-aac hevc-aac audio-only mp3 ac3 eac3; do
  [ -f "$tsdir/$name/index.m3u8" ] && continue
  ts_hls "$name" "$name" seg
  mv "$tsdir/$name/seg.m3u8" "$tsdir/$name/index.m3u8"
done

if [ ! -f "$tsdir/wrap/index.m3u8" ]; then
  ts_hls wrap h264-aac seg -output_ts_offset 95436
  mv "$tsdir/wrap/seg.m3u8" "$tsdir/wrap/index.m3u8"
fi

if [ ! -f "$tsdir/discontinuity/index.m3u8" ]; then
  ts_hls discontinuity h264-aac a
  ts_hls discontinuity second b -output_ts_offset 1000
  {
    grep -v '^#EXT-X-ENDLIST' "$tsdir/discontinuity/a.m3u8"
    echo '#EXT-X-DISCONTINUITY'
    grep -v '^#EXTM3U\|^#EXT-X-VERSION\|^#EXT-X-TARGETDURATION\|^#EXT-X-MEDIA-SEQUENCE\|^#EXT-X-PLAYLIST-TYPE' "$tsdir/discontinuity/b.m3u8"
  } > "$tsdir/discontinuity/index.m3u8"
  rm "$tsdir/discontinuity/a.m3u8" "$tsdir/discontinuity/b.m3u8"
fi

if [ ! -f "$tsdir/packed/list.csv" ]; then
  mkdir -p "$tsdir/packed"
  ffmpeg -loglevel error -y -i "$tsdir/audio-only.mp4" -c copy -f segment -segment_time 2 -segment_format adts \
    -segment_list "$tsdir/packed/list.csv" -segment_list_type csv "$tsdir/packed/seg%03d.aac"
fi

[ -f "$tsdir/mpeg2.ts" ] || ffmpeg -loglevel error -y -f lavfi -i "testsrc2=size=320x180:rate=15:duration=2" \
  -c:v mpeg2video -f mpegts "$tsdir/mpeg2.ts"
