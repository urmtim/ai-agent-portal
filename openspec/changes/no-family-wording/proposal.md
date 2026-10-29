# Proposal

## Why

Портал — не «семейный»: пользователь просит не использовать слово «семья», только «пользователи».

## What Changes

- Группа меню «Семья (скрыто)» → «Личное (скрыто)» (Обучение, Траты, Прогресс) — в трее и в макете.
- Описание сайта: «Семейный хаб…» → «AI Portal: ассистент, агенты, обучение».
- Назначение спецификации пользователей: «члены семьи» → «пользователи».
- **BREAKING:** нет.

## Capabilities

### New Capabilities
<!-- нет -->

### Modified Capabilities
- `app-navigation`: название группы в трее.

## Impact

- `lib/nav.ts`, `app/layout.tsx`, `mockups/portal-all-screens.html`, `openspec/specs/user-admin/spec.md` (назначение), тестовый текст в `lib/chat/history.test.ts`.
