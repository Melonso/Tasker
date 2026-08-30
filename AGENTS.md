# Stałe zasady pracy nad Taskerem

## Dokumentowanie zmian

Każda nowa funkcja, zmiana zachowania lub integracja musi zostać udokumentowana w tym samym zadaniu, zanim praca zostanie uznana za zakończoną.

Przy każdej zmianie należy sprawdzić i zaktualizować odpowiednie miejsca:

- `README.md` — aktualny zakres możliwości aplikacji,
- `docs/IMPLEMENTATION_PLAN.md` — status realizacji i pozostałe prace,
- `docs/INTEGRATION_API.md` — endpointy, payloady, komendy oraz zachowanie integracji,
- `docs/DEPLOYMENT.md` — zmiany produkcyjne, harmonogramy, sekrety i procedury operacyjne,
- pozostałe dokumenty domenowe, jeśli zmiana wpływa na decyzje lub specyfikację MVP.

Dokumentacja ma opisywać faktycznie wdrożone zachowanie, a nie sam zamiar lub plan.

## Telegram i n8n

Przy dodaniu albo zmianie funkcji dostępnej przez Telegram należy zawsze ocenić, czy potrzebna jest nowa szybka komenda bota.

Jeśli komenda jest potrzebna, w ramach tej samej zmiany należy:

1. dodać jej deterministyczną obsługę do źródłowego workflow w `n8n/`,
2. zaktualizować aktywny workflow produkcyjny n8n,
3. zaktualizować listę komend i instrukcję w `docs/INTEGRATION_API.md`,
4. przygotować wpis do `setMyCommands` / BotFathera,
5. poinformować użytkownika, jeśli ustawienie menu wymaga działania właściciela bota,
6. sprawdzić działanie skrótu po wdrożeniu.

Obecna lista szybkich komend:

- `/dzisiaj` — zadania na dziś,
- `/jutro` — zadania z terminem na jutro,
- `/zalegle` — zadania po terminie,
- `/zadania` — wszystkie aktywne zadania w głównych kategoriach,
- `/dodaj` — instrukcja dodawania zadania,
- `/pomoc` — skrócona instrukcja i możliwości bota.

## Kryterium zakończenia

Zmiana jest zakończona dopiero wtedy, gdy kod, testy, produkcja, workflow automatyzacji i dokumentacja opisują ten sam stan funkcji. Jeśli któryś element wymaga działania użytkownika, należy podać dokładną, krótką instrukcję i po wykonaniu zweryfikować rezultat.
