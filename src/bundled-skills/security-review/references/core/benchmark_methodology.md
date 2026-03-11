# Benchmark Regression Testing Methodology

Measures and prevents capability regression of the security-review skill.

## 1. Benchmark Projects (测试基准项目)

| Language | Project | Key Vulns | Expected Findings |
|----------|---------|-----------|-------------------|
| Java | WebGoat (OWASP) | SQL injection, XSS, auth bypass, XXE | >=15 |
| Java | DVJA (Damn Vulnerable Java App) | Deserialization, SSRF, IDOR | >=10 |
| Python | DVWA-Python | SQL injection, command injection, file upload | >=8 |
| JavaScript | Juice Shop (OWASP) | NoSQL injection, XSS, auth issues | >=12 |
| Go | Go-Damn-Vulnerable | SSRF, race condition, path traversal | >=6 |
| PHP | DVWA | SQL injection, XSS, command injection, file inclusion | >=10 |
| Multi | DataEase v2 (real project) | 68 known findings from validated audit | >=50 (recall >=73%) |

Each project has a published answer key. DataEase v2 is the real-world anchor with validated ground truth.

## 2. Regression Test Protocol (回归测试流程)

**Steps:** (1) Run `standard` mode audit on benchmark project. (2) Collect findings (ID, severity, CWE, file, description). (3) Compare against known vuln list via fuzzy match on CWE + file/function scope. (4) Calculate metrics.

| Metric | Formula | Goal |
|--------|---------|------|
| **Recall** | found_known / total_known | >=70% |
| **Precision** | true_positives / total_reported | >=85% |
| **F1 Score** | 2 * P * R / (P + R) | >=77% |
| **Coverage** | dimensions_covered / 10 | >=8/10 |

**Matching rules:** Same CWE + overlapping file scope = match. Correct CWE but wrong location = 0.5. Duplicates of same vuln = 1 TP.

**Verdict:** All metrics meet goals = PASS. Any drop 1-5% = WARNING. Any drop >5% = FAIL (block change).

## 3. Capability Baseline (能力基线)

Baseline from DataEase v2 audit (2026-02):

| Metric | R1 (Standard) | R1+R2 (Deep) |
|--------|---------------|--------------|
| Findings | 48 | 68 |
| Dimensions | 9/10 | 10/10 |
| Recall vs known | ~71% | ~100% |
| Estimated FP rate | <15% | <15% |
| Token cost | ~400K | ~800K |

**Per-dimension minimums (R1):** Injection >=5, Auth >=4, Crypto >=2, Data Exposure >=3, Deserialization >=2, SSRF >=2, File Ops >=3, Business Logic >=2, Configuration >=3, Supply Chain >=1.

## 4. Regression Triggers (回归触发条件)

**Full suite:** After changes to `agent.md` state machine / agent contract, checklist files (`coverage_matrix.md`, `java.md`, etc.), framework/language modules, `sinks_sources.md` or `taint_analysis.md`. Monthly scheduled check.

**Smoke test only:** Prompt tweaks, reference doc additions that do not change core logic, minor changes where full suite is overkill.

## 5. Quick Smoke Test (快速冒烟测试)

Target: under 5 minutes. Uses a single Java class (`SmokeTestVulnApp.java`) with 5 planted vulns:

1. SQL injection via string concatenation in JDBC query
2. Path traversal in file download endpoint
3. Hardcoded credential (API key in source)
4. Missing authentication on admin endpoint
5. Unsafe deserialization of user input

| Check | Requirement |
|-------|-------------|
| Detection rate | >=4 of 5 vulns found |
| Output format | HEADER and SENTINEL markers present |
| File paths | Every reported path exists (no hallucination) |
| Severity accuracy | SQLi and deserialization rated HIGH or CRITICAL |
| No crashes | Audit completes without tool errors |

```bash
claude -p "Run /audit in quick mode on ./smoke-test-fixture/" \
  --allowedTools 'Bash,Read,Glob,Grep,Write' > smoke_result.txt
# Verify: grep -c "SENTINEL" smoke_result.txt >= 1
# Verify: grep -c "SQL.Injection\|SQLi" smoke_result.txt >= 1
# Verify: grep -c "Deserialization" smoke_result.txt >= 1
```

**Result:** 5/5 = operational. 4/5 = acceptable (investigate miss). <=3/5 = regression, block change.

## Appendix: Test Record Template

```
Date: YYYY-MM-DD
Change: <what changed>
Trigger: <Section 4 trigger>
Test: <full suite | smoke>
Results:
  Recall:    XX% (baseline: XX%)  [PASS/WARN/FAIL]
  Precision: XX% (baseline: XX%)  [PASS/WARN/FAIL]
  F1:        XX% (baseline: XX%)  [PASS/WARN/FAIL]
  Coverage:  X/10 (baseline: X/10) [PASS/WARN/FAIL]
Verdict: PASS / FAIL
Notes: <observations>
```
