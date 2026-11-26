# Arabic Keyboard — persistent IndexNow queue (local review)

This package adapts the tested persistent IndexNow queue pattern for the Arabic Keyboard website. It is for local review only. Do not publish or merge it until the repository owner approves.

## Repository and website

- GitHub repository: `Mr-Amiin/arabic-keyboard`
- Production site: `https://www.arabic-keyboard.live`
- Canonical host submitted to IndexNow: `www.arabic-keyboard.live`
- Pages publishing branch: `main`
- Existing root verification file: `8407bbaca41143108c0f8ccc9ef78e0a.txt`
- Required repository Actions secret: `INDEXNOW_KEY` (create it separately in this repository; do not put the key value into workflow code)

The verification file already appears in the public repository at the root. It is intentionally public for IndexNow key verification. The workflow reads the same key from the repository Actions secret.

## Behavior

- Watches pushes to `main`, a 15-minute scheduled drain, and manual dispatch.
- For a push event, waits for the matching GitHub Pages dynamic workflow run to complete successfully before scanning.
- This repository's GitHub Pages publishing appears in Actions as the dynamic workflow named `pages build and deployment`. The script uses the GitHub Actions workflow-runs API (`actions: read`) rather than the Deployments API; the latter returned 404 for this repository.
- Schedule/manual runs select the latest successful `pages build and deployment` run on `main`.
- Compares the last scanned successful Pages run's commit to the latest successful Pages run's commit.
- Adds newly created or modified public `.html` pages to a durable queue on a separate orphan branch named `indexnow-queue`.
- Uses Git diffs, not the sitemap, as the source of changed paths. This can discover individual Learn Arabic lesson pages and other HTML pages even if the sitemap is incomplete.
- Stores pending URLs in queue files containing at most 1,000 URLs each.
- Submits no more than one batch of up to 1,000 URLs per execution. The schedule continues draining even when no new website deployment occurs.
- Removes a batch only after IndexNow returns HTTP 200 or 202. Network/API errors leave the batch queued for retry.
- If IndexNow acknowledges a batch but saving the queue removal fails, that remote batch may be submitted again. This is at-least-once delivery; duplicate notifications are preferable to losing URLs.
- Deleted URLs are reported only and removed from the pending queue if they had not yet been submitted. Deleted URLs are never sent to IndexNow.
- Queue data is kept on `indexnow-queue`, not `main`, so GitHub Pages continues publishing only the site branch.

## Verified Pages workflow history and initial backfill

The repository's Actions page currently shows these successful GitHub Pages workflow runs:

| Pages run | Run ID | Commit | Result |
|---:|---:|---|---|
| #46 | `43934867960` | `a22e363b66e27466f3b2147e57505c48f9bf29b2` | Success, November 16, 2026 |
| #47 | `44854245843` | `d8b4629` | Success, November 21, 2026 |
| #48 | `45741977530` | `b8b13dc0be3fd6a91d9a03a22f941dde29b4a3b9` | Success, November 26, 2026 |

Initial queue checkpoint: Pages run #46, commit `a22e363b66e27466f3b2147e57505c48f9bf29b2`.

At the time this package was prepared, the latest successful Pages run was #48 at commit `b8b13dc0be3fd6a91d9a03a22f941dde29b4a3b9`. The first queue run will calculate eligible changed HTML paths between the checkpoint and the latest successful Pages run available at runtime. That includes intervening deployed changes, including the Learn Arabic lesson rollout in run #47 and subsequent changes in run #48.

This is a targeted Git-history backfill, not a full sitemap or whole-site submission. Pages that were already present before the November 16 checkpoint and were not changed after it are not automatically backfilled. The script calculates the exact eligible URL count at runtime after checking the deployed commit's filesystem.

The baseline is an actual successful GitHub Pages workflow run, not a guessed Deployments API record. Run #46 is visible at:

`https://github.com/Mr-Amiin/arabic-keyboard/actions/runs/43934867960`

The latest confirmed run #48 is visible at:

`https://github.com/Mr-Amiin/arabic-keyboard/actions/runs/45741977530`

## Configuration

- Batch limit: 1,000 URLs per run
- Schedule: every 15 minutes
- Queue branch: `indexnow-queue` (created automatically on the first successful run)
- Deleted URLs: report only; remove from pending queue if not yet submitted
- Key source: repository Actions secret `INDEXNOW_KEY`
- Public key verification file: existing root TXT file; not replaced by this package
- Existing `assets/css/styles.css` and `sw.js` local modifications: not touched by this package

## Required GitHub Actions permissions

- `actions: read` — list and inspect the GitHub Pages dynamic workflow runs.
- `contents: write` — create and update the separate orphan queue branch.

The workflow's push trigger is restricted to `main`. A `GITHUB_TOKEN` push to `indexnow-queue` therefore does not trigger the queue workflow again.

## Runtime and limits

- At most one 1,000-URL batch is submitted per workflow execution.
- At one successful run every 15 minutes, 200,000 queued URLs take approximately 50 hours of scheduled intervals. GitHub can delay scheduled runs, and failures/retries extend the actual time.
- GitHub Actions concurrency uses `queue: max` (up to 100 pending workflow runs); the durable queue branch is the source of truth if transient event scheduling is delayed.
- The workflow fails safely if the checkpoint is missing, is not an ancestor of the deployed commit, or if it cannot confirm the matching Pages workflow succeeded.
- IndexNow acknowledgement means the URLs were received; it does not guarantee crawling or indexing.

## Files

- `.github/workflows/indexnow-submit.yml` — queue workflow
- `scripts/indexnow-submit.py` — persistent queue logic
- `tests/indexnow/test_queue_helpers.py` — offline unit/integration tests
- `README.md` — this review document

## Local tests

From the repository root, using Python 3.10 or later:

```powershell
python -m py_compile .\scripts\indexnow-submit.py
python -m unittest discover -s .\tests\indexnow -v
```

Tests do not call live GitHub or IndexNow APIs. The orphan-branch integration test pushes only to a temporary local bare Git repository.
