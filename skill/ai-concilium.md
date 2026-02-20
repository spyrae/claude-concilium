# AI Concilium — Multi-Agent Consultation

A methodology for solving complex problems by consulting multiple AI agents with iterative refinement until consensus is reached.

---

## When to Use

1. **Problem persists after 3 attempts** — mandatory trigger
2. **Complex architectural decisions** — multiple equally valid approaches
3. **Non-obvious bugs** — race conditions, state issues, silent failures
4. **Critical optimizations** — when the cost of error is high
5. **Legacy refactoring** — need plan validation from multiple sources
6. **Code review after fix** — independent quality verification

---

## Participants

### Primary (run in parallel)

| Agent | Model | Tool |
|-------|-------|------|
| **OpenAI** | Codex | `mcp__openai__openai_chat` |
| **Gemini** | gemini-2.5-pro | `mcp__gemini__gemini_chat` |

### Fallback Chain (on errors)

```
OpenAI (openai_chat)   → on QUOTA/error → Qwen (qwen_chat)   → DeepSeek (chat_completion)
Gemini (gemini_chat)   → on QUOTA/error → Qwen (qwen_chat)   → DeepSeek (chat_completion)
```

**IMPORTANT**: If response contains `QUOTA_EXCEEDED`, `usage limit` or `error` — switch to fallback immediately, do NOT retry.

**IMPORTANT**: If both primary agents are unavailable — run concilium with Qwen + DeepSeek.

---

## Protocol

### Iteration 1: Gather Opinions

**Step 1.1** — Formulate the problem concisely (under 500 chars):
```
[Context 1-2 sentences]. [Problem]. [Specific question?]
```

**Step 1.2** — Send to both agents **in parallel**:

```
# OpenAI (primary)
mcp__openai__openai_chat:
  prompt: "Review this code change. [Description]. Check: correctness, edge cases, race conditions."
  timeout: 90
  cwd: "$PROJECT_ROOT"

# Gemini (primary)
mcp__gemini__gemini_chat:
  prompt: "Senior code review. [Description + diff]. Focus on reliability, error handling, race conditions."
  timeout: 90
```

**Error Handling (Step 1.2a):**

```
# If OpenAI → QUOTA/error — first fallback:
mcp__qwen__qwen_chat:
  prompt: "[same prompt]"
  model: "qwen-plus"

# If Qwen also fails — second fallback:
mcp__deepseek__chat_completion:
  prompt: "[same prompt]"
```

**Step 1.3** — Compare responses:
- What's common? (high confidence)
- Where do they disagree? (needs clarification)
- What new ideas emerged?

---

### Iteration 2: Resolve Disagreements (optional)

Only if Iteration 1 has significant disagreements.

**Step 2.1** — Synthesize and formulate clarifying questions.

**Step 2.2** — Send clarifications (in parallel, to the same agents that responded):

```
# Agent A
"Agent A suggested X, Agent B suggested Y for [problem]. Which approach is better for [context]? Tradeoffs?"

# Agent B
"Clarification: [question about disagreement]. Context: [synthesized findings]. Which approach and why?"
```

**Step 2.3** — Update synthesis.

---

### Iteration 3: Final Consensus (optional)

Only for critical decisions.

```
# To both agents:
"Final plan: 1) [step]. 2) [step]. 3) [step]. Any concerns or gaps?"
```

---

## Code Review Mode

### Protocol

1. **Collect diff** — all changed files after fix
2. **Send for review in parallel**:
   - OpenAI: `openai_chat` with brief description + key changes
   - Gemini: `gemini_chat` with full diff + context
3. **Handle errors (fallback chain)**:
   - OpenAI unavailable → Qwen → DeepSeek
   - Gemini unavailable → Qwen → DeepSeek
4. **Synthesize**:
   - Both approved → fix accepted
   - Feedback received → iterate
   - Contradiction → iteration 2

### Code Review Prompt Template

```
# OpenAI (openai_chat)
"Code review: Fixed [problem] in [file]. Changed [what]. Check: 1) fix correct? 2) new issues? 3) edge cases?"

# Gemini (gemini_chat)
"Senior code reviewer. Review this diff for [problem]:

[paste diff]

Context: [brief description]

Check:
1. Does the fix solve the problem?
2. New issues introduced?
3. Edge cases missed?
4. Race conditions?
5. Error handling completeness?

Verdict: APPROVE or REQUEST_CHANGES with specific feedback."
```

---

## Agent Invocation Rules

### OpenAI (via mcp-openai)

```
# Chat:
mcp__openai__openai_chat:
  prompt: "Short problem description. Question?"
  timeout: 90
  cwd: "/path/to/project"

# Code review via codex review:
mcp__openai__openai_review:
  instructions: "Focus on error handling and race conditions"
  uncommitted: true
  cwd: "/path/to/project"
  timeout: 120
```

### Gemini (via mcp-gemini)

```
# Quick response:
mcp__gemini__gemini_chat:
  prompt: "Review this code: [description]. Check correctness, edge cases."
  timeout: 90

# Deep analysis (large context, up to 1M tokens):
mcp__gemini__gemini_analyze:
  prompt: "Full code review of this large diff: [paste full diff]."
  timeout: 180
```

### Qwen (first fallback, via mcp-qwen)

```
# Deep analysis:
mcp__qwen__qwen_chat:
  prompt: "Senior review: [diff/code]. Check reliability, errors, races."
  model: "qwen-plus"

# Large context:
mcp__qwen__qwen_chat:
  prompt: "Analyze this large section: [code]."
  model: "qwen-long"
```

### DeepSeek (second fallback)

```
mcp__deepseek__chat_completion:
  prompt: "Review this code: [description]. Check correctness, edge cases, race conditions."
```

---

## Documentation Template

```markdown
## AI Concilium: [Problem Name]

### Problem
[Brief description]

### Iteration 1
**OpenAI:** [Key points]
**Gemini:** [Key points]
**Consensus:** [Common ground]
**Disagreements:** [What to clarify]

### Decision
[Final action plan]
```

---

## Workflow Integration

1. **Attempts 1-3**: Solve independently
2. **After 3rd failure**: Mandatory AI Concilium
3. **After every fix**: Code review via Concilium
4. **Document**: Record in task comments
5. **Update knowledge base**: If non-obvious pattern found

---

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| OpenAI: `QUOTA_EXCEEDED` | Weekly credit limit reached | Fallback → Qwen → DeepSeek |
| OpenAI: `MODEL_NOT_SUPPORTED` | Model unavailable on plan | Don't specify model, use default |
| OpenAI: `AUTH_EXPIRED` | OAuth token expired | Run `codex login` in terminal |
| OpenAI: timeout | Process hung | Auto-killed; fallback → Qwen |
| Gemini: `QUOTA_EXCEEDED` | 1000 req/day exhausted | Fallback → Qwen → DeepSeek |
| Gemini: `AUTH_REQUIRED` | Google OAuth not set up | Run `gemini` in terminal to login |
| Qwen: timeout | CLI not responding | Fallback → DeepSeek |
| All agents unavailable | Network issues | Wait, check internet |
