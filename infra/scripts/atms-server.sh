#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
compose() { docker compose -f infra/compose.atms.yml "$@"; }
case "${1:-status}" in
  setup)
    python3 infra/scripts/init-server-env.py
    test -f .artifacts/web/index.html || { echo 'Build/copy the web artifact first.' >&2; exit 1; }
    compose up -d --wait postgres
    compose build api migrate
    compose --profile tools run --rm migrate
    # [F03/F12] 증빙 업로드는 ClamAV가 준비된 뒤 사용할 수 있다.
    compose up -d --wait --wait-timeout 360 clamav api app
    ;;
  status) compose ps; curl --fail --silent --show-error http://127.0.0.1:19080/api/health/ready ;;
  up)
    # [F12] down 이후에도 검사 서비스를 포함해 재기동하고, 준비된 전용 Tunnel을 연결한다.
    compose up -d --wait --wait-timeout 360 postgres clamav api app
    if test -f infra/secrets/tunnel.env; then compose --profile tunnel up -d tunnel; fi
    ;;
  down) compose down ;;
  tunnel)
    test -f infra/secrets/tunnel.env || { echo 'Configure the dedicated ATMS tunnel token first.' >&2; exit 1; }
    compose --profile tunnel up -d tunnel
    ;;
  *) echo 'Usage: atms-server.sh setup|status|up|down|tunnel' >&2; exit 2 ;;
esac
