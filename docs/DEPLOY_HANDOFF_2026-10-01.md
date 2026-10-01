# Handoff wdrożenia: poprawki z code review (2026-10-01)

Dokument dla lokalnego agenta, który ma scalić, opublikować i wdrożyć poprawki z gałęzi `claude/relaxed-gauss-23rram`. Zakres poprawek opisuje `docs/FIX_ROADMAP.md`. Przed rozpoczęciem przeczytaj też `AGENTS.md` (kryterium zakończenia) i `docs/DEPLOYMENT.md` (sekcja „Wdrożenie poprawek z code review”).

## Zasady pracy

- Zatrzymaj się i zapytaj użytkownika, gdy któryś warunek „STOP” jest spełniony albo wynik kroku różni się od oczekiwanego.
- Nie wyświetlaj ani nie loguj sekretów (`.env`, tokeny, klucze). Sprawdzaj tylko ich obecność.
- Nie usuwaj danych produkcyjnych. Nie cofaj migracji.
- Przed każdą zmianą produkcji (serwer, n8n) musi istnieć zweryfikowany backup i zapisany punkt powrotu.

## 0. Najważniejsze ryzyko: produkcja nie odpowiada GitHubowi

Stan ustalony 2026-10-01:

- `origin/main` = `39f5e3f` („docs: record create-and-share deployment”, 2026-08-31).
- Gałąź z poprawkami: `origin/claude/relaxed-gauss-23rram` = `origin/main` + 10 commitów (liniowo, bez konfliktów z `origin/main`).
- Aktywny workflow n8n „Tasker — Telegram + AI” (`RU4XgT3iRtCbrcn0`, wersja `5f2d010b-c8fb-4f73-aabd-0efb02a7ab08`, zmieniony 2026-09-02) używa funkcji, których **nie ma ani w `origin/main`, ani w gałęzi poprawek**:
  - endpoint `POST /api/integrations/notes` i komenda `/notatka` (moduł notatek),
  - pole `taskScope` (`PRIVATE`/`COMPANY`, „rodzaj zadania” niezależny od widoczności) w szkicach `CREATE_TASK`, w podglądzie szkicu i w podsumowaniach,
  - pola `author` i `taskScope` w zadaniach zwracanych przez `LIST_*`,
  - osobna trasa `/dodaj` (`add_help`), model `gpt-5.6-luna`, credential OpenAI `OpenAi account` (`jEORlTJJGCpHWA6r`).

Wniosek: produkcyjna aplikacja (i najpewniej baza: tabela notatek, kolumna `task_scope`, dodatkowe migracje) pochodzi z kodu, którego nie wypchnięto na GitHub. **Wdrożenie samej gałęzi poprawek usunęłoby notatki i `taskScope` z produkcji**, a migracje Drizzle rozjechałyby się z bazą.

### Bramka 0 — odnaleźć kod produkcyjny (obowiązkowa)

W lokalnym repo:

```bash
git fetch origin
git status
git branch -a
git stash list
git log --oneline origin/main..main        # niewypchnięte commity na main
git log --oneline --all --since=2026-08-31  # inne gałęzie z tego okresu
grep -rn "taskScope\|/api/integrations/notes" src | head
ls drizzle/*.sql
```

Na serwerze (`/home/dpkomis/apps/tasker-prod`, tylko odczyt):

```bash
docker compose -f docker-compose.prod.yml exec -T postgres psql -U tasker -d tasker -Atc \
  "select id, created_at from drizzle.__drizzle_migrations order by created_at;"
docker compose -f docker-compose.prod.yml exec -T postgres psql -U tasker -d tasker -Atc \
  "select table_name from information_schema.tables where table_schema='public' order by 1;"
docker compose -f docker-compose.prod.yml exec -T postgres psql -U tasker -d tasker -Atc \
  "select column_name from information_schema.columns where table_name='tasks' order by 1;"
```

Sprawdź też, skąd pochodzi kod na serwerze: czy katalog jest repozytorium Git (`git -C /home/dpkomis/apps/tasker-prod log -1`), czy jest rozpakowanym archiwum. Ustal sposób przesyłania kodu z poprzednich wdrożeń i użyj tego samego.

