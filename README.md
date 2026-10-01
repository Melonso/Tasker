# Tasker

Tasker to działająca aplikacja do zarządzania zadaniami firmowymi i prywatnymi. Jej głównym celem jest pilnowanie terminów, odpowiedzialności i informacji zwrotnej bez konieczności ręcznego przeglądania tabel.

Pierwsza wersja produktu będzie łączyć:

- panel webowy/PWA,
- powiadomienia w aplikacji i web push,
- Google Calendar,
- Telegram z obsługą tekstu i wiadomości głosowych, w tym deterministycznym rozpoznawaniem naturalnych próśb o listy zadań,
- osobny moduł prywatnych notatek z kolorami, edycją i własnymi przypomnieniami porządkowymi,
- delegowanie, eskalacje i historię zmian,
- prywatne, firmowe oraz bezpośrednio udostępniane zadania.

## Dokumentacja

- [Specyfikacja MVP](docs/MVP_SPEC.md)
- [Plan implementacji](docs/IMPLEMENTATION_PLAN.md)
- [Plan środowiska produkcyjnego](docs/DEPLOYMENT.md)
- [Audyt serwera produkcyjnego](docs/SERVER_AUDIT.md)
- [Rejestr decyzji](docs/DECISIONS.md)
- [API integracyjne dla n8n i Telegrama](docs/INTEGRATION_API.md)
- [Audyt UX i kierunek rozwoju](docs/UX_RESEARCH_2026-08-29.md)
- [Roadmapa napraw po code review](docs/FIX_ROADMAP.md)

## Stan implementacji

Wdrożona wersja produkcyjna działa pod `https://tasker.dpkomis.pl`. Zrealizowane są:

- aplikacja Next.js 16 i React 19,
- responsywny pulpit dzielący każdy widok na wyraźne, pionowe sekcje zadań firmowych i prywatnych, ustawienia użytkownika, avatary i administracja; zadania otrzymane zachowują wspólny układ awatara autora, tytułu i metadanych także na wąskich telefonach, każde zadanie ma plakietkę priorytetu, pilne i wysokie pozycje są wyżej od normalnych i niskich, a wybór typu lub priorytetu w szczegółach i menu wiersza zapisuje zmianę automatycznie bez dodatkowego przycisku; liczniki sekcji pozostają wycentrowane, każda pozycja nawigacji do zadań i notatek pokazuje w nawiasie aktualną liczbę elementów widoku, a na iPhone'ach ekran dopasowuje się do szerokości urządzenia i nie uruchamia automatycznego zoomu pól formularzy,
- wersjonowany schemat PostgreSQL i migracje Drizzle,
- seed użytkowników zespołu (Paweł, Mateusz, Michał, Nadia, Paulina) i ich ról,
- reguły przypomnień z obsługą strefy `Europe/Warsaw`; każdy komunikat podaje autora zadania oraz bezpośrednie udostępnienia użytkownikom i zespołom,
- osobny worker oparty na trwałej kolejce PostgreSQL,
- Docker Compose dla web, workera, migracji i bazy,
- endpointy `/api/health/live` oraz `/api/health/ready`,
- testy, lint, kontrola typów i produkcyjny build.
- logowanie, sesje i jednorazowe linki aktywacyjne,
- role oraz ochrona tras i treści prywatnych,
- zadania zapisywane w PostgreSQL: tworzenie, delegowanie, kończenie i przesuwanie terminu,
- prywatne notatki niezależne od zadań: osobny ekran, tytuł i treść, sześć kolorów, edycja i usuwanie,
- osobisty plan dnia z sekcjami „Po terminie”, „Plan na dziś” i „Termin na dziś”,
- szybkie dodawanie z najważniejszymi polami na wierzchu i opcjami zaawansowanymi na żądanie,
- mobilny pasek z centralnym przyciskiem dodawania oraz szybkie przesuwanie na jutro lub za tydzień,
- szczegóły zadania, komentarze, oczekiwanie, wznowienie i anulowanie,
- ustawienia profilu oraz godzin 14:00 i 9:00,
- PWA i Web Push przetestowane na prawdziwej przeglądarce,
- synchronizacja Google Calendar przez OAuth,
- Telegram tekstowy i głosowy z transkrypcją OpenAI, dynamiczną listą wykonawców, deterministycznym rozpoznawaniem jawnego zwrotu „zadanie firmowe” i prywatnym rodzajem domyślnym, atomowym tworzeniem i udostępnianiem zadania, bezpiecznym szkicem oraz w pełni polskimi etykietami typu, priorytetu i dostępu,
- natychmiastowy zapis notatki z Telegrama przez `/notatka TREŚĆ`, „dodaj do notatek…” albo „zapisz w notatkach…”, bez tworzenia szkicu zadania,
- webowy moduł Notatek z tabelą w stylu bazy Notion, rozwijanym formularzem „Dodaj notatkę”, edycją wiersza po kliknięciu, zmianą koloru oraz usuwaniem z potwierdzeniem,
- komendy Telegrama do kończenia, przesuwania, udostępniania, przekazywania wykonawcy oraz wyświetlania zadań na dziś, jutro, po terminie i według głównych kategorii; `/zadania` rozdziela firmowe od prywatnych i podaje autora każdego wiersza, a operacje na tytule używają inteligentnego dopasowania zapamiętanego fragmentu zamiast wymogu dokładnej nazwy,
- rozdzielone instrukcje Telegrama: `/dodaj` opisuje pełne tworzenie zadania, w tym wykonawcę, odbiorcę udostępnienia, termin, priorytet, widoczność i zatwierdzanie, a `/pomoc` pokazuje skróty oraz obsługę istniejących zadań bez powtarzania instrukcji tworzenia,
- automatyczne zatwierdzanie kompletnego szkicu po 10 minutach,
- zadania cykliczne dzienne, tygodniowe i miesięczne z pauzowaniem,
- zespoły, ręczne udostępnianie zadań i preferencje kanałów powiadomień; nowy wykonawca lub bezpośredni odbiorca udostępnienia od razu dostaje komunikat w aplikacji oraz, jeśli ma je włączone i połączone, przez Web Push i Telegram,
- zadania przypisane oraz jawnie udostępnione odbiorcy pojawiają się w jego widokach `Dzisiaj` i `Bieżące`; wiersz otrzymanego zadania pokazuje autora wraz z jego awatarem, a odbiorca samego udostępnienia zachowuje dostęp tylko do odczytu i komentarzy,
- kilka niezależnych dziennych lub tygodniowych harmonogramów przypominających o uporządkowaniu notatek, z wyborem dnia, godziny i kanałów użytkownika,
- automatyczne kopie bazy, szyfrowany backup offsite w Google Drive, sprawdzony pełny test odtworzenia, retencja 14 kopii dziennych + 8 tygodniowych i monitoring przez n8n,
- aktywny 14-dniowy pilotaż z metrykami w panelu administratora,
- wdrożony i zweryfikowany stos produkcyjny na `127.0.0.1:8090` za Cloudflare Tunnel.

