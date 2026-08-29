# Tasker

Tasker to działająca aplikacja do zarządzania zadaniami firmowymi i prywatnymi. Jej głównym celem jest pilnowanie terminów, odpowiedzialności i informacji zwrotnej bez konieczności ręcznego przeglądania tabel.

Pierwsza wersja produktu będzie łączyć:

- panel webowy/PWA,
- powiadomienia w aplikacji i web push,
- Google Calendar,
- Telegram z obsługą tekstu i wiadomości głosowych,
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

## Stan implementacji

Wdrożona wersja produkcyjna działa pod `https://tasker.dpkomis.pl`. Zrealizowane są:

- aplikacja Next.js 16 i React 19,
- responsywny pulpit stawiający zadania przed statystykami, ustawienia użytkownika, avatary i administracja,
- wersjonowany schemat PostgreSQL i migracje Drizzle,
- seed czterech użytkowników pilotażowych i ich ról,
- reguły przypomnień z obsługą strefy `Europe/Warsaw`,
- osobny worker oparty na trwałej kolejce PostgreSQL,
- Docker Compose dla web, workera, migracji i bazy,
- endpointy `/api/health/live` oraz `/api/health/ready`,
- testy, lint, kontrola typów i produkcyjny build.
- logowanie, sesje i jednorazowe linki aktywacyjne,
- role oraz ochrona tras i treści prywatnych,
- zadania zapisywane w PostgreSQL: tworzenie, delegowanie, kończenie i przesuwanie terminu,
- osobisty plan dnia z sekcjami „Po terminie”, „Plan na dziś” i „Termin na dziś”,
- szybkie dodawanie z najważniejszymi polami na wierzchu i opcjami zaawansowanymi na żądanie,
- mobilny pasek z centralnym przyciskiem dodawania oraz szybkie przesuwanie na jutro lub za tydzień,
- szczegóły zadania, komentarze, oczekiwanie, wznowienie i anulowanie,
- ustawienia profilu oraz godzin 14:00 i 9:00,
- PWA i Web Push przetestowane na prawdziwej przeglądarce,
- synchronizacja Google Calendar przez OAuth,
- Telegram tekstowy i głosowy z AI, dynamiczną listą wykonawców i bezpiecznym szkicem,
- komendy Telegrama do kończenia, przesuwania i wyświetlania zadań,
- automatyczne zatwierdzanie kompletnego szkicu po 10 minutach,
- zadania cykliczne dzienne, tygodniowe i miesięczne z pauzowaniem,
- zespoły, ręczne udostępnianie zadań i preferencje kanałów powiadomień,
- automatyczne kopie bazy, szyfrowany backup offsite w Google Drive, sprawdzony pełny test odtworzenia, retencja 14 kopii dziennych + 8 tygodniowych i monitoring przez n8n,
- aktywny 14-dniowy pilotaż z metrykami w panelu administratora,
- wdrożony i zweryfikowany stos produkcyjny na `127.0.0.1:8090` za Cloudflare Tunnel.

Do operacyjnego domknięcia pozostaje obserwacja wyników trwającego pilotażu i poprawki wynikające z użycia przez cztery osoby.

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
pnpm build
```
