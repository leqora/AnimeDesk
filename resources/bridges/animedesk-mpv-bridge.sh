#!/bin/sh
# ani-cli calls this as its player (the name must contain "mpv"):
#   animedesk-mpv-bridge.sh --referrer=... [--sub-file=...] --force-media-title=... <url>
# AnimeDesk starts the real mpv and answers with its exit code when it closes.
code=$(printf '%s\n' "$@" | curl -sS --fail -X POST \
  -H "x-animedesk-token: $ANIMEDESK_TOKEN" \
  -H "x-animedesk-session: $ANIMEDESK_SESSION" \
  --data-binary @- \
  "http://127.0.0.1:$ANIMEDESK_PORT/play") || exit 2
exit "${code:-0}"
