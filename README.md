This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Запуск в Docker (постоянная копия на этом компьютере)

Нужен запущенный Docker Desktop и заполненный `.env` (он подхватывается целиком).

```bash
npm run deploy        # собрать и (пере)запустить — http://localhost:3080
npm run deploy:logs   # логи (ссылки приглашений при MAIL_TRANSPORT=console)
npm run deploy:stop   # остановить
```

- Работает рядом с `npm run dev` (порт 3000), со своей базой в томе `portal-data`.
- На пустой базе один раз выполняется `prisma/seed.ts` — админ из `SEED_ADMIN_*`.
- При обновлении схема догоняется через `prisma db push`; изменения, теряющие данные, он не применит.
- Контейнер перезапускается вместе с Docker Desktop (`restart: unless-stopped`).
- `deploy` сам запускает Docker Desktop, если он не запущен (`scripts/docker-up.ps1`), и перед этим убирает в сторону папки с застрявшими сокетами — иначе на этой сборке Windows Docker падает с «remove …sock: The file cannot be accessed by the system».
- Перенести данные из dev-базы: `docker compose cp prisma/dev.db app:/data/portal.db`, затем `docker compose restart app`.
