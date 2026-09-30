---
"zgsm": minor
---

feat(providers): add OrcaRouter as a named provider

Adds `orcarouter` as a first-class dynamic provider mirroring the existing
`vercel-ai-gateway` integration: provider schema/settings, handler (OpenAI-compatible
chat completions against `https://api.orcarouter.ai/v1`), dynamic model sync from
`https://api.orcarouter.ai/v1/models`, UI entry with API key field + model picker,
settings i18n (en / zh-CN / zh-TW), CLI provider support via `ORCAROUTER_API_KEY`,
and unit tests.
