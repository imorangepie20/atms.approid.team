"""Windows 예약 작업용 Hindsight 실행기: 중복 방지와 실행 결과 기록."""

import json
import msvcrt
from pathlib import Path
import subprocess
import sys
import time
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / ".artifacts/hindsight-sync"


def save_status(status, **details):
    # 임시 파일을 교체하므로 조회 중 잘린 JSON을 읽는 일을 방지한다.
    temporary = STATE / "last-run.tmp"
    temporary.write_text(json.dumps({"status": status, **details}, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(STATE / "last-run.json")


def main():
    STATE.mkdir(parents=True, exist_ok=True)
    # Windows의 파일 잠금은 프로세스 종료 시 해제된다. 오래된 lock 파일이
    # 남더라도 다음 실행을 막지 않으며 수동 실행과 예약 실행도 겹치지 않는다.
    with (STATE / "run.lock").open("a+b") as lock:
        if lock.seek(0, 2) == 0:
            lock.write(b"0")
            lock.flush()
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            if sys.stdout is not None:
                print("SKIP: another ATMS Hindsight synchronization is running")
            return 0

        started = datetime.now(timezone.utc).isoformat()
        save_status("running", started_at=started)
        # 기존 동기화 로직을 재사용한다. 쓰기 완료 후 읽기 전용 --check까지
        # 성공해야 성공으로 기록한다. 전체 실행 제한은 20분이다.
        deadline = time.monotonic() + 1200
        steps = []
        try:
            with (STATE / "latest.log").open("w", encoding="utf-8") as log:
                for arguments in ([], ["--check"]):
                    command = [sys.executable, str(ROOT / "infra/scripts/sync-hindsight-docs.py"), *arguments]
                    completed = subprocess.run(command, cwd=ROOT, capture_output=True, text=True,
                                               encoding="utf-8", timeout=max(1, deadline - time.monotonic()))
                    log.write(f"STEP: {arguments or ['sync']}\n{completed.stdout}{completed.stderr}\n")
                    log.flush()
                    steps.append({"arguments": arguments, "exit_code": completed.returncode})
                    if completed.returncode != 0:
                        raise RuntimeError("Hindsight step failed; see latest.log")
            save_status("success", started_at=started, finished_at=datetime.now(timezone.utc).isoformat(), steps=steps)
            return 0
        except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
            # 서비스 중단과 시간 초과는 실패로 남긴다. 다음 30분 주기에 재시도한다.
            save_status("failed", started_at=started, finished_at=datetime.now(timezone.utc).isoformat(),
                        steps=steps, error=str(error))
            return 1
        finally:
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)


if __name__ == "__main__":
    sys.exit(main())
