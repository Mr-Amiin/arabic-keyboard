#!/usr/bin/env python3
"""Maintain a durable IndexNow URL queue and submit one batch per run.

The durable queue lives on an orphan Git branch (default: indexnow-queue),
separate from the GitHub Pages `main` publishing branch. Each queue file holds
at most 1,000 URLs. A batch is removed after IndexNow acknowledges it with
HTTP 200 or 202. HTTP 202 means the URLs were received while key validation is
pending. If persisting a post-submission removal fails, the same URLs may be
sent again; this is at-least-once processing rather than risking lost URLs.

The initial checkpoint is the last successful GitHub Pages workflow run before
the Learn Arabic lesson rollout: Pages run #46, commit a22e363... (November 16, 2026).
The first queue scan advances through the latest successful Pages workflow run,
currently run #48 at b8b13dc..., capturing later deployed lesson/content changes.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

SITE_HOST = "www.arabic-keyboard.live"
SITE_ORIGIN = f"https://{SITE_HOST}"
INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"
KEY_FILE_SUFFIX = ".txt"
REPORT_DIR = Path("indexnow-report")
STATE_BRANCH_DEFAULT = "indexnow-queue"
STATE_FILE = "queue-state.json"
PENDING_DIR = "pending"
SCHEMA_VERSION = 1
MAX_BATCH_SIZE = 1000
MAX_PAGES_WORKFLOW_RUN_PAGES = 10
PAGES_WORKFLOW_TIMEOUT_SECONDS = 25 * 60
PAGES_WORKFLOW_POLL_SECONDS = 15
PAGES_WORKFLOW_NAME = "pages build and deployment"
RETRYABLE_HTTP_CODES = {408, 425, 429, 500, 502, 503, 504}

# Last successful Pages build before the Learn Arabic lesson rollout.
# Pages run #46 succeeded on main at commit a22e363. The first queue scan
# compares this checkpoint with the latest successful Pages workflow run.
INITIAL_BASELINE_SHA = "a22e363b66e27466f3b2147e57505c48f9bf29b2"
INITIAL_BASELINE_RUN_ID = 43934867960
INITIAL_BASELINE_RUN_NUMBER = 46
INITIAL_BASELINE_CREATED_AT = "2026-11-16T16:00:00Z"  # UI showed 19:00 Africa/Nairobi


EXCLUDED_PARTS = {
    ".git", ".github", ".vscode", "node_modules", "tests", "test",
    "scripts", "lh-baseline", "coverage", "vendor",
}


def git(args: list[str], cwd: Path | None = None, *, capture: bool = True) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=str(cwd) if cwd else None,
        check=False,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        text=True if capture else False,
        encoding="utf-8" if capture else None,
    )
    if result.returncode != 0:
        detail = (result.stderr or "").strip() if capture else ""
        command = "git " + " ".join(args)
        raise RuntimeError(f"{command} failed (exit {result.returncode}). {detail}")
    return result.stdout.strip() if capture else ""


def parse_github_time(value: str) -> datetime:
    if not value:
        raise RuntimeError("A GitHub workflow-run record has no created_at timestamp.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise RuntimeError(f"Invalid GitHub timestamp: {value!r}") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def workflow_run_order_key(run: dict) -> tuple[datetime, int]:
    return parse_github_time(run.get("created_at", "")), int(run.get("run_number", 0))


def gh_api(path: str):
    token = os.environ.get("GH_TOKEN")
    if not token:
        raise RuntimeError("GH_TOKEN is missing.")
    request = Request(
        "https://api.github.com" + path,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "arabic-keyboard-indexnow-queue",
        },
    )
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def is_pages_workflow_run(run: dict) -> bool:
    name = (run.get("name") or "").strip().casefold()
    return (
        name == PAGES_WORKFLOW_NAME
        and run.get("head_branch") == "main"
        and bool(run.get("head_sha"))
    )


def list_pages_workflow_runs(repo: str, *, head_sha: str | None = None) -> list[dict]:
    """List actual GitHub Pages dynamic workflow runs, not deployment API records.

    This repository's Pages publisher appears in Actions as the dynamic workflow
    named `pages build and deployment`; its deployment API endpoint is not
    available in this repository, so Actions workflow runs are the source of truth.
    """
    runs: list[dict] = []
    for page in range(1, MAX_PAGES_WORKFLOW_RUN_PAGES + 1):
        params = {"branch": "main", "per_page": 100, "page": page}
        if head_sha:
            params["head_sha"] = head_sha
        response = gh_api(f"/repos/{repo}/actions/runs?{urlencode(params)}")
        if not isinstance(response, dict) or not isinstance(response.get("workflow_runs"), list):
            raise RuntimeError("Unexpected GitHub Actions workflow-runs API response.")
        batch = response["workflow_runs"]
        runs.extend(item for item in batch if is_pages_workflow_run(item))
        if len(batch) < 100:
            return sorted(runs, key=workflow_run_order_key, reverse=True)
    raise RuntimeError(
        "Pages workflow history exceeded the scan limit; refusing to guess the latest run."
    )


def pages_run_succeeded(run: dict) -> bool:
    return run.get("status") == "completed" and run.get("conclusion") == "success"


def latest_successful_pages_run(repo: str) -> dict:
    for run in list_pages_workflow_runs(repo):
        if pages_run_succeeded(run):
            return run
    raise RuntimeError("No successful pages build and deployment run on main was found.")


def wait_for_expected_pages_run(repo: str, expected_sha: str) -> dict:
    deadline = time.monotonic() + PAGES_WORKFLOW_TIMEOUT_SECONDS
    last_state = "no matching Pages workflow run found"
    while time.monotonic() < deadline:
        matches = list_pages_workflow_runs(repo, head_sha=expected_sha)
        matches = [run for run in matches if run.get("head_sha") == expected_sha]
        successful = [run for run in matches if pages_run_succeeded(run)]
        if successful:
            chosen = successful[0]
            print(
                "Confirmed matching GitHub Pages workflow succeeded: "
                f"run #{chosen.get('run_number')} ({expected_sha})."
            )
            return chosen
        # A failed Pages attempt can be followed by a retry for the same commit.
        # Do not fail while any matching run is still queued or in progress;
        # wait for that retry to complete and re-evaluate the full run history.
        active = [run for run in matches if run.get("status") != "completed"]
        if active:
            latest = active[0]
            last_state = (
                f"Pages run #{latest.get('run_number')} status={latest.get('status', 'unknown')}"
            )
        else:
            completed = [run for run in matches if run.get("status") == "completed"]
            if completed:
                latest = completed[0]
                conclusion = latest.get("conclusion") or "unknown"
                last_state = f"Pages run #{latest.get('run_number')} concluded {conclusion}"
                raise RuntimeError(
                    f"The matching GitHub Pages workflow completed without success ({last_state}); "
                    "not queueing URLs."
                )
            if not matches:
                last_state = "no matching Pages workflow run found"
        time.sleep(PAGES_WORKFLOW_POLL_SECONDS)
    raise RuntimeError(
        "Timed out waiting for the matching GitHub Pages workflow run. Last observation: "
        + last_state
    )


def changed_paths(previous_sha: str, deployed_sha: str) -> tuple[list[str], list[str]]:
    output = subprocess.check_output(
        [
            "git", "diff", "--name-status", "-z", "--no-renames",
            previous_sha, deployed_sha, "--",
        ]
    )
    parts = output.decode("utf-8").split("\0")
    added_or_modified: list[str] = []
    deleted: list[str] = []
    index = 0
    while index + 1 < len(parts):
        status, path = parts[index], parts[index + 1]
        index += 2
        if not status or not path:
            continue
        if status in {"A", "M", "T"}:
            added_or_modified.append(path)
        elif status == "D":
            deleted.append(path)
    return added_or_modified, deleted


def public_html_url(path_text: str, *, require_file: bool) -> str | None:
    try:
        relative = PurePosixPath(path_text)
        parts = relative.parts
        if (
            not parts
            or relative.is_absolute()
            or ".." in parts
            or any(part in EXCLUDED_PARTS or part.startswith(".") for part in parts)
        ):
            return None
        lower_name = parts[-1].lower()
        if not lower_name.endswith(".html"):
            return None
        if ".tmp" in lower_name or lower_name.endswith((".bak.html", ".old.html")):
            return None
        if require_file:
            root = Path.cwd().resolve()
            candidate = root.joinpath(*parts)
            if any((root.joinpath(*parts[:i])).is_symlink() for i in range(1, len(parts) + 1)):
                return None
            resolved = candidate.resolve()
            if not resolved.is_relative_to(root) or not resolved.is_file():
                return None
        encoded_parts = [quote(part, safe="-._~") for part in parts]
        if lower_name == "index.html":
            folders = encoded_parts[:-1]
            route = "/" if not folders else "/" + "/".join(folders) + "/"
        else:
            route = "/" + "/".join(encoded_parts)
        return SITE_ORIGIN + route
    except (UnicodeEncodeError, ValueError, OSError):
        return None


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(content, encoding="utf-8", newline="\n")
    temporary.replace(path)


def default_state() -> dict:
    return {
        "schema_version": SCHEMA_VERSION,
        "last_scanned_pages_run": {
            "id": INITIAL_BASELINE_RUN_ID,
            "run_number": INITIAL_BASELINE_RUN_NUMBER,
            "sha": INITIAL_BASELINE_SHA,
            "created_at": INITIAL_BASELINE_CREATED_AT,
        },
        "next_batch_number": 1,
        "accepted_url_count": 0,
        "last_submission": None,
        "last_submission_attempt": None,
    }


def load_state(state_root: Path) -> dict:
    path = state_root / STATE_FILE
    if not path.is_file():
        raise RuntimeError("Queue branch exists but queue-state.json is missing.")
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Queue state is unreadable: {exc}") from exc
    if state.get("schema_version") != SCHEMA_VERSION:
        raise RuntimeError("Unsupported IndexNow queue state schema version.")
    checkpoint = state.get("last_scanned_pages_run") or {}
    if not checkpoint.get("sha"):
        raise RuntimeError("Queue state has no scanned Pages workflow checkpoint.")
    return state


def save_state(state_root: Path, state: dict) -> None:
    atomic_write(
        state_root / STATE_FILE,
        json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
    )


def pending_files(state_root: Path) -> list[Path]:
    folder = state_root / PENDING_DIR
    if not folder.exists():
        return []
    return sorted(path for path in folder.glob("*.txt") if path.is_file())


def read_pending_file(path: Path) -> list[str]:
    return [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def pending_url_count(state_root: Path) -> int:
    return sum(len(read_pending_file(path)) for path in pending_files(state_root))


def pending_url_set(state_root: Path) -> set[str]:
    result: set[str] = set()
    for path in pending_files(state_root):
        result.update(read_pending_file(path))
    return result


def enqueue_urls(state_root: Path, state: dict, urls: list[str], batch_size: int) -> int:
    existing = pending_url_set(state_root)
    unique: list[str] = []
    seen = set(existing)
    for url in urls:
        if url not in seen:
            seen.add(url)
            unique.append(url)
    next_number = int(state.get("next_batch_number", 1))
    for offset in range(0, len(unique), batch_size):
        chunk = unique[offset:offset + batch_size]
        name = f"{next_number:012d}.txt"
        atomic_write(
            state_root / PENDING_DIR / name,
            "".join(url + "\n" for url in chunk),
        )
        next_number += 1
    state["next_batch_number"] = next_number
    return len(unique)


def remove_deleted_from_queue(state_root: Path, deleted_urls: set[str]) -> int:
    if not deleted_urls:
        return 0
    removed = 0
    for path in pending_files(state_root):
        original = read_pending_file(path)
        kept = [url for url in original if url not in deleted_urls]
        removed += len(original) - len(kept)
        if not kept:
            path.unlink()
        elif len(kept) != len(original):
            atomic_write(path, "".join(url + "\n" for url in kept))
    return removed


def take_next_batch(state_root: Path, batch_size: int) -> tuple[Path, list[str]] | None:
    for path in pending_files(state_root):
        urls = read_pending_file(path)
        if urls:
            if len(urls) > batch_size:
                raise RuntimeError(
                    f"Queue batch {path.name} has {len(urls)} URLs, exceeding limit {batch_size}."
                )
            return path, urls
        path.unlink()
    return None


def create_queue_worktree(repo_root: Path, branch: str) -> tuple[Path, bool]:
    """Create a temporary worktree for an orphan state branch or fetch its tip."""
    temp_root = Path(tempfile.mkdtemp(prefix="indexnow-queue-state-"))
    # git worktree add requires an empty target directory; rmdir keeps the unique
    # generated path while allowing Git to create the worktree directory.
    temp_root.rmdir()
    remote_ref = git(
        ["ls-remote", "--heads", "origin", f"refs/heads/{branch}"],
        cwd=repo_root,
    )
    if remote_ref:
        git(
            [
                "fetch", "origin",
                f"+refs/heads/{branch}:refs/remotes/origin/{branch}",
            ],
            cwd=repo_root,
        )
        git(
            ["worktree", "add", "--detach", str(temp_root), f"refs/remotes/origin/{branch}"],
            cwd=repo_root,
        )
        # Keep this worktree detached. Commits can be pushed explicitly to the
        # queue ref, and this avoids collisions with a local branch left by
        # another worktree in local integration tests or reruns.
        return temp_root, False

    # Create the empty orphan worktree directly; do not check out the large site
    # repository and then immediately discard its tracked files.
    git(["worktree", "add", "--orphan", "-b", branch, str(temp_root)], cwd=repo_root)
    return temp_root, True


def commit_and_push_state(state_root: Path, branch: str, message: str) -> bool:
    git(["config", "user.name", "github-actions[bot]"], cwd=state_root)
    git(
        ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"],
        cwd=state_root,
    )
    git(["add", "-A"], cwd=state_root)
    check = subprocess.run(
        ["git", "diff", "--cached", "--quiet"], cwd=state_root,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    if check.returncode == 0:
        return False
    if check.returncode != 1:
        raise RuntimeError("Could not inspect staged queue-state changes.")
    git(["commit", "-m", message], cwd=state_root)
    git(["push", "origin", f"HEAD:refs/heads/{branch}"], cwd=state_root)
    return True


def is_submission_confirmed(http_status: int) -> bool:
    """HTTP 200 and 202 both acknowledge receipt under the IndexNow protocol."""
    return http_status in (200, 202)


def retry_delay(error: HTTPError, attempt: int) -> int:
    retry_after = error.headers.get("Retry-After", "") if error.headers else ""
    if retry_after.isdigit():
        return min(max(int(retry_after), 1), 60)
    return min(5 * (2 ** attempt), 30)


def submit(urls: list[str], key: str) -> tuple[int, str]:
    payload = {
        "host": SITE_HOST,
        "key": key,
        "keyLocation": f"{SITE_ORIGIN}/{key}{KEY_FILE_SUFFIX}",
        "urlList": urls,
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(
        INDEXNOW_ENDPOINT,
        data=body,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    for attempt in range(4):
        try:
            with urlopen(request, timeout=60) as response:
                return response.status, response.read().decode("utf-8", "replace")
        except HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            if error.code in RETRYABLE_HTTP_CODES and attempt < 3:
                delay = retry_delay(error, attempt)
                print(f"IndexNow HTTP {error.code}; retrying in {delay}s.", file=sys.stderr)
                time.sleep(delay)
                continue
            raise RuntimeError(f"IndexNow returned HTTP {error.code}: {detail}") from error
        except URLError as error:
            if attempt < 3:
                delay = min(5 * (2 ** attempt), 30)
                print(f"IndexNow network error; retrying in {delay}s: {error}", file=sys.stderr)
                time.sleep(delay)
                continue
            raise RuntimeError(f"IndexNow request failed after retries: {error}") from error
    raise RuntimeError("IndexNow submission exhausted its retry loop.")


def write_report(lines: list[str]) -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    atomic_write(REPORT_DIR / "summary.txt", "\n".join(lines) + "\n")


def write_report_urls(filename: str, urls: list[str]) -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    atomic_write(REPORT_DIR / filename, "".join(url + "\n" for url in urls))


def validate_key(key: str) -> None:
    if not key:
        raise RuntimeError("INDEXNOW_KEY secret is missing.")
    if not (8 <= len(key) <= 128) or any(
        char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"
        for char in key
    ):
        raise RuntimeError("INDEXNOW_KEY does not match the IndexNow key format.")


def scan_and_enqueue(
    repo_root: Path,
    state_root: Path,
    state: dict,
    pages_run: dict,
    batch_size: int,
) -> tuple[int, int, list[str]]:
    checkpoint = state["last_scanned_pages_run"]
    previous_sha = checkpoint["sha"]
    deployed_sha = pages_run["head_sha"]
    if previous_sha == deployed_sha:
        state["last_scanned_pages_run"] = {
            "id": int(pages_run["id"]),
            "run_number": int(pages_run["run_number"]),
            "sha": deployed_sha,
            "created_at": pages_run["created_at"],
        }
        return 0, 0, []

    git(["cat-file", "-e", f"{previous_sha}^{{commit}}"], cwd=repo_root)
    git(["cat-file", "-e", f"{deployed_sha}^{{commit}}"], cwd=repo_root)
    ancestry = subprocess.run(
        ["git", "merge-base", "--is-ancestor", previous_sha, deployed_sha],
        cwd=repo_root,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if ancestry.returncode != 0:
        raise RuntimeError(
            "The saved queue checkpoint is not an ancestor of the latest successful "
            "Pages workflow run. Queue checkpoint was preserved; refusing to skip commits."
        )

    changed_paths_list, deleted_paths_list = changed_paths(previous_sha, deployed_sha)
    # Check the changed files in the exact deployed commit, not in a newer main tip.
    git(["checkout", "--detach", deployed_sha], cwd=repo_root)
    changed_urls = sorted({
        url for path in changed_paths_list
        if (url := public_html_url(path, require_file=True))
    })
    deleted_urls = sorted({
        url for path in deleted_paths_list
        if (url := public_html_url(path, require_file=False))
    })
    deleted_removed = remove_deleted_from_queue(state_root, set(deleted_urls))
    newly_queued = enqueue_urls(state_root, state, changed_urls, batch_size)
    state["last_scanned_pages_run"] = {
        "id": int(pages_run["id"]),
        "run_number": int(pages_run["run_number"]),
        "sha": deployed_sha,
        "created_at": pages_run["created_at"],
    }
    return newly_queued, deleted_removed, deleted_urls


def main() -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    repo = os.environ.get("GITHUB_REPOSITORY")
    event_name = os.environ.get("GITHUB_EVENT_NAME", "")
    event_sha = os.environ.get("GITHUB_SHA", "")
    event_ref = os.environ.get("GITHUB_REF", "")
    key = os.environ.get("INDEXNOW_KEY", "").strip()
    queue_branch = os.environ.get("INDEXNOW_QUEUE_BRANCH", STATE_BRANCH_DEFAULT)
    try:
        batch_size = int(os.environ.get("INDEXNOW_BATCH_SIZE", str(MAX_BATCH_SIZE)))
    except ValueError as exc:
        raise RuntimeError("INDEXNOW_BATCH_SIZE must be an integer.") from exc
    if batch_size < 1 or batch_size > MAX_BATCH_SIZE:
        raise RuntimeError(f"INDEXNOW_BATCH_SIZE must be between 1 and {MAX_BATCH_SIZE}.")
    if not repo:
        raise RuntimeError("GITHUB_REPOSITORY is missing.")
    if event_ref and event_ref != "refs/heads/main":
        write_report([
            "Result: skipped",
            f"Reason: workflow ref was {event_ref!r}, not refs/heads/main.",
            "No queue state or IndexNow submission was changed.",
        ])
        print("Not running from main; skipped safely.")
        return
    validate_key(key)

    repo_root = Path.cwd().resolve()
    if event_name == "push":
        if not event_sha:
            raise RuntimeError("GITHUB_SHA is missing for a main push event.")
        wait_for_expected_pages_run(repo, event_sha)

    current_pages_run = latest_successful_pages_run(repo)
    deployed_sha = current_pages_run["head_sha"]

    # Bootstrap from the verified last successful Pages run before the lesson
    # rollout. This captures later deployed page changes, not the entire site.
    git(["cat-file", "-e", f"{INITIAL_BASELINE_SHA}^{{commit}}"], cwd=repo_root)

    state_worktree, is_new_state = create_queue_worktree(repo_root, queue_branch)
    try:
        if is_new_state:
            state = default_state()
            if state["last_scanned_pages_run"]["sha"] != INITIAL_BASELINE_SHA:
                raise RuntimeError("Configured initial checkpoint does not match queue bootstrap.")
        else:
            state = load_state(state_worktree)

        checkpoint_before = dict(state["last_scanned_pages_run"])
        pending_count_before = pending_url_count(state_worktree)
        newly_queued, deleted_removed, deleted_urls = scan_and_enqueue(
            repo_root, state_worktree, state, current_pages_run, batch_size
        )
        queue_before_submission = pending_url_count(state_worktree)
        state_changed = (
            is_new_state
            or state["last_scanned_pages_run"] != checkpoint_before
            or deleted_removed > 0
            or newly_queued > 0
            or state.get("pending_url_count") != queue_before_submission
            or pending_count_before != queue_before_submission
        )
        if state_changed:
            state["pending_url_count"] = queue_before_submission
            state["updated_at"] = datetime.now(timezone.utc).isoformat()
            save_state(state_worktree, state)

        # Persist discovered URLs and the scan checkpoint BEFORE contacting IndexNow.
        # If the API fails or the runner stops, the URLs remain in the durable branch.
        first_commit = False
        if state_changed:
            first_commit = commit_and_push_state(
                state_worktree, queue_branch, "Queue deployed URLs for IndexNow"
            )

        next_batch = take_next_batch(state_worktree, batch_size)
        report = [
            f"Site: {SITE_ORIGIN}",
            f"Current successful Pages workflow run: #{current_pages_run['run_number']} "
            f"(run ID {current_pages_run['id']}, {deployed_sha})",
            f"Pages run created at: {current_pages_run['created_at']}",
            f"Queue state branch: {queue_branch}",
            f"New URLs added to persistent queue: {newly_queued}",
            f"Pending URLs removed because pages were deleted: {deleted_removed}",
            f"Deleted URLs (report only; not submitted): {len(deleted_urls)}",
            f"Pending URLs before this batch: {queue_before_submission}",
            f"Maximum URLs per run: {batch_size}",
        ]
        write_report_urls("deleted-report-only.txt", deleted_urls)

        if next_batch is None:
            report.insert(0, "Result: no pending URLs; nothing submitted")
            report.append("Pending URLs remaining: 0")
            write_report(report)
            print("\n".join(report))
            return

        batch_path, selected = next_batch
        report.append(f"Batch file: {batch_path.name}")
        report.append(f"URLs selected for submission: {len(selected)}")

        write_report_urls("submitted-this-run.txt", selected)
        try:
            http_status, response_body = submit(selected, key)
        except Exception as submission_error:
            failure_report = [
                "Result: submission failed; the selected batch remains in the persistent queue",
                f"Batch file: {batch_path.name}",
                f"URLs retained for retry: {len(selected)}",
                f"Pending URLs still queued: {queue_before_submission}",
                f"Failure: {type(submission_error).__name__}: {submission_error}",
            ]
            write_report(failure_report)
            raise
        if not is_submission_confirmed(http_status):
            raise RuntimeError(
                f"IndexNow returned HTTP {http_status}; only HTTP 200 or 202 acknowledges receipt."
            )

        # Dequeue only after IndexNow acknowledges receipt with HTTP 200 or 202. If the
        # following git push fails, the old batch remains remotely and may be
        # resubmitted; at-least-once retry is safer than losing URLs.
        batch_path.unlink()
        state["accepted_url_count"] = int(state.get("accepted_url_count", 0)) + len(selected)
        state["last_submission_attempt"] = {
            "http_status": http_status,
            "url_count": len(selected),
            "attempted_at": datetime.now(timezone.utc).isoformat(),
        }
        state["last_submission"] = {
            "pages_run_id": int(current_pages_run["id"]),
            "pages_run_number": int(current_pages_run["run_number"]),
            "http_status": http_status,
            "url_count": len(selected),
            "accepted_at": datetime.now(timezone.utc).isoformat(),
        }
        state["pending_url_count"] = pending_url_count(state_worktree)
        state["updated_at"] = datetime.now(timezone.utc).isoformat()
        save_state(state_worktree, state)
        try:
            second_commit = commit_and_push_state(
                state_worktree, queue_branch, "Remove IndexNow batch acknowledged by provider"
            )
        except Exception as persistence_error:
            write_report([
                "Result: IndexNow acknowledged the batch, but queue cleanup could not be saved",
                f"IndexNow HTTP status: {http_status}",
                f"Batch file: {batch_path.name}",
                f"URLs acknowledged: {len(selected)}",
                "The remote queue still contains this batch; a later run may safely submit it again.",
                f"Persistence failure: {type(persistence_error).__name__}: {persistence_error}",
            ])
            raise

        if http_status == 200:
            report.insert(0, "Result: acknowledged by IndexNow (HTTP 200)")
        else:
            report.insert(0, "Result: received; IndexNow key validation pending (HTTP 202)")
        report.extend([
            f"IndexNow HTTP status: {http_status}",
            f"Pending URLs remaining after this batch: {state['pending_url_count']}",
            f"Total URLs acknowledged since queue initialization: {state['accepted_url_count']}",
            "Queue removal is persisted only after IndexNow acknowledges receipt with HTTP 200 or 202.",
            "HTTP 202 means the URLs were received while key validation is pending.",
            "Note: IndexNow receipt does not guarantee crawling or indexing.",
        ])
        if response_body.strip():
            report.append(f"Response body: {response_body.strip()[:1000]}")
        write_report(report)
        print("\n".join(report))
        print(f"Queue checkpoint persisted: {first_commit}; submission removal persisted: {second_commit}.")
    finally:
        try:
            git(["worktree", "remove", "--force", str(state_worktree)], cwd=repo_root)
        except Exception as cleanup_error:  # report cleanup; do not hide primary result
            print(f"WARNING: could not clean temporary queue worktree: {cleanup_error}", file=sys.stderr)
            shutil.rmtree(state_worktree, ignore_errors=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        REPORT_DIR.mkdir(parents=True, exist_ok=True)
        atomic_write(REPORT_DIR / "error.txt", f"{type(exc).__name__}: {exc}\n")
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