Oczekiwany wynik: lokalnie istnieje kod z notatkami i `taskScope`, a liczba migracji w nim zgadza się z `drizzle.__drizzle_migrations` na produkcji (repo na GitHubie ma 8 migracji `0000`–`0007`).

**STOP**, jeżeli:

- kodu z notatkami i `taskScope` nie ma lokalnie, albo
- migracje w lokalnym kodzie nie odpowiadają migracjom zastosowanym na produkcji.

W takim przypadku nie wdrażaj niczego i opisz użytkownikowi, czego brakuje.

## 1. Zsynchronizować GitHub z produkcją

Najpierw GitHub ma odzwierciedlać to, co działa na produkcji, osobno od poprawek:

1. Jeśli kod produkcyjny jest niezacommitowany — zacommituj go na `main` z opisowym komunikatem (np. „feat: notes module and task scope (deployed 2026-09-02)”).
2. `git push origin main`.
3. Upewnij się, że `git log origin/main` zawiera te commity.

## 2. Scalić poprawki z kodem produkcyjnym

```bash
git checkout -b deploy/code-review-2026-10 origin/main
git merge origin/claude/relaxed-gauss-23rram
```

Spodziewaj się konfliktów. Zasada ogólna: **struktura z gałęzi poprawek (transakcje, blokady, nowe moduły) + funkcje z produkcji (notatki, `taskScope`, nowe pola)**. Nie przywracaj wzorców, które poprawki usunęły (odczyt zadania poza transakcją, `selectDistinct` z joinami udostępnień, `avatarDataUrl` w listach).

| Plik / obszar | Jak rozwiązać |
|---|---|
| `drizzle/0008_login_attempts.sql`, `drizzle/meta/0008_snapshot.json`, wpis `0008` w `drizzle/meta/_journal.json` | Jeżeli produkcja ma już własne migracje `0008+`: **usuń** te trzy elementy z gałęzi poprawek, zachowaj migracje produkcyjne, a po scaleniu `schema.ts` wygeneruj nową migrację: `pnpm db:generate --name login_attempts`. Wygenerowany SQL może zawierać **wyłącznie** `CREATE TABLE "login_attempts"` i dwa indeksy. Jeżeli zawiera cokolwiek innego → **STOP** (schemat w kodzie nie odpowiada bazie). |
| `src/db/schema.ts` | Zachowaj obie strony: tabelę `loginAttempts` oraz tabele/kolumny produkcyjne (notatki, `taskScope`). |
| `src/tasks/service.ts` | Bazą jest wersja z poprawek (`runInTransaction`, `lockActiveTask`, `updateLockedTask`, nowe funkcje `setTaskWaitingForUser`, `resumeTaskForUser`, `cancelTaskForUser`, `updateTaskRecurrenceForUser`, `setTaskRecurrencePausedForUser`, `updateTaskSharesForUser`, `setTaskPlannedForDateForUser`, `rescheduleOverdueRemindersForAssignee`). Przenieś do niej zmiany produkcyjne, np. `taskScope` w `CreateTaskInput`, w insercie zadania i przy tworzeniu kolejnego wystąpienia cyklu. |
| `src/tasks/actions.ts` | Bazą jest wersja z poprawek (akcje wołają serwis i są opakowane w `runFormAction`). Dodaj produkcyjne pola formularza (np. `taskScope`) do `createTaskAction`. |
| `src/tasks/queries.ts` | `accessCondition` jest teraz oparte na `EXISTS` i **nie wymaga** joinów `taskShares`/`teamMembers`; listy używają `select` (nie `selectDistinct`) i `avatarUrlColumn()`. Dodaj produkcyjne pola (`taskScope`, autor itp.). Każde zapytanie produkcyjne, które dołącza `taskShares`/`teamMembers` tylko po to, by sprawdzić dostęp, przepisz na samo `accessCondition(user)`. |
| `src/integrations/drafts.ts`, `draft-confirmation.ts`, `draft-auto-confirm.ts`, `src/app/api/integrations/commands/drafts/**` | Bazą są wersje z poprawek (`confirmTaskDraft` w jednej transakcji, `dateKeySchema`/`timeKeySchema`, podsumowania filtrowane w SQL). Przenieś `taskScope` do schematu żądania, payloadu szkicu, `draftResponse` i wywołania `createTaskForUser(…, tx)`, a pola `author`/`taskScope` do `telegramTaskSummary` i `telegramTaskOverview`. |
| Avatary | `avatarDataUrl` w zapytaniach, typach i propsach zmieniono na `avatarUrl` (URL endpointu `/api/users/[id]/avatar`). Kod produkcyjny (np. strony notatek) ma używać `avatarUrlColumn()` i propsa `avatarUrl`. |
| `src/tasks/policy.ts` | `canAccessTask` usunięto (nie był używany). Jeśli moduł notatek go używa — zastąp regułą SQL. |
| Błędy w akcjach formularzy | Błędy dla użytkownika: `UserInputError` / `TaskInputError` + `runFormAction` (baner zamiast ekranu awarii). Warto zastosować to samo w akcjach notatek. |
| `n8n/*.workflow.ts` | Źródłem prawdy jest produkcja — patrz sekcja 6. |
| `docs/*` | Połącz obie strony; zachowaj oznaczenia ⏳ dla jeszcze niewdrożonych zmian. |

