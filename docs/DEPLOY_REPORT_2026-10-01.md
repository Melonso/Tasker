# Raport wdrożenia poprawek — 2026-10-01

## Bramka 0 i scalenie

Odnaleziono lokalny niezacommitowany kod działający na produkcji: notatki i przypomnienia porządkowe, `scope` / `taskScope`, kontrakt API 6, podział firmowe/prywatne, autor w listach, liczniki nawigacji, powiadomienia o dostępie i poprawki mobilne. Porównano 141 plików oraz wszystkie 10 migracji 0000–0009 (timestamp i SHA-256) z produkcją. Stan produkcji zapisano i wypchnięto jako `7db1494` na `main`, a następnie scalono gałąź `claude/relaxed-gauss-23rram` na `deploy/code-review-2026-10` i opublikowano na `main` (`1156c36`).

Zachowano funkcje produkcyjne przy przeniesieniu mutacji i zatwierdzania szkiców do transakcji, list do reguły SQL `EXISTS`, avatarów do endpointu i kroków workera do izolowanej obsługi. Migrację logowania wygenerowano jako `0010_login_attempts.sql`: wyłącznie tabela i dwa indeksy.

## Testy i wersja aplikacji

- Frozen install, typecheck i lint: poprawne.
- `pnpm test`: 24 pliki, 85 testów — poprawne.
- `pnpm test:integration`: 10 plików, 28 testów — poprawne. Zachowanie rodzaju firmowego przy prywatnej widoczności sprawdzono w wyścigu potwierdzeń szkicu i zakończeń cyklu.
- `pnpm build`: poprawny; produkcyjna budowa obrazów również poprawna.
- Aplikacja i worker uruchomione z commita `e03389be2ee5cdaa3587bcdd393d8f5542b03216` na `main` (korekta wykluczeń kontekstu Docker po scaleniu). Końcowy commit dokumentacji i źródeł n8n nie zmienia kodu aplikacji.
- Po synchronizacji źródeł n8n ponownie przeszły typecheck, lint, eksport SDK oraz walidacja MCP obu grafów. Ostrzeżenia analizatora dotyczą istniejących domyślnych parametrów produkcyjnych i przykładowych danych triggera/wyjścia błędu; oba grafy mają wynik `valid: true`.

## Backup i rollback

- `tasker-20261001T081910Z.dump`, 2 225 104 bajty; pełne odtworzenie do bazy kontrolnej: 28 tabel.
- Kopia źródeł: `backups/tasker-source-pre-review-20261001.tar.gz`.
- Tagi: `tasker-prod-web:pre-review-20261001`, `tasker-prod-runner:pre-review-20261001`, `tasker-prod-migrate:pre-review-20261001`.
- Obrazy przed wdrożeniem: web `sha256:49eb83431643e318210c7ba22b95f48ec36917e2c80b0aeabe74ce8f95914343`, worker `sha256:decadb95c0bfa62d53ca57b1447e8d098ad18b95deb6603125091317fb945558`.
- Rollback aplikacji przywraca obrazy; migracja jest rozszerzająca i nie wymaga cofania.
- Kopie poprzednich grafów: `backups/RU4XgT3iRtCbrcn0-before.json` i `backups/1M8m8ZU2CuJMOMu7-before.json`; SHA-256 zgodny lokalnie i na serwerze.

## n8n i poświadczenie

| Workflow | Poprzednia wersja | Nowa opublikowana wersja |
|---|---|---|
| Przypomnienia Telegram | `46f62d68-b2f1-4b3e-bbd1-8dbb2ddfc1f0` | `b9cd9ee0-6b66-42e7-8c5c-af86d4a0c6d2` |
| Telegram + AI | `5f2d010b-c8fb-4f73-aabd-0efb02a7ab08` | `3a14174f-0e03-43b7-8907-880fbf167c34` |

W przypomnieniach dodano raport błędu per wiadomość i kontynuowanie potwierdzeń. Trzy kolejne wykonania 335677, 335678 i 335680 zakończyły się sukcesem. W AI zmieniono wyłącznie filtr czatu prywatnego i tekst podglądu przekazania; reszta parametrów węzłów zgadza się z kopią sprzed zmiany. Zachowano notatki, `taskScope`, `/dodaj`, model `gpt-5.6-luna` i credential `OpenAi account`. Porównanie eksportu źródła AI z produkcją potwierdza identyczność parametrów, połączeń i credentials.

