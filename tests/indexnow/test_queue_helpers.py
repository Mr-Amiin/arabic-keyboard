from __future__ import annotations

import importlib.util
import tempfile
import unittest
import subprocess
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "indexnow-submit.py"
SPEC = importlib.util.spec_from_file_location("indexnow_submit", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class QueueHelperTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.state = MODULE.default_state()

    def tearDown(self):
        self.temp.cleanup()

    def test_enqueue_chunks_at_1000_and_deduplicates_pending(self):
        urls = [f"https://www.arabic-keyboard.live/page-{i}.html" for i in range(2205)]
        count = MODULE.enqueue_urls(self.root, self.state, urls, 1000)
        self.assertEqual(count, 2205)
        files = MODULE.pending_files(self.root)
        self.assertEqual([len(MODULE.read_pending_file(p)) for p in files], [1000, 1000, 205])
        self.assertEqual(MODULE.enqueue_urls(self.root, self.state, urls[:10], 1000), 0)
        self.assertEqual(MODULE.pending_url_count(self.root), 2205)

    def test_deleted_urls_are_removed_from_pending_only(self):
        urls = [f"https://www.arabic-keyboard.live/page-{i}.html" for i in range(12)]
        MODULE.enqueue_urls(self.root, self.state, urls, 1000)
        removed = MODULE.remove_deleted_from_queue(self.root, {urls[1], urls[5], "https://x.invalid/not-present"})
        self.assertEqual(removed, 2)
        remaining = [u for p in MODULE.pending_files(self.root) for u in MODULE.read_pending_file(p)]
        self.assertEqual(len(remaining), 10)
        self.assertNotIn(urls[1], remaining)
        self.assertNotIn(urls[5], remaining)

    def test_take_next_batch_does_not_exceed_limit(self):
        urls = [f"https://www.arabic-keyboard.live/page-{i}.html" for i in range(1001)]
        MODULE.enqueue_urls(self.root, self.state, urls, 1000)
        first = MODULE.take_next_batch(self.root, 1000)
        self.assertIsNotNone(first)
        self.assertEqual(len(first[1]), 1000)

    def test_public_html_url_handles_index_and_exclusions(self):
        (self.root / "tools").mkdir()
        (self.root / "tools" / "index.html").write_text("ok", encoding="utf-8")
        (self.root / "space page.html").write_text("ok", encoding="utf-8")
        old_cwd = Path.cwd()
        try:
            import os
            os.chdir(self.root)
            self.assertEqual(
                MODULE.public_html_url("tools/index.html", require_file=True),
                "https://www.arabic-keyboard.live/tools/",
            )
            self.assertEqual(
                MODULE.public_html_url("space page.html", require_file=True),
                "https://www.arabic-keyboard.live/space%20page.html",
            )
            self.assertIsNone(MODULE.public_html_url("scripts/indexnow-submit.py.html", require_file=False))
            self.assertIsNone(MODULE.public_html_url(".hidden/page.html", require_file=False))
        finally:
            os.chdir(old_cwd)


    def test_scan_diff_queues_added_and_modified_html_only(self):
        import os
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            repo = root / "repo"
            state_root = root / "state"
            state_root.mkdir()
            repo.mkdir()
            subprocess.run(["git", "init", "-b", "main", str(repo)], check=True, capture_output=True)
            subprocess.run(["git", "config", "user.name", "Test"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True)
            (repo / "index.html").write_text("old", encoding="utf-8")
            (repo / "removed.html").write_text("remove me", encoding="utf-8")
            (repo / "site.css").write_text("a{}", encoding="utf-8")
            subprocess.run(["git", "add", "."], cwd=repo, check=True)
            subprocess.run(["git", "commit", "-m", "baseline"], cwd=repo, check=True, capture_output=True)
            base_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()

            (repo / "index.html").write_text("updated", encoding="utf-8")
            (repo / "new").mkdir()
            (repo / "new" / "index.html").write_text("new page", encoding="utf-8")
            (repo / "removed.html").unlink()
            (repo / "site.css").write_text("b{}", encoding="utf-8")
            subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
            subprocess.run(["git", "commit", "-m", "site update"], cwd=repo, check=True, capture_output=True)
            target_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()

            state = {
                "last_scanned_pages_run": {"id": 1, "run_number": 46, "sha": base_sha, "created_at": "2026-01-01T00:00:00Z"},
                "next_batch_number": 1,
            }
            deployment = {"id": 2, "run_number": 48, "head_sha": target_sha, "created_at": "2026-01-02T00:00:00Z"}
            original_cwd = Path.cwd()
            try:
                os.chdir(repo)
                queued, deleted_removed, deleted_urls = MODULE.scan_and_enqueue(
                    repo, state_root, state, deployment, 1000
                )
            finally:
                os.chdir(original_cwd)

            self.assertEqual(queued, 2)
            self.assertEqual(deleted_removed, 0)
            self.assertEqual(deleted_urls, ["https://www.arabic-keyboard.live/removed.html"])
            all_pending = [u for p in MODULE.pending_files(state_root) for u in MODULE.read_pending_file(p)]
            self.assertEqual(set(all_pending), {
                "https://www.arabic-keyboard.live/",
                "https://www.arabic-keyboard.live/new/",
            })
            self.assertEqual(state["last_scanned_pages_run"]["sha"], target_sha)

    def test_orphan_queue_branch_can_be_created_pushed_and_updated(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            repo = root / "repo"
            remote = root / "remote.git"
            repo.mkdir()
            subprocess.run(["git", "init", "--bare", str(remote)], check=True, capture_output=True)
            subprocess.run(["git", "init", "-b", "main", str(repo)], check=True, capture_output=True)
            subprocess.run(["git", "config", "user.name", "Test"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True)
            (repo / "index.html").write_text("test", encoding="utf-8")
            subprocess.run(["git", "add", "."], cwd=repo, check=True)
            subprocess.run(["git", "commit", "-m", "initial"], cwd=repo, check=True, capture_output=True)
            subprocess.run(["git", "remote", "add", "origin", str(remote)], cwd=repo, check=True)
            subprocess.run(["git", "push", "-u", "origin", "main"], cwd=repo, check=True, capture_output=True)

            worktree, is_new = MODULE.create_queue_worktree(repo, "indexnow-queue")
            try:
                self.assertTrue(is_new)
                self.assertEqual(MODULE.git(["status", "--porcelain"], cwd=worktree), "")
                head_check = subprocess.run(
                    ["git", "rev-parse", "--verify", "HEAD"], cwd=worktree,
                    capture_output=True, text=True,
                )
                self.assertNotEqual(head_check.returncode, 0, "new orphan worktree must have no HEAD commit")
                state = MODULE.default_state()
                MODULE.save_state(worktree, state)
                self.assertTrue(MODULE.commit_and_push_state(worktree, "indexnow-queue", "seed queue"))
                first_commit = subprocess.check_output(
                    ["git", "rev-list", "--parents", "-n", "1", "HEAD"], cwd=worktree, text=True
                ).strip().split()
                self.assertEqual(len(first_commit), 1, "the initial queue commit must be a root commit")
                tree_files = subprocess.check_output(
                    ["git", "--git-dir", str(remote), "ls-tree", "-r", "--name-only", "refs/heads/indexnow-queue"],
                    text=True,
                ).splitlines()
                self.assertEqual(tree_files, ["queue-state.json"])
            finally:
                MODULE.git(["worktree", "remove", "--force", str(worktree)], cwd=repo)

            worktree, is_new = MODULE.create_queue_worktree(repo, "indexnow-queue")
            try:
                self.assertFalse(is_new)
                state = MODULE.load_state(worktree)
                state["accepted_url_count"] = 7
                MODULE.save_state(worktree, state)
                self.assertTrue(MODULE.commit_and_push_state(worktree, "indexnow-queue", "update queue"))
            finally:
                MODULE.git(["worktree", "remove", "--force", str(worktree)], cwd=repo)

    def test_latest_successful_pages_run_ignores_newer_failed_run(self):
        runs = [
            {
                "id": 48, "run_number": 48, "name": "pages build and deployment",
                "head_branch": "main", "head_sha": "b8b13dc", "status": "completed",
                "conclusion": "success", "created_at": "2026-11-26T02:22:00Z",
            },
            {
                "id": 49, "run_number": 49, "name": "pages build and deployment",
                "head_branch": "main", "head_sha": "deadbeef", "status": "completed",
                "conclusion": "failure", "created_at": "2026-11-26T03:00:00Z",
            },
            {
                "id": 50, "run_number": 50, "name": "unrelated workflow",
                "head_branch": "main", "head_sha": "cafebabe", "status": "completed",
                "conclusion": "success", "created_at": "2026-11-26T04:00:00Z",
            },
        ]
        with patch.object(MODULE, "list_pages_workflow_runs", return_value=runs):
            selected = MODULE.latest_successful_pages_run("Mr-Amiin/arabic-keyboard")
        self.assertEqual(selected["run_number"], 48)
        self.assertEqual(selected["head_sha"], "b8b13dc")

    def test_pages_workflow_run_filter_requires_main_and_exact_name(self):
        good = {
            "name": "pages build and deployment", "head_branch": "main",
            "head_sha": "abc123",
        }
        self.assertTrue(MODULE.is_pages_workflow_run(good))
        self.assertFalse(MODULE.is_pages_workflow_run({**good, "head_branch": "feature"}))
        self.assertFalse(MODULE.is_pages_workflow_run({**good, "name": "other workflow"}))

    def test_wait_for_expected_pages_run_matches_exact_sha_and_success(self):
        runs = [{
            "id": 45741977530, "run_number": 48,
            "name": "pages build and deployment", "head_branch": "main",
            "head_sha": "b8b13dc0be3fd6a91d9a03a22f941dde29b4a3b9",
            "status": "completed", "conclusion": "success",
            "created_at": "2026-11-26T02:22:00Z",
        }]
        with patch.object(MODULE, "list_pages_workflow_runs", return_value=runs):
            selected = MODULE.wait_for_expected_pages_run(
                "Mr-Amiin/arabic-keyboard", "b8b13dc0be3fd6a91d9a03a22f941dde29b4a3b9"
            )
        self.assertEqual(selected["run_number"], 48)

    def test_wait_for_expected_pages_run_fails_if_matching_pages_run_failed(self):
        failed = [{
            "id": 999, "run_number": 49,
            "name": "pages build and deployment", "head_branch": "main",
            "head_sha": "failed-sha", "status": "completed", "conclusion": "failure",
            "created_at": "2026-11-26T03:00:00Z",
        }]
        with patch.object(MODULE, "list_pages_workflow_runs", return_value=failed):
            with self.assertRaisesRegex(RuntimeError, "completed without success"):
                MODULE.wait_for_expected_pages_run("Mr-Amiin/arabic-keyboard", "failed-sha")

    def test_http_200_and_202_both_acknowledge_submission(self):
        self.assertTrue(MODULE.is_submission_confirmed(200))
        self.assertTrue(MODULE.is_submission_confirmed(202))
        self.assertFalse(MODULE.is_submission_confirmed(400))
        self.assertFalse(MODULE.is_submission_confirmed(403))
        self.assertFalse(MODULE.is_submission_confirmed(429))

    def test_initial_baseline_matches_verified_first_activation(self):
        self.assertEqual(
            MODULE.default_state()["last_scanned_pages_run"]["sha"],
            "a22e363b66e27466f3b2147e57505c48f9bf29b2",
        )


if __name__ == "__main__":
    unittest.main()