Kontrola po scaleniu:

```bash
grep -rn "avatarDataUrl" src        # tylko: schema.ts, settings/actions.ts, settings/avatar.ts, api/users/[userId]/avatar
grep -rn "canAccessTask\|selectDistinct\|leftJoin(taskShares" src   # oczekiwane: brak
grep -rn "createDatabaseClient(1)" src/auth                          # oczekiwane: brak
```

## 3. Weryfikacja lokalna (wszystko musi przejść)

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
docker compose up -d postgres          # lokalny PostgreSQL na 127.0.0.1:5433
pnpm test:integration                  # tworzy i migruje bazę tasker_test
pnpm build
```

`pnpm test:integration` domyślnie łączy się z `postgres://tasker:tasker@localhost:5433/tasker_test` (inny adres: `TEST_DATABASE_URL`). Dopisz testy integracyjne dla ścieżek, w których scalałeś `taskScope` (np. utworzenie zadania z `taskScope` przez szkic Telegrama i zakończenie zadania cyklicznego z `taskScope`).

Zalecany test w przeglądarce na pełnym stosie (`docker compose up --build`): logowanie, dodanie i zakończenie zadania, notatka, avatar w ustawieniach, baner błędu (np. duplikat nazwy zespołu), brak naruszeń CSP w konsoli.

## 4. Publikacja kodu

```bash
git push -u origin deploy/code-review-2026-10
git checkout main
git merge --ff-only deploy/code-review-2026-10
git push origin main
```

## 5. Wdrożenie na serwer

Dostęp: `ssh ssh.dpkomis.pl` (Cloudflare Access, klucz `tasker-dpkomis-deploy`). Katalog: `/home/dpkomis/apps/tasker-prod`. Compose: `docker-compose.prod.yml`.

1. **Punkt powrotu.** Zapisz identyfikatory obecnych obrazów (`docker compose -f docker-compose.prod.yml images`) i otaguj je, np. `docker tag <obraz-web> tasker-prod-web:pre-review-20261001` oraz analogicznie `runner` (worker/migrate).
2. **Backup.** `deploy/backup-tasker.sh`, potem weryfikacja `deploy/verify-tasker-backup.sh` zgodnie z jego użyciem. Zanotuj nazwę pliku.
3. **Sekrety.** Nowa wersja nie wystartuje w produkcji bez jawnych sekretów:
   ```bash
   grep -cE '^(SESSION_SECRET|INTEGRATION_ENCRYPTION_KEY)=.{32,}' .env   # oczekiwane: 2
   ```
   Wynik inny niż `2` → **STOP** i poproś użytkownika o uzupełnienie `.env`.
