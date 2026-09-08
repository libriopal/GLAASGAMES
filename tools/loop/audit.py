#!/usr/bin/env python3
"""Independent auditor: Cloudflare Workers AI, OpenAI-compatible endpoint.

The point of this file is epistemic separation. The literature on agentic
reliability is consistent that a model critiquing its own output reproduces its
own reasoning and so adds little (Huang et al.; the "verification gap" surveys).
The critic therefore runs on a DIFFERENT model, on a DIFFERENT vendor's
inference stack, and is given the artifact WITHOUT the reasoning that produced
it — it sees the claim, not the chain of thought that made the claim feel true.

    ./audit.py <prompt-file> [--system <file>] [--max-tokens N]

Credentials come from $HOME/.env and are never printed. Transcripts are written
to ./audits/ so every finding in the plan is traceable to a recorded exchange.
"""
import datetime
import json
import pathlib
import sys
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).parent
AUDITS = HERE / "audits"
AUDITS.mkdir(exist_ok=True)

DEFAULT_SYSTEM = """You are an independent technical auditor. You did not write \
the artifact under review and you have no stake in its approval.

Your job is to find what is wrong with it, not to summarise or praise it. For \
every finding give:
  SEVERITY  critical | major | moderate | minor
  CLAIM     the specific sentence or element you are challenging
  WHY       the concrete failure mode, with the inputs or conditions that trigger it
  TEST      what evidence would settle whether you are right

Rules:
- If a claim is stated without evidence, say so; do not fill the gap yourself.
- If the artifact's ordering, sequencing or dependencies are wrong, say which \
step depends on which and why the stated order breaks it.
- Do not invent citations. If you do not know, write "unknown".
- End with a single line: RECOMMENDATION: approve | approve-with-changes | reject
"""


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in (pathlib.Path.home() / ".env").read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def main() -> int:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 2

    prompt = pathlib.Path(args[0]).read_text()
    system = DEFAULT_SYSTEM
    max_tokens = 4096
    if "--system" in args:
        system = pathlib.Path(args[args.index("--system") + 1]).read_text()
    if "--max-tokens" in args:
        max_tokens = int(args[args.index("--max-tokens") + 1])

    env = load_env()
    account = env["CLOUDFLARE_ACCOUNT_ID"]
    token = env["CLOUDFLARE_API_TOKEN"]
    model = env.get("CF_AUDIT_MODEL", "@cf/google/gemma-4-26b-a4b-it")

    payload = {
        "model": model,
        "max_tokens": max_tokens,
        # Low temperature: an auditor that reroutes its own reasoning run to run
        # is not reproducible, and a finding that cannot be reproduced cannot be
        # acted on.
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    }
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            body = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        # The body carries Cloudflare's error detail; the token is in the request
        # headers, not the response, so this is safe to surface.
        print(f"HTTP {exc.code}: {exc.read().decode()[:800]}", file=sys.stderr)
        return 1

    choice = body["choices"][0]
    message = choice["message"]
    text = message.get("content") or ""
    usage = body.get("usage", {})

    # gemma-4-26b-a4b is a reasoning model: it spends completion tokens on
    # reasoning_content before emitting any content. Run out of budget mid-think
    # and "content" comes back as an empty string with finish_reason "length" —
    # a silent empty audit, which is far worse than a loud failure, because an
    # empty audit reads as "no findings".
    if not text.strip():
        reason = choice.get("finish_reason")
        thinking = message.get("reasoning_content") or ""
        print(
            f"EMPTY AUDIT: finish_reason={reason}, "
            f"{len(thinking)} chars of reasoning but no answer. "
            f"Raise --max-tokens.",
            file=sys.stderr,
        )
        text = f"[NO ANSWER — finish_reason={reason}]\n\nTruncated reasoning:\n{thinking[-4000:]}"

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    name = pathlib.Path(args[0]).stem
    (AUDITS / f"{stamp}-{name}.md").write_text(
        f"<!-- model: {model}  usage: {json.dumps(usage)} -->\n\n"
        f"## Prompt\n\n{prompt}\n\n## Auditor response\n\n{text}\n"
    )
    print(text)
    print(f"\n--- model={model} usage={json.dumps(usage)}", file=sys.stderr)
    print(f"--- transcript: audits/{stamp}-{name}.md", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
