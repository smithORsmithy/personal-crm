# Tasks

Порядок в каждой задаче с кодом: сначала тест, запустить его и увидеть, что он красный; потом код; снова тест — зелёный. Название теста — название сценария из `specs/sign-in/spec.md`. Для тестов нужны запущенные база и Mailpit: `docker compose up -d`. Решения, на которые ссылаются задачи, — в `design.md`.

Работа идёт в ветке `sign-in-error-logs`.

Во всех тестах «значений нет» значит: в собранном выводе консоли и в `util.inspect` ошибки, которая вылетела наружу, нет `params:`, нет ключа сессии (часть cookie `better-auth.session_token` до точки, после `decodeURIComponent`), нет ключа из ссылки (`token` из адреса ссылки) и нет почты.

## 1. Общие части

- [x] 1.1 Помощник `captureConsole()` в `test/console.ts`:
  - перехватывает `console.error`, `console.warn`, `console.log`;
  - отдаёт собранный текст: `util.inspect` каждого аргумента, строки как есть;
  - снимает перехват в `afterEach` через `vi.restoreAllMocks()`, как в существующих тестах;

  проверка — `pnpm typecheck` без ошибок
- [x] 1.2 Открыть `describeError` в `src/db/log-error.ts` для других файлов, правила не менять (решение 1); проверка — `pnpm test` зелёный, как и до правки

## 2. Журнал библиотеки входа

- [x] 2.1 Тест «Выйти при остановленной базе» в `src/lib/auth/session-check.test.ts` или новом `src/lib/auth/library-log.test.ts`:
  - настоящий cookie через `signInAs` на тестовой базе;
  - `auth.api.signOut` с `withUnreachableDb` и `captureConsole()`;
  - выход проходит: вызов не падает, а в `set-cookie` ответа (`returnHeaders: true`) cookie `better-auth.session_token` стёрт, поэтому дальше открывается страница входа;
  - значений нет;
  - есть `"sessions"`, `$1` и `ECONNREFUSED`;

  и тест `logAuthLibraryMessage` напрямую:
  - многострочное сообщение — в выводе только первая строка;
  - приложенный объект, который не ошибка, не попадает в вывод;
  - `warn` идёт в `console.warn`;

  запустить — красные. Написать `logAuthLibraryMessage` в `src/lib/auth/library-log.ts` и передать её в `createAuth` как `logger: { log }` (решение 1); проверка — тесты зелёные, `pnpm test src/lib/auth` зелёный целиком

## 3. Ответы на адреса `/api/auth/*`

- [x] 3.1 Тест «Открыть ссылку из письма при остановленной базе» в новом `src/lib/auth/route-answer.test.ts`:
  - ссылка для anna@example.com запрошена на тестовой базе (`requestSignInLink`, `linkIn`);
  - затем `answerAuthRequest(auth, new Request(link))` с `withUnreachableDb` и `captureConsole()`;
  - ответ `500`;
  - значений нет (ключ из ссылки, anna@example.com);
  - есть `"verifications"`, `$1`, `$2` и `ECONNREFUSED`;

  и тест, что исправная ссылка по-прежнему впускает (`location` — `/`, есть cookie). Запустить — красные. Включить `onAPIError: { throw: true }` в `createAuth`, написать `answerAuthRequest` в `src/lib/auth/route-answer.ts`, вызвать её из `GET` и `POST` в `src/app/api/auth/[...all]/route.ts` (решение 2); проверка — тесты зелёные, `pnpm test src/lib/auth` зелёный целиком (в том числе «Ссылку открыли второй раз», «Прошло больше 15 минут»)

## 4. Ошибки, которые уходят в Next.js

- [x] 4.1 Тест «Открыть страницу при остановленной базе» в `src/lib/auth/session-check.test.ts`:
  - `readSignedInUser` с настоящим cookie и `withUnreachableDb` отпускает ошибку `Could not check who is signed in`;
  - значений нет ни в выводе консоли, ни в `util.inspect` ошибки;
  - в выводе есть `"sessions"`, `$1` и `ECONNREFUSED`;

  плюс «вошедший — его номер и почта» и «без входа — null» на тестовой базе. Такой же тест в `src/lib/auth/proxy-answer.test.ts`: страница при недоступной базе — ошибка без значений, форма по-прежнему проходит к действию. Запустить — красные. Написать `readSignedInUser`, перевести на неё `getCurrentUser` в `src/lib/auth/current-user.ts`, в `answerRequest` заменить `throw error` на `logDbError` и простую ошибку (решение 3); проверка — тесты зелёные, прежние тесты `proxy-answer.test.ts` и `session-check.test.ts` зелёные
- [x] 4.2 Тесты «Запросить ссылку при остановленной базе» в `src/lib/auth/sign-in-request.test.ts` (решение 4):
  - **база не отвечает:** `requestSignInLink` для anna@example.com с `withUnreachableDb` отпускает ошибку; значений нет; есть `ECONNREFUSED`;
  - **запрос к базе упал:** внутри `withRollback` удалить таблицу `sign_in_emails` (`drop table`), вызвать `requestSignInLink`; значений нет; есть `"sign_in_emails"` и `$1`;

  запустить — второй красный. Ловить сбой `takePlaceInLimit` в `requestSignInLink`: `logDbError("Failed to count sign-in emails", …)` и простая ошибка `Could not count sign-in emails` (решение 3); проверка — тесты зелёные, прежние тесты `sign-in-request.test.ts` (лимит 3 письма, отмена прежних ссылок) зелёные

## 5. Текст запроса в собранном приложении

Добавлено после проверки собранного приложения, решение владельца (решение 5 в `design.md`).

- [x] 5.1 Тесты в новом `src/db/log-error.test.ts`:
  - **ошибка с полями Drizzle, но не его класса** (как из другой части сборки): в выводе `logDbError` есть `type: 'DrizzleQueryError'` и текст запроса с `$1`; нет `params:` и значения из `params`;
  - **настоящая `DrizzleQueryError`:** так же;
  - **ошибка с `query`, но без `params`:** текст запроса не пишется;

  запустить — первый красный. Узнавать ошибку Drizzle по полям `query` (строка) и `params` (список) в `describeError`; проверка — тесты зелёные, `pnpm test` зелёный целиком
- [x] 5.2 Агент проходит четыре сценария в собранном приложении (`pnpm build`, `tsx e2e/start-app.ts 3100` на базе e2e, `docker compose stop db` и потом `start`) через Playwright и смотрит журнал приложения; проверка — во всех четырёх нет ключей сессии, ключа из ссылки, почты и `params:`; в сценариях со страницей, ссылкой и выходом есть текст запроса с `$1`; экраны — как в спеке

## 6. Итоговая проверка

- [x] 6.1 `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` (в том числе `e2e/sign-in.spec.ts` и `e2e/main-scenario.spec.ts`), `pnpm build` без ошибок и предупреждений; `openspec validate sign-in-error-logs --strict` проходит
- [x] 6.2 Ручная проверка владельцем в браузере на компьютере всех четырёх сценариев `specs/sign-in` этого изменения:
  - **приложение — собранное, как на сервере**, а не `pnpm dev`. `pnpm dev` сам пишет в терминал каждую строку запроса вместе с адресом, а в адресе ссылки из письма есть её ключ (`GET /api/auth/magic-link/verify?token=…`). Собранное приложение, как и на сервере, таких строк не пишет;
  - агент запускает его на отдельной базе e2e (рабочие данные не трогаются): `pnpm build`, `pnpm exec tsx e2e/start-app.ts 3100`, журнал — в файл `test-results/manual-check.log`. Адрес — http://127.0.0.1:3100, письма — в Mailpit http://localhost:8025;
  - базу останавливает и после проверки запускает обратно агент: `docker compose stop db` / `docker compose start db`;
  - ключ сессии: в Chrome F12 → Application → Cookies → http://127.0.0.1:3100 → `better-auth.session_token`; ключ — часть значения до точки (`%3D` в конце значения — это `=`, к ключу не относится);
  - ключ из ссылки: в письме в Mailpit часть адреса ссылки после `token=` до `&`;
  - журнал — файл `test-results/manual-check.log` в VS Code: найти там ключ, почту и `params:` поиском по тексту (Ctrl+F);

  владельцу — список сценариев: что нажать и что должно получиться; проверка — владелец подтвердил, что всё работает

## Workflow follow-up

- «Коммить и пуш» по команде владельца: коммит в ветку `sign-in-error-logs`, push, PR в main со ссылкой, автовлитие `gh pr merge --auto --squash`. Правки `CLAUDE.md` в этот PR не входят (решение владельца).
- После merge выкатка идёт сама, как у прошлых изменений: Deploy катит новый образ сразу на https://app.linkbook.site. Тест-стенда пока нет, его заводим следующей задачей (решение владельца). Затем проверка на https://app.linkbook.site: вход по ссылке и выход работают как раньше.
- Архивировать изменение (`/opsx:archive`), когда критерии приёмки выполнены.