4. **Zespoły firmowe z osobami zewnętrznymi** (nowa reguła nie usuwa istniejących członkostw):
   ```bash
   docker compose -f docker-compose.prod.yml exec -T postgres psql -U tasker -d tasker -c \
     "select t.name, u.email from teams t join team_members m on m.team_id = t.id join users u on u.id = m.user_id join user_roles ur on ur.user_id = u.id join roles r on r.id = ur.role_id where not t.is_external and r.key = 'EXTERNAL';"
   ```
   Jeśli są wyniki — przekaż je użytkownikowi; niczego nie usuwaj.
5. **Przesłanie kodu** tą samą metodą co przy poprzednich wdrożeniach. Nie nadpisuj: `.env`, `.env.offsite-backup`, `.secrets/`, `backups/`.
6. **Budowa i start:**
   ```bash
   docker compose -f docker-compose.prod.yml build
   docker compose -f docker-compose.prod.yml up -d
   docker compose -f docker-compose.prod.yml logs migrate | tail     # „Database migrations completed.”
   docker compose -f docker-compose.prod.yml exec -T postgres psql -U tasker -d tasker -c "\d login_attempts"
   ```
7. **Kontrola:**
   ```bash
   curl -s http://127.0.0.1:8090/api/health/ready
   curl -s http://127.0.0.1:8090/api/health/operations    # "status":"operational", "worker":"ok"
   deploy/check-tasker-health.sh
   curl -sI https://tasker.dpkomis.pl/login | grep -iE "content-security-policy|x-frame-options"
   docker compose -f docker-compose.prod.yml logs --since 5m worker | grep "Reminder scan completed" | tail -2
   ```
   W logu workera wynik skanu ma `healthy: true` i zawiera krok `housekeeping`.

**STOP i rollback (sekcja 9)**, jeśli `ready` lub `operations` nie wracają do zdrowego stanu w ciągu kilku minut.

## 6. n8n (dopiero po działającej aplikacji)

### „Tasker — przypomnienia Telegram” (`1M8m8ZU2CuJMOMu7`)

- Wersja przed zmianą: `46f62d68-b2f1-4b3e-bbd1-8dbb2ddfc1f0` (identyczna z poprzednim źródłem w repo).
- Nowe źródło: `n8n/tasker-telegram-notifications.workflow.ts` (wyjście błędu węzła Telegram → raport `success:false`; potwierdzenia nie przerywają paczki). Zostało zwalidowane przez n8n MCP.
- Kroki: `validate_workflow` → `update_workflow` → `publish_workflow`. Sprawdź kolejne wykonania (`search_workflow_executions`): powinny kończyć się sukcesem.

### „Tasker — Telegram + AI” (`RU4XgT3iRtCbrcn0`)

- Wersja przed zmianą: `5f2d010b-c8fb-4f73-aabd-0efb02a7ab08`.
- **Nie wgrywaj pliku `n8n/tasker-telegram-ai.workflow.ts` z gałęzi poprawek** — jest starszy niż produkcja (brak notatek, `taskScope`, `/dodaj`). Nanieś na bieżącą wersję produkcyjną tylko dwie zmiany:
  1. Nowy węzeł IF „Czy to czat prywatny?” (v2.3) między triggerem a „Czy to wiadomość głosowa?”: warunek string `equals`, lewa strona `{{ $json.callback_query?.message?.chat?.type ?? $json.message?.chat?.type ?? "" }}`, prawa `private`. Wyjście `true` → „Czy to wiadomość głosowa?”, wyjście `false` → brak połączenia.
  2. W „Pokaż szkic do zatwierdzenia”, w gałęzi `REASSIGN_TASK`, po linii „Nowy wykonawca: …” dopisz `"\nDotychczasowy wykonawca zachowa dostęp do zadania."`.
  Polskie etykiety priorytetu i dostępu są już na produkcji.
