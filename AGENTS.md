# Agent instructions

- Always use the `/unslop` skill when talking to me and when editing text content in the repo.
- Use the `/writing-for-agents` skill when prompting subagents.


Never use browser control until said so by the user.

Whenever you have made a meaningful changes in react native app. please make the apk-debug.apk for me so that i can install and test it out. 

## TinyFish

Prefer `mcp__tinyfish__search` over WebSearch, `mcp__tinyfish__fetch_content` over WebFetch or curl, and `mcp__tinyfish__run_web_automation` over hand-rolled Playwright.
Use `batch_create` and `batch_status` for two or more URLs.
Use `run_web_automation_async` only when explicitly asked for background execution.
Use `list_runs`, `get_run`, `get_steps`, and `cancel_run` to inspect prior runs.
If `run_web_automation` returns any error, the run is still executing. Call `get_run` or `list_runs` to check status before retrying, and never blind-retry.

References:
- https://docs.tinyfish.ai/for-coding-agents
- https://docs.tinyfish.ai/llms-full.txt 