# Plan implementacji MVP

## Status realizacji

- **Etap 0 – zakończony.** Pełny stos Docker z PostgreSQL, migracją, webem i workerem został uruchomiony oraz sprawdzony na serwerze 2026-08-28.
- **Etap 1 – gotowy dla MVP.** Działają hasła, sesje, jednorazowa aktywacja, role, profile, avatary, zespoły, jawne udostępnienia i ochrona prywatności.
- **Etap 2 – gotowy dla MVP.** Działają widoki, tworzenie, delegowanie, zadania cykliczne, szczegóły, komentarze, oczekiwanie, wznowienie, zakończenie, anulowanie i przesuwanie terminu.
- **Etap 3 – gotowy.** Harmonogram przypomnień, eskalacje, centrum powiadomień, trwały worker, deduplikacja i diagnostyka działają produkcyjnie.
- **Etap 4 – gotowy.** PWA, wielourządzeniowy Web Push i test z ustawień zostały wdrożone i sprawdzone.
- **Etap 5 – podstawowy obieg gotowy.** OAuth, primary calendar, tworzenie, aktualizacja, zakończenie i odłączenie działają; wybór innego kalendarza pozostaje do wykonania.
- **Etapy 6–7 – gotowe dla MVP.** Telegram przyjmuje tekst i głos, tworzy bezpieczne szkice, kończy i przesuwa zadania, pokazuje listy na dziś i zaległe oraz wysyła alerty zgodnie z preferencjami.
- **Etap 8 – pilotaż aktywny.** Działają lokalne automatyczne backupy, szyfrowana kopia w Google Drive przez n8n, sprawdzona pełna próba odtworzenia offsite, automatyczna retencja 14 zestawów dziennych + 8 tygodniowych, zewnętrzny monitoring i metryki pilotażu uruchomionego 2026-08-29 dla czterech użytkowników.
- **Etap 9 – pierwsza iteracja UX wdrożona.** Audyt znajduje się w `docs/UX_RESEARCH_2026-08-29.md`. Zrealizowano zadaniowy ekran „Dzisiaj”, osobiste przypinanie do planu, zwinięte statystyki, skanowalną listę, uproszczone dodawanie, szybkie przesuwanie terminu i mobilną nawigację z centralnym `+`.

## 1. Rekomendowana architektura

MVP powinno działać na jednym serwerze, ale rozdzielać ruch użytkowników od zadań pracujących w tle.

### Komponenty

1. **Aplikacja webowa/PWA** – interfejs, API, logowanie, ustawienia i panel administracyjny.
2. **Worker** – trwałe wykonywanie przypomnień, ponowień i synchronizacji.
3. **PostgreSQL** – jedyne źródło prawdy dla zadań, harmonogramów i audytu.
4. **Reverse proxy z HTTPS** – zakończenie TLS i routing.
5. **Integracje zewnętrzne** – Google Calendar, Telegram, dostawca transkrypcji i Web Push.

Docelowy adres produkcyjny to `https://tasker.dpkomis.pl`, a wdrożenie ma działać na serwerze `dpkomis@ssh.dpkomis.pl`. Szczegółowa procedura i warunki bezpieczeństwa znajdują się w `docs/DEPLOYMENT.md`.

Rekomendowany stos na start:

- TypeScript,
- Next.js jako aplikacja webowa i API,
- PostgreSQL,
- ORM z migracjami (Prisma lub Drizzle; wybrać jeden przed rozpoczęciem kodu),
- trwała kolejka oparta na PostgreSQL, aby nie dodawać Redis do pierwszego wdrożenia,
- osobny proces Node.js dla workera,
- Docker Compose na serwerze,
- testy jednostkowe, integracyjne i przeglądarkowe.

Proces webowy i worker używają wspólnego pakietu domenowego, ale worker nie może być uruchamiany jako część krótkotrwałego żądania HTTP. Przypomnienia muszą przetrwać restart serwera.

## 2. Zasady techniczne

- PostgreSQL jest źródłem prawdy; Google Calendar i Telegram są projekcjami/wyjściami.
- Operacje integracyjne korzystają z idempotency key i kontrolowanych ponowień.
- Każda mutacja zadania zapisuje zdarzenie audytowe w tej samej transakcji.
- Tokeny OAuth i sekrety są szyfrowane kluczem spoza bazy danych.
- Czas przechowywany jest w UTC, a reguły użytkownika odnoszą się do `Europe/Warsaw` lub jego ustawienia.
- Worker blokuje pobrane zadanie kolejki, aby dwie instancje nie wysłały tego samego alertu.
- Prywatność jest egzekwowana w warstwie zapytań/API, nie wyłącznie przez ukrycie elementu interfejsu.
- Zmiany schematu odbywają się wyłącznie przez wersjonowane migracje.

