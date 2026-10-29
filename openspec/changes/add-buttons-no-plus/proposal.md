# Proposal

## Why

Пользователь хочет кнопки добавления без «+» в подписи: «Добавить модель» вместо «+ Добавить модель». Для единообразия так же у остальных кнопок добавления над таблицами.

## What Changes

- «Добавить модель», «Новый агент», «Добавить пользователя» — без «+». «+ Фильтр» и «+ Новый чат» не меняются: это другие элементы (фильтр и пункт истории).
- **BREAKING:** нет.

## Capabilities

### New Capabilities
<!-- нет -->

### Modified Capabilities
- `llm-models`, `agents-list`, `user-admin`: подписи кнопок добавления.

## Impact

- `app/(app)/models/ModelModals.tsx`, `app/(app)/agents/AgentModals.tsx`, `app/(app)/admin/users/UserModals.tsx`, `mockups/portal-all-screens.html`.