Użytkownik zmienił nazwę credential `5IbWlDjmEVAQkvzT` na „Tasker Telegram Bot”; odczyt credentials potwierdza zmianę i zachowanie ID. Nowe komendy nie były potrzebne; istniejące `/notatka` udokumentowano.

## Kontrole produkcji i smoke test

- Zapytanie o osoby zewnętrzne w zespołach firmowych: **0 wierszy**. Nie zmieniano członkostw.
- Sekrety: sprawdzono obecność i wymaganą długość obu, bez odczytu ich wartości.
- Migracja zakończona; tabela `login_attempts` i oba indeksy obecne.
- `ready` oraz `operations`: zdrowe, `operational`, worker `ok`. Skany mają `healthy: true` oraz kroki notatek i housekeeping. Skrypt kontroli zdrowia przeszedł.
- Nagłówki CSP i `X-Frame-Options: DENY` obecne. W konsoli przeglądarki nie stwierdzono błędów ani ostrzeżeń, w tym naruszeń CSP.
- Logowanie użytkownika poprawne. Jedna celowo błędna próba na nieistniejące konto `test-deploy-20261001@example.invalid`: komunikat „Nieprawidłowy e-mail lub hasło.” i dokładnie jeden zapis niepowodzenia; nie blokowano prawdziwego konta.
- WWW: utworzono firmowe zadanie `TEST wdrożenie 2026-10-01 — smoke WWW` (`186d085c-b51b-4df0-81b8-40d42a56f6a8`), następnie zakończono; liczniki bieżących/zrobionych odpowiednio wzrosły i spadły. Pozostaje jawnie oznaczone TEST w archiwum zrobionych.
- Avatar w ustawieniach ładuje się poprawnie z `/api/users/…/avatar`, bez data URL.
- Google Calendar: połączony, świeża synchronizacja widoczna w ustawieniach.
- Użytkownik potwierdził `/dzisiaj`, `/pomoc`, `/zadania` z podziałem firmowe/prywatne, `/notatka TEST…`, szkic z rodzajem i przyciskami oraz anulowanie. Wykonania 335682–335687 zakończyły się sukcesem; API zwróciło `taskScope: PRIVATE`, następnie `CANCELED` i `taskId: null`.
- Użytkownik potwierdził odbiór testowego Web Push na aktywnym urządzeniu i usunięcie testowej notatki; sprawdzono jej brak na liście i w bazie. Przeglądarka Codex nie miała lokalnej subskrypcji.
- Warunek czatu prywatnego sprawdzono na 8 syntetycznych przypadkach (wiadomość/callback × private/group/supergroup/channel); tekst REASSIGN_TASK również sprawdzono na przykładowym podglądzie. Nie przeprowadzano rzeczywistej próby w grupie Telegram.
- Końcowy test firmowego dodatkowego dostępu i podglądu przekazania: poprawny. Użytkownik zatwierdził SHARE_TASK (335716), a następnie REASSIGN_TASK (335719); podgląd 335717 zawierał zdanie o zachowaniu dostępu. Kontrolne przekazanie tego samego zadania z powrotem do autora przez API zachowało bezpośredni dostęp Michała i pola COMPANY. W WWW sprawdzono sekcję „Dodatkowy dostęp”, potem anulowano wyłącznie zadanie TEST `a4b872fa-6501-4743-80ca-973baa6ed13c`. Pozostały testowy szkic doprecyzowania również anulowano.

## Warunki STOP i rozwiązania

Każde zatrzymanie operacyjne zgłoszono użytkownikowi przed dalszą pracą. Po jego zgodzie poprawiono błędy TypeScript po scaleniu, uruchomiono skrypty backupu przez bash, uzupełniono `.dockerignore`, poprawiono grupowanie n8n. Odrzucona atomowa aktualizacja AI nie zmieniła grafu; użytkownik naniósł dwie zmiany w UI, a następnie porównano opublikowaną wersję z kopią.

Pierwszych zbudowanych obrazów z niewłaściwym kontekstem nie uruchomiono. Poprawiony rzeczywisty kontekst serwera przeszedł kontrolny `COPY` potwierdzający brak `.secrets`, backupów, `.env` i plików tymczasowych. Obrazy przebudowano. Cztery wskazane wpisy cache pierwszej budowy usunięto selektywnie (292,3 MB), sprawdzono ich brak; zachowano pozostały cache i obrazy rollbacku. Użyto filtra identyfikatorów zgodnie z [dokumentacją Docker](https://docs.docker.com/reference/cli/docker/buildx/prune/).
