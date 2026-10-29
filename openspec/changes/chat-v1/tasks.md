# Tasks

## 1. Данные и ядро

- [ ] 1.1 Добавить модель `Chat` в `prisma/schema.prisma` (связь с `User` и `LlmModel`, SetNull для модели), `npx prisma db push`. Проверка: `npx prisma validate`, `npx tsc --noEmit`.
- [ ] 1.2 Создать `lib/chat/history.ts`: `groupChats(chats, now)` и `fallbackTitle(text)`; тесты `lib/chat/history.test.ts`. Проверка: `npm test`.
- [ ] 1.3 Создать `lib/chat/model.ts` (`chatModel(modelId)` через `@ai-sdk/openai-compatible`) и `lib/chat/tools.ts` (`get_spending`, `run_agent` для пользователя). Проверка: `npx tsc --noEmit`.

## 2. API и действия

- [ ] 2.1 Создать `app/api/chat/route.ts`:
  - сессия, владелец чата, создание чата по id клиента;
  - `validateUIMessages`, сохранение до и после ответа;
  - `streamText` с инструментами, `toolApproval`, подписью подтверждений, `stopWhen`;
  - текст ошибки без токена.

  Проверка: `npx tsc --noEmit`.
- [ ] 2.2 Создать `app/(app)/chat/actions.ts`: `ensureChatTitle`, `setChatModel`, `pinChat`, `archiveChat`, `deleteChat` — только для своих чатов. Проверка: `npx tsc --noEmit`.

## 3. Экран

- [ ] 3.1 Перенести стили чата из макета в `app/globals.css`.
- [ ] 3.2 Страницы `app/(app)/chat/page.tsx` и `app/(app)/chat/[id]/page.tsx`: список чатов, модели, `notFound()` для чужого чата.
- [ ] 3.3 `ChatHistory`: «+ Новый чат», поиск, группы (сворачиваются), меню чата (закрепить, архив, удалить с подтверждением), скрытие и мобильный режим.
- [ ] 3.4 `ChatThread`: `useChat`, выбор модели, пустое состояние с подсказками, Markdown, Enter/Shift+Enter, «Остановить», ошибки, «Копировать»/«Повторить»/«Изменить», строки инструментов, карточка подтверждения, смена адреса и название после первого ответа.

  Проверка: `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## 4. Проверка

- [ ] 4.1 Научить заглушку LLM потоковым ответам и вызовам инструментов; прогнать сценарии в браузере без окна на копии базы:
  - новый чат, поток, остановка, адрес и название;
  - история: поиск, закрепление, архив, удаление;
  - смена модели;
  - копировать, повторить, изменить;
  - «Траты», запуск агента с подтверждением и отказом;
  - чужой чат и API без сессии.
- [ ] 4.2 `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` без ошибок.
