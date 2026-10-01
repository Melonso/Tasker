# Roadmapa napraw po code review (2026-10-01)

Dokument śledzi naprawy wynikające z pełnego code review aplikacji. Wdrożenie produkcyjne (aplikacja, migracje, workflow n8n) wykonujemy **jednorazowo po zakończeniu wszystkich etapów** — do tego czasu zmiany trafiają wyłącznie do gałęzi roboczej.

Legenda statusu: ⬜ do zrobienia · 🔄 w toku · ✅ zrobione w kodzie (czeka na wdrożenie) · 🚀 wdrożone · ❔ wymaga decyzji właściciela

## Etap 0 — Fundament testowy

| # | Zadanie | Status |
|---|---------|--------|
| 0.1 | Testy integracyjne na prawdziwym PostgreSQL (`pnpm test:integration`, osobna konfiguracja Vitest, migracje przed testami, czyszczenie danych między testami) | ✅ |

## Etap 1 — Wysoki priorytet

| # | Problem | Naprawa | Status |
|---|---------|---------|--------|
| 1.1 | Wyścig przy zmianach stanu zadania; podwójne zakończenie zadania cyklicznego tworzy dwa kolejne wystąpienia | Odczyt zadania `FOR UPDATE` w transakcji, warunek statusu/wersji w `UPDATE`, wszystkie mutacje zadania przez serwis | ✅ |
| 1.2 | Potwierdzanie szkicu nieatomowe: możliwy duplikat zadania i szkice zawieszone w `PROCESSING` | Operacja na zadaniu i zmiana stanu szkicu w jednej transakcji; odzyskiwanie zawieszonych szkiców | ✅ |
| 1.3 | Błąd jednej wysyłki Telegram przerywa paczkę → duplikaty przypomnień u innych | Workflow n8n: obsługa błędu per element i raport `success:false`; klasyfikacja błędów trwałych po stronie API | ⬜ |
| 1.4 | Udostępnienie zadania firmowego jednej osobie odbiera dostęp całej firmie | Zachowanie widoczności `COMPANY` przy udostępnieniu | ✅ |
| 1.5 | Google Calendar: chwilowy błąd trwale wyłącza synchronizację; nie da się odłączyć zepsutego połączenia; batch bez kolejności | Rozróżnienie błędów trwałych/chwilowych, odłączenie bez działającego tokenu, kolejka wg `last_synced_at` | ⬜ |
| 1.6 | Avatary (do 1,4 MB) w każdym żądaniu i wierszu listy; pulpit pobiera całe archiwum dla liczników | Avatary serwowane z endpointu z cache, listy bez data URL; liczniki przez `count()`, limit archiwum | ⬜ |

## Etap 2 — Średni priorytet

| # | Problem | Naprawa | Status |
|---|---------|---------|--------|
| 2.1 | Domyślne sekrety używane w produkcji | Walidacja środowiska blokuje start produkcji bez sekretów | ⬜ |
| 2.2 | Logowanie: brak limitu prób, `scryptSync` blokuje event loop, nowa pula połączeń przy każdym logowaniu, różnica czasu dla nieistniejących kont | Limit prób w PostgreSQL, asynchroniczny scrypt, współdzielona pula, stały koszt weryfikacji | ⬜ |
| 2.3 | Worker: wyjątek jednego kroku blokuje pozostałe i heartbeat | Izolacja kroków, heartbeat zawsze aktualizowany ze statusem kroków | ⬜ |
| 2.4 | Błędy akcji kończą się ekranem awarii; UI pokazuje akcje niedozwolone dla użytkownika | `error.tsx`/`not-found.tsx`, akcje tylko dla uprawnionych, czytelne komunikaty | ⬜ |
| 2.5 | `/api/health/operations` w stanie 503 przez 24 h po jednej nieudanej dostawie; ponawianie błędów trwałych | Progi zamiast „zero błędów”, bez ponawiania błędów trwałych | ⬜ |
| 2.6 | Spóźnione przypomnienia „przed terminem” wysyłane po terminie | Pomijanie przypomnień przed terminem, gdy termin minął | ⬜ |
| 2.7 | Kolejne wystąpienie cyklu po spóźnionym zakończeniu jest od razu zaległe | Przesuwanie następnego terminu do pierwszego w przyszłości | ⬜ |
| 2.8 | Walidacja dat tylko regexem (`2026-02-31`, `25:99`) | Ścisła walidacja kalendarzowa w formularzach i API | ⬜ |
| 2.9 | Brak nagłówków bezpieczeństwa | CSP, `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` | ⬜ |
| 2.10 | Bot Telegram odpowiada w grupach (ryzyko ujawnienia list zadań) | Workflow obsługuje wyłącznie czaty prywatne | ⬜ |
| 2.11 | Pilotaż identyfikuje uczestników po edytowalnym imieniu i nazwisku | Identyfikacja po adresach e-mail z listy pilotażowej | ⬜ |

## Etap 3 — Niski priorytet i jakość

| # | Problem | Naprawa | Status |
|---|---------|---------|--------|
| 3.1 | `canAccessTask` nieużywane i rozbieżne z regułą SQL | Jedna reguła dostępu (SQL — udostępnienie daje dostęp niezależnie od widoczności, bo zadanie firmowe też można udostępnić osobie zewnętrznej), usunięcie martwego kodu | ⬜ |
| 3.2 | `selectDistinct` z joinami do deduplikacji | Warunek dostępu przez `EXISTS` | ⬜ |
| 3.3 | Podsumowania Telegram filtrowane w JS | Filtrowanie w SQL | ⬜ |
| 3.4 | Wstrzymanie/wznowienie cyklu bez transakcji | Transakcja | ✅ |
| 3.5 | Zmiana godziny przypomnień nie przelicza zaplanowanych | Przeliczenie zaplanowanych `OVERDUE_DAILY` | ⬜ |
| 3.6 | Sesje nie są czyszczone, `lastSeenAt` nieaktualizowane | Sprzątanie w workerze, aktualizacja z ograniczeniem częstotliwości | ⬜ |
| 3.7 | Brak walidacji UUID udostępnień; wyścig przy łączeniu Telegrama → 500 | Walidacja i obsługa konfliktu (walidacja UUID w formularzu zadania: ✅) | 🔄 |
| 3.8 | Dostawy Telegram odłączonych użytkowników wiszą w `PENDING` | Oznaczanie jako `SKIPPED` | ⬜ |
| 3.9 | Surowe enumy (`PRIVATE`, `NORMAL`) w UI i podglądzie szkicu | Polskie etykiety | ⬜ |
| 3.10 | Literówka „Tasket Telegram Bot” w nazwie poświadczenia n8n | Zmiana nazwy przy wdrożeniu | ⬜ |
| 3.11 | Przekazanie zadania odbiera dostęp poprzedniemu wykonawcy | Decyzja produktowa | ❔ |
| 3.12 | Flaga `isExternal` zespołu niczego nie wymusza | Decyzja produktowa | ❔ |

## Etap 4 — Dokumentacja i wdrożenie (na końcu)

| # | Zadanie | Status |
|---|---------|--------|
| 4.1 | Aktualizacja `README.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/INTEGRATION_API.md`, `docs/DEPLOYMENT.md` | ⬜ |
| 4.2 | Backup produkcji, wdrożenie aplikacji i migracji | ⬜ |
| 4.3 | Aktualizacja aktywnych workflow n8n (powiadomienia, Telegram + AI) | ⬜ |
| 4.4 | Weryfikacja po wdrożeniu (health, Telegram, push, kalendarz) | ⬜ |