## 3. Etapy prac

### Etap 0 – fundament repozytorium

Zakres:

- inicjalizacja projektu TypeScript,
- struktura aplikacji webowej, workera i wspólnych pakietów,
- Docker Compose dla aplikacji i PostgreSQL,
- konfiguracja zmiennych środowiskowych bez sekretów w repozytorium,
- lint, formatowanie, test runner i automatyczne sprawdzanie kompilacji,
- podstawowy health check.
- odczytowy audyt serwera: system, zasoby, istniejący reverse proxy, Docker, wolne porty, układ katalogów, firewall i mechanizm kopii zapasowych,
- ukończenie autoryzacji Cloudflare Access i potwierdzenie połączenia SSH przez lokalny `cloudflared` jako `ProxyCommand`,
- przygotowanie konfiguracji produkcyjnej dla `tasker.dpkomis.pl` bez ingerencji w istniejące usługi.

Warunek zakończenia: nowa instalacja uruchamia aplikację i bazę jedną udokumentowaną komendą, a kontrola jakości przechodzi bez błędów.

### Etap 1 – konta, role i prywatność

Zakres:

- logowanie oraz aktywacja kont z zaproszeń,
- utworzenie czterech użytkowników pilotażowych,
- role: właściciel biznesowy, administrator aplikacji, członek firmy i użytkownik zewnętrzny,
- profil i podstawowe ustawienia użytkownika,
- zespoły i jawne udostępnienia,
- testy macierzy dostępu, w szczególności prywatności i konta Nadii.

Warunek zakończenia: każdy użytkownik widzi wyłącznie dozwolone dane, a Mateusz ma panel konfiguracji bez wglądu w prywatne treści.

### Etap 2 – zadania i panel

Zakres:

- tworzenie, edycja, zakończenie i anulowanie zadania,
- delegowanie jednej osobie,
- widoki Bieżące, Oczekujące, Delegowane, Cykliczne i Zrobione,
- ekran Dzisiaj,
- osobisty plan dnia oraz hierarchię „Po terminie” → „Plan na dziś” → „Termin na dziś”,
- przesuwanie terminu,
- szybkie przesuwanie na jutro lub za tydzień,
- komentarze i historia zmian,
- responsywny interfejs mobilny.
- progresywne ujawnianie zaawansowanych pól podczas tworzenia zadania.

Warunek zakończenia: pełny obieg zadania działa bez integracji zewnętrznych i posiada testy autoryzacji.

### Etap 3 – silnik przypomnień

Zakres:

- generowanie punktów 7 dni, 1 dzień i 1 godzinę przed terminem,
- codzienna eskalacja o 9:00 po terminie,
- anulowanie i przeliczanie harmonogramu przy zmianie terminu,
- centrum powiadomień,
- worker, ponowienia i deduplikacja,
- wskaźniki kondycji kolejki w panelu administratora.

Warunek zakończenia: test z przyspieszonym zegarem potwierdza poprawny harmonogram, brak duplikatów i zachowanie po restarcie workera.

### Etap 4 – PWA i Web Push

Zakres:

- service worker i manifest PWA,
- rejestracja wielu urządzeń użytkownika,
- uzyskanie zgody na powiadomienia,
- wysyłka web push oraz akcje prowadzące do zadania,
- usuwanie wygasłych subskrypcji,
- testowe powiadomienie z ustawień.

Warunek zakończenia: użytkownik może jednym działaniem włączyć push, otrzymać test i poprawnie otworzyć wskazane zadanie.

### Etap 5 – Google Calendar

Zakres:

- OAuth z minimalnym wymaganym zakresem uprawnień,
- wybór lub utworzenie kalendarza „Tasker”,
- tworzenie i aktualizacja wydarzeń,
- obsługa odłączenia, wygaśnięcia tokenu i ponownej autoryzacji,
- kolejka ponowień synchronizacji,
- status integracji w „Moich ustawieniach”.

Warunek zakończenia: zadanie z terminem trafia do właściwego kalendarza, a przesunięcie i wykonanie są poprawnie synchronizowane.

### Etap 6 – Telegram tekstowy

Zakres:

- bot i bezpieczne połączenie konta jednorazowym kodem,
- polecenia tekstowe do tworzenia, delegowania, przesuwania i kończenia,
- podgląd przed zapisem z przyciskami Zapisz/Popraw/Anuluj,
- alerty Telegram zgodne z preferencjami,
- ograniczanie liczby żądań i ochrona webhooka.

Warunek zakończenia: użytkownik może przeprowadzić pełny obieg zadania bez otwierania panelu. Kompletny szkic można zatwierdzić ręcznie albo pozostawić do automatycznego zatwierdzenia po 10 minutach; niejasne polecenie zawsze wymaga decyzji użytkownika.

