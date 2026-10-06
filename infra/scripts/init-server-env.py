"""Run on the Zorin server. Never replaces credentials or prints them."""
from pathlib import Path
import os
import secrets

root = Path(__file__).resolve().parents[2]
directory = root / 'infra' / 'secrets'
directory.mkdir(parents=True, exist_ok=True)
os.chmod(directory, 0o700)
database_file = directory / 'postgres.env'
api_file = directory / 'api.env'
migration_file = directory / 'migrate.env'
present = [path.exists() for path in (database_file, api_file, migration_file)]
if any(present) and not all(present):
    raise SystemExit('Incomplete credential file set. Reconcile it before continuing.')
if not database_file.exists():
    password = secrets.token_hex(32)
    app_password = secrets.token_hex(32)
    for path, content in [
        (database_file, f'POSTGRES_PASSWORD={password}\nATMS_APP_PASSWORD={app_password}\n'),
        (api_file, f'DATABASE_URL=postgresql://atms_app:{app_password}@postgres:5432/atms?schema=public\n'),
        (migration_file, f'DATABASE_URL=postgresql://atms:{password}@postgres:5432/atms?schema=public\n'),
    ]:
        with path.open('x', encoding='utf-8') as stream:
            stream.write(content)
        os.chmod(path, 0o600)
print('ATMS server credentials ready; existing credentials preserved.')
