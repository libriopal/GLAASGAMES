#!/usr/bin/env python3
"""Tavily search/extract helper.

Reads TAVILY_API_KEY from $HOME/.env. Never prints the key. Results are cached
to disk so a repeated query in the same research pass does not spend quota.

    ./tavily.py search "query" [--depth advanced] [--n 8]
    ./tavily.py extract <url> [<url> ...]
"""
import hashlib
import json
import os
import pathlib
import sys
import urllib.request

CACHE = pathlib.Path(__file__).parent / "cache"
CACHE.mkdir(exist_ok=True)


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    path = pathlib.Path.home() / ".env"
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


def post(url: str, payload: dict, token: str) -> dict:
    key = hashlib.sha256((url + json.dumps(payload, sort_keys=True)).encode()).hexdigest()[:24]
    cached = CACHE / f"{key}.json"
    if cached.exists():
        return json.loads(cached.read_text())
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = json.loads(resp.read().decode())
    cached.write_text(json.dumps(body))
    return body


def main() -> int:
    env = load_env()
    token = env.get("TAVILY_API_KEY")
    if not token:
        print("TAVILY_API_KEY missing from ~/.env", file=sys.stderr)
        return 2

    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 2
    mode, rest = args[0], args[1:]

    if mode == "search":
        query = rest[0]
        depth = "advanced"
        n = 8
        if "--depth" in rest:
            depth = rest[rest.index("--depth") + 1]
        if "--n" in rest:
            n = int(rest[rest.index("--n") + 1])
        body = post(
            "https://api.tavily.com/search",
            {
                "query": query,
                "max_results": n,
                "search_depth": depth,
                "include_answer": "advanced",
            },
            token,
        )
        print("ANSWER:", (body.get("answer") or "").strip()[:1600])
        print()
        for r in body.get("results", []):
            print(f"[{r.get('score', 0):.2f}] {r['title']}")
            print(f"      {r['url']}")
            print(f"      {(r.get('content') or '').strip()[:500]}")
            print()
        return 0

    if mode == "extract":
        body = post(
            "https://api.tavily.com/extract",
            {"urls": rest, "extract_depth": "advanced"},
            token,
        )
        for r in body.get("results", []):
            print("=" * 78)
            print(r["url"])
            print("=" * 78)
            print((r.get("raw_content") or "")[:24000])
        for f in body.get("failed_results", []):
            print("FAILED:", f)
        return 0

    print(f"unknown mode {mode}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