- Zwaliduj, opublikuj, sprawdź na prywatnym czacie `/dzisiaj` i `/pomoc`; wiadomość z grupy (jeśli bot jest w jakiejś) ma zostać zignorowana.
- Następnie zapisz aktualną wersję produkcyjną jako `n8n/tasker-telegram-ai.workflow.ts`, aby repo odpowiadało produkcji (`AGENTS.md`).

### Poświadczenie

- Zmień nazwę credential `5IbWlDjmEVAQkvzT` z „Tasket Telegram Bot” na „Tasker Telegram Bot” (identyfikator się nie zmienia, workflowy pozostają powiązane). Jeśli MCP tego nie umożliwia, poproś użytkownika o zmianę w UI n8n.

Nowe szybkie komendy Telegrama nie są potrzebne — poprawki nie dodają nowych funkcji bota. Sprawdź jednak, czy lista komend w `AGENTS.md` i `docs/INTEGRATION_API.md` obejmuje istniejące na produkcji `/notatka`; jeśli nie, uzupełnij dokumentację.

## 7. Smoke test po wdrożeniu

- Logowanie (jedna celowo błędna próba → komunikat; nie blokuj kont prawdziwych użytkowników).
- Pulpit: liczniki, utworzenie i zakończenie zadania testowego (potem anuluj/zostaw jako zrobione z jasnym tytułem „TEST”).
- Szczegóły zadania firmowego z dodatkowym dostępem: sekcja „Dodatkowy dostęp”.
- Avatar w ustawieniach ładuje się z `/api/users/…/avatar`.
- **Regresja funkcji produkcyjnych:** notatka (`/notatka TEST`), `/zadania` z podziałem firmowe/prywatne, szkic `CREATE_TASK` z rodzajem zadania.
- Telegram: `/dzisiaj`, szkic z przyciskami (anuluj go), podgląd przekazania zawiera zdanie o zachowaniu dostępu.
- Testowy Web Push z ustawień.
- Status Google Calendar w ustawieniach.
- `/api/health/operations` = `operational`.

Usuń lub anuluj dane testowe utworzone podczas smoke testu.

## 8. Dokumentacja po wdrożeniu

- `docs/INTEGRATION_API.md`, `docs/DECISIONS.md`: usuń oznaczenia ⏳.
- `docs/DEPLOYMENT.md`: zmień nagłówek sekcji na „wykonane 2026-10-XX”, dopisz nazwę backupu, tagi obrazów i nowe wersje workflow n8n.
- `docs/FIX_ROADMAP.md`: statusy wdrożonych punktów ✅ → 🚀, etap 4 → 🚀.
- `docs/IMPLEMENTATION_PLAN.md` (etap 10) i `README.md`: z „czeka na wdrożenie” na „wdrożone”.
- Commit i `git push origin main`.

## 9. Rollback

- **Aplikacja:** przywróć otagowane obrazy (`pre-review-20261001`) i `docker compose -f docker-compose.prod.yml up -d web worker`. Migracja `login_attempts` jest rozszerzająca — starsza wersja ją ignoruje, nie cofaj jej.
- **n8n:** `restore_workflow_version` do `46f62d68-b2f1-4b3e-bbd1-8dbb2ddfc1f0` (przypomnienia) i `5f2d010b-c8fb-4f73-aabd-0efb02a7ab08` (Telegram + AI).
- **Baza:** odtworzenie z backupu wyłącznie przy uszkodzeniu danych i po decyzji użytkownika (procedura w `docs/DEPLOYMENT.md`, sekcja 10).

## 10. Raport dla użytkownika

Na koniec przekaż krótko:

- jakie niewypchnięte zmiany produkcyjne znaleziono i jak zostały scalone,
- wynik testów (`test`, `test:integration`, `build`) i commit wdrożony na `main`,
- nazwę backupu i tagi obrazów do rollbacku,
- nowe wersje workflow n8n,
- wynik zapytania o zespoły firmowe z osobami zewnętrznymi,
- wyniki smoke testu i ewentualne problemy,
- czy zmieniono nazwę poświadczenia „Tasket” (lub prośbę o zrobienie tego w UI).