Do operacyjnego domknięcia pozostaje obserwacja wyników trwającego pilotażu i poprawki wynikające z użycia przez cztery osoby.

Poprawki z code review z 2026-10-01 zostały wdrożone produkcyjnie wraz z migracją i workflow n8n. Obejmują atomowe operacje na zadaniach i szkicach, odporne dostawy Telegram i Google Calendar, szybsze listy, limit prób logowania i nagłówki bezpieczeństwa. Status poszczególnych punktów opisuje [roadmapa napraw](docs/FIX_ROADMAP.md).

## Uruchomienie bez Dockera

Wymagany jest Node.js 22+ i pnpm 11:

```bash
pnpm install
pnpm dev
```

Aplikacja będzie dostępna pod `http://localhost:3000`. Endpoint live nie wymaga bazy; endpoint ready zwróci 503 do czasu uruchomienia PostgreSQL.

## Uruchomienie pełnego stosu

```bash
docker compose up --build
docker compose run --rm migrate ./node_modules/.bin/tsx src/db/seed.ts
```

Lokalny panel będzie dostępny pod `http://localhost:3001`. PostgreSQL jest związany wyłącznie z `127.0.0.1:5433`.

Plik `docker-compose.prod.yml` uruchamia oddzielny stos produkcyjny i wiąże panel wyłącznie z `127.0.0.1:8090`, przeznaczonym dla Cloudflare Tunnel. Wymaga chronionego pliku `.env` utworzonego na podstawie `.env.production.example`.

## Kontrola jakości

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm build
```

`pnpm test:integration` uruchamia testy na prawdziwym PostgreSQL. Domyślnie korzysta z bazy `tasker_test` lokalnego stosu Docker (`127.0.0.1:5433`), a inny adres można podać w `TEST_DATABASE_URL`. Baza jest tworzona i migrowana automatycznie, a jej dane są czyszczone przed każdym testem; ze względów bezpieczeństwa nazwa bazy musi zawierać „test”.
