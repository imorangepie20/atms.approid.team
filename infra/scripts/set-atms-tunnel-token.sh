#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
umask 077
mkdir -p infra/secrets
chmod 700 infra/secrets
IFS= read -r -s -p 'Dedicated ATMS tunnel token: ' token
printf '\n'
[[ "$token" =~ ^[A-Za-z0-9+/=_-]+$ ]] || { echo 'Invalid token format.' >&2; exit 1; }
printf 'TUNNEL_TOKEN=%s\n' "$token" > infra/secrets/tunnel.env
chmod 600 infra/secrets/tunnel.env
unset token
echo 'Token stored; run bash infra/scripts/atms-server.sh tunnel.'
