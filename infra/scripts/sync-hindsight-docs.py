"""Synchronize ATMS development Markdown with its dedicated Hindsight bank."""

import argparse
import hashlib
import json
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


ROOT = Path(__file__).resolve().parents[2]


def manifest(config):
    paths = sorted({p.resolve() for pattern in config["include"] for p in ROOT.glob(pattern) if p.is_file()})
    items = []
    for path in paths:
        if not path.is_relative_to(ROOT):
            raise RuntimeError("Document path escapes the repository")
        relative = path.relative_to(ROOT).as_posix()
        content = path.read_bytes().decode("utf-8")
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
        document_id = "atms-doc-" + hashlib.sha256(relative.encode("utf-8")).hexdigest()[:24]
        tags = [*config["tags"], "source:" + relative]
        if relative.startswith("docs/features/") and path.stem[:2].isdigit():
            tags.append("feature:F" + path.stem[:2])
        items.append({
            "content": content,
            "document_id": document_id,
            "context": "ATMS development reference: " + relative,
            "timestamp": "unset",
            "tags": tags,
            "update_mode": "replace",
            "metadata": {"source_path": relative, "sha256": digest, "project": "atms"},
        })
    if not items:
        raise RuntimeError("No development documents found")
    return items


class Client:
    def __init__(self, config):
        self.base = config["base_url"].rstrip("/")
        self.bank = "/v1/default/banks/" + urllib.parse.quote(config["bank_id"], safe="")

    def request(self, path, method="GET", payload=None, allow_missing=False):
        data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(self.base + path, data=data, method=method,
                                         headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if allow_missing and error.code == 404:
                return None
            raise RuntimeError(f"Hindsight HTTP {error.code}: {method} {path}") from error

    def document(self, item):
        return self.request(self.bank + "/documents/" + item["document_id"], allow_missing=True)


def matching(remote, item):
    return (remote is not None
            and remote.get("original_text") == item["content"]
            and (remote.get("document_metadata") or {}).get("sha256") == item["metadata"]["sha256"]
            and (remote.get("document_metadata") or {}).get("source_path") == item["metadata"]["source_path"]
            and set(remote.get("tags", [])) == set(item["tags"])
            and remote.get("memory_unit_count", 0) > 0)


def verify(client, items):
    memory_count = 0
    for item in items:
        remote = client.document(item)
        if not matching(remote, item):
            raise RuntimeError("Remote content or searchable memories differ: " + item["metadata"]["source_path"])
        memory_count += remote["memory_unit_count"]
    expected = {item["document_id"] for item in items}
    offset = 0
    stale = []
    while True:
        page = client.request(client.bank + f"/documents?limit=100&offset={offset}")
        rows = page["items"]
        stale.extend(row["id"] for row in rows if row["id"].startswith("atms-doc-") and row["id"] not in expected)
        offset += len(rows)
        if offset >= page["total"]:
            break
        if not rows:
            raise RuntimeError("Unexpected empty documents page")
    if stale:
        raise RuntimeError(f"{len(stale)} removed or renamed source documents require review; not deleted automatically")
    return {"verified_documents": len(items), "memory_units": memory_count, "stale_documents": 0}


def wait_for_operation(client, operation_id, timeout):
    deadline = time.monotonic() + timeout
    last_status = None
    while time.monotonic() < deadline:
        operation = client.request(client.bank + "/operations/" + operation_id)
        status = operation["status"]
        children = operation.get("child_operations") or []
        if status != last_status:
            print(json.dumps({"operation_id": operation_id, "status": status}), flush=True)
            last_status = status
        if status in {"failed", "cancelled", "not_found"} or any(child.get("status") in {"failed", "cancelled"} for child in children):
            raise RuntimeError("Retain operation did not complete successfully: " + operation_id)
        if status == "completed" and all(child.get("status") == "completed" for child in children):
            return
        time.sleep(5)
    raise RuntimeError("Retain is still pending; rerun after completion: " + operation_id)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Show local inventory; no network or writes")
    parser.add_argument("--check", action="store_true", help="Verify remote originals; no writes")
    parser.add_argument("--timeout", type=int, default=900, help="Async completion timeout in seconds")
    args = parser.parse_args()
    config = json.loads((ROOT / "infra/hindsight-docs.json").read_text(encoding="utf-8"))
    items = manifest(config)
    if args.dry_run:
        print(json.dumps({"bank_id": config["bank_id"], "documents": len(items),
                          "paths": [item["metadata"]["source_path"] for item in items]}, indent=2))
        return
    client = Client(config)
    client.request("/health")
    if args.check:
        print(json.dumps({"bank_id": config["bank_id"], **verify(client, items)}))
        return
    banks = client.request("/v1/default/banks?q=" + urllib.parse.quote(config["bank_id"]) + "&limit=100")
    existing = any(bank.get("bank_id", bank.get("id")) == config["bank_id"]
                   for bank in banks.get("items", banks.get("banks", [])))
    if not existing:
        client.request(client.bank, "PUT", config["bank_profile"])
        print(json.dumps({"bank_id": config["bank_id"], "created": True}), flush=True)
    changed = [item for item in items if not matching(client.document(item), item)]
    print(json.dumps({"documents": len(items), "changed": len(changed), "unchanged": len(items) - len(changed)}), flush=True)
    if changed:
        operation_id = str(uuid.uuid4())
        response = client.request(client.bank + "/memories", "POST",
                                  {"items": changed, "async": True, "operation_id": operation_id})
        if not response.get("success"):
            raise RuntimeError("Retain was not accepted")
        operations = response.get("operation_ids") or [response.get("operation_id") or operation_id]
        for operation in operations:
            wait_for_operation(client, operation, args.timeout)
    print(json.dumps({"bank_id": config["bank_id"], "changed": len(changed), **verify(client, items)}), flush=True)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        print("ERROR: " + str(error), file=sys.stderr)
        sys.exit(1)