### Etap 7 – Telegram głosowy

Zakres:

- pobieranie nagrania tylko od połączonego użytkownika,
- transkrypcja przez wymiennego dostawcę,
- ekstrakcja struktury zadania,
- obsługa niejednoznaczności i błędów,
- krótka retencja lub natychmiastowe usuwanie nagrań,
- pomiar czasu przetworzenia i kosztu.

Warunek zakończenia: typowe polskie polecenia tworzą poprawny podgląd zadania w mniej niż 30 sekund, a nagranie nie pozostaje po poprawnym przetworzeniu.

### Etap 8 – utwardzenie i pilotaż

Zakres:

- kopie zapasowe i test odtworzenia bazy,
- logi strukturalne, alerty błędów i podstawowe metryki,
- testy bezpieczeństwa OAuth, webhooków i kontroli dostępu,
- testy strefy czasowej oraz zmiany czasu letniego/zimowego,
- scenariusze awarii zewnętrznych usług,
- uruchomienie dla czterech użytkowników i dwutygodniowa obserwacja,
- poprawki wynikające z pilotażu.

Warunek zakończenia: spełnione są kryteria sukcesu ze specyfikacji MVP, a kopia zapasowa została faktycznie odtworzona w środowisku testowym.

## 4. Kolejność zależności

```text
Fundament
   ↓
Konta i uprawnienia
   ↓
Zadania i panel
   ↓
Silnik przypomnień
   ├──→ Web Push
   ├──→ Google Calendar
   └──→ Telegram tekstowy → Telegram głosowy
                               ↓
                       Utwardzenie i pilotaż
```

Google, Web Push i Telegram mogą być rozwijane równolegle dopiero po ustabilizowaniu modelu zadań i kontraktu silnika powiadomień.

## 5. Testy krytyczne

1. Zadanie utworzone bez godziny otrzymuje 14:00 w strefie użytkownika.
2. Harmonogram dla terminu za 10 dni zawiera trzy alerty przed terminem.
3. Harmonogram dla zadania utworzonego 30 minut przed terminem nie wysyła natychmiast „zaległych” alertów.
4. Po terminie wykonawca i delegujący otrzymują alert o 9:00.
5. Zakończenie zadania przed 9:00 anuluje eskalację.
6. Przesunięcie zadania po terminie anuluje stary alert i buduje nowy harmonogram.
7. Restart workera nie powoduje utraty ani podwójnej wysyłki.
8. Nadia nie widzi listy ani treści nieudostępnionych zadań firmowych.
9. Mateusz może zmienić konfigurację systemu, ale nie może odczytać prywatnego zadania Pawła.
10. Odłączenie Google nie usuwa zadania i nie zatrzymuje powiadomień Taskera.
11. Wygasły token Google uruchamia ponowienie i pokazuje użytkownikowi czytelny stan połączenia.
12. Nieznana osoba w poleceniu głosowym wymusza doprecyzowanie zamiast przypadkowego delegowania.

## 6. Ryzyka i zabezpieczenia

| Ryzyko | Ograniczenie |
|---|---|
| błędna interpretacja głosu | podgląd i potwierdzenie każdej mutacji |
| duplikaty przypomnień | idempotencja, unikalne klucze i blokady workera |
| utrata przypomnień po restarcie | trwała kolejka w PostgreSQL |
| wyciek prywatnych zadań | polityki dostępu w API i testy macierzy uprawnień |
| wygaśnięcie OAuth | bezpieczny refresh, kolejka ponowień i stan integracji |
| nadmiar alertów | preferencje kanałów, grupowanie i mierzenie reakcji w pilotażu |
| różnice czasu | UTC w bazie, jawna strefa użytkownika i testy DST |
| zależność od dostawcy transkrypcji | adapter dostawcy i brak logiki biznesowej w warstwie STT |

## 7. Decyzje potrzebne przed pisaniem kodu

Pozostałe decyzje są techniczne i mogą zostać podjęte na początku etapu 0:

1. adres domeny i sposób dostępu do serwera,
2. system logowania: hasło z zaproszeniem, logowanie Google albo oba warianty,
3. wybór ORM: Prisma lub Drizzle,
4. wybór trwałej kolejki PostgreSQL,
5. dostawca transkrypcji głosu i limit kosztów,
6. czy delegujący synchronizuje zadania do swojego Google Calendar domyślnie, czy dopiero po włączeniu preferencji,
7. docelowa retencja nagrań głosowych i logów technicznych.
8. ukończona autoryzacja Cloudflare Access oraz potwierdzony klucz SSH dla użytkownika `dpkomis`.
9. istniejący na serwerze reverse proxy oraz sposób jego bezpiecznego rozszerzenia o `tasker.dpkomis.pl`.
