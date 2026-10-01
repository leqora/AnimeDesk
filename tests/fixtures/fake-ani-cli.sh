#!/bin/sh
# Mimics exactly the parts of ani-cli AnimeDesk relies on:
# menus go through "$ANI_CLI_MENU" "<prompt>" with entries on stdin,
# playback goes through $ANI_CLI_PLAYER (mpv-style args, UNQUOTED exactly like real ani-cli 5.1),
# download and debug modes.
index=""; ep_no=""; query=""
while [ $# -gt 0 ]; do
  case "$1" in
    -S) index="$2"; shift ;;
    -e) ep_no="$2"; shift ;;
    *) query="${query:+$query }$1" ;;
  esac
  shift
done
if [ "$query" = "nothing" ]; then printf '\033[1;31mNo results found!\033[0m\n' >&2; exit 1; fi
list=$(printf '1\tid1\tFake Anime\n2\tid2\tOther Show')
if [ -n "$index" ]; then
  result=$(printf '%s\n' "$list" | sed -n "${index}p")
else
  choice=$(printf '%s\n' "$list" | cut -f 1,3 | tr '\t' ' ' | "$ANI_CLI_MENU" "Select anime: " | cut -d ' ' -f 1)
  result=$(printf '%s\n' "$list" | awk -F '\t' -v n="$choice" '$1 == n')
fi
[ -z "$result" ] && { printf 'Invalid anime selection\n' >&2; exit 1; }
title=$(printf '%s' "$result" | cut -f 3)
[ -z "$ep_no" ] && ep_no=$(printf '1\n2\n3\n' | "$ANI_CLI_MENU" "Select episode: " | cut -d ' ' -f 1)
[ -z "$ep_no" ] && { printf 'Invalid episode selection\n' >&2; exit 1; }
case "$ANI_CLI_PLAYER" in
  debug) printf 'All links:\nx\nSelected link:\nhttps://example.invalid/%s.m3u8\nSubtitles:\n\n' "$ep_no" ;;
  download)
    mkdir -p "$ANI_CLI_DOWNLOAD_DIR"
    printf '[download]  50.0%% of 10.00MiB\n'
    printf 'video' > "$ANI_CLI_DOWNLOAD_DIR/$title Episode $ep_no.mp4"
    printf '[download] 100%% of 10.00MiB\n' ;;
  *)
    # shellcheck disable=SC2086 — real ani-cli does not quote the player either
    $ANI_CLI_PLAYER --referrer=https://ref.invalid --force-media-title="$title Episode $ep_no" "https://example.invalid/$ep_no.m3u8"
    exit $? ;;
esac
