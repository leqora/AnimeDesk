#!/bin/sh
# ani-cli calls this as its menu program: menu-bridge.sh [extra flags...] "<prompt>"
# The menu entries arrive on stdin; the chosen line must be printed to stdout.
for prompt; do :; done
prompt_hex=$(printf '%s' "$prompt" | od -An -tx1 | tr -d ' \n')
answer=$(curl -sS --fail -X POST \
  -H "x-animedesk-token: $ANIMEDESK_TOKEN" \
  -H "x-animedesk-session: $ANIMEDESK_SESSION" \
  -H "x-animedesk-prompt: $prompt_hex" \
  --data-binary @- \
  "http://127.0.0.1:$ANIMEDESK_PORT/menu") || exit 1
[ -n "$answer" ] || exit 1
printf '%s\n' "$answer"
