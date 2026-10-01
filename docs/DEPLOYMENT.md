# Środowisko produkcyjne i wdrożenie

## 1. Ustalone środowisko

- Publiczny adres aplikacji: `https://tasker.dpkomis.pl`
- Zarządzanie DNS: Cloudflare, strefa `dpkomis.pl`
- Docelowy serwer: `dpkomis@ssh.dpkomis.pl`
- Strefa czasowa operacyjna: `Europe/Warsaw`

Stan rozpoznania z 2026-08-28:

- `tasker.dpkomis.pl` nie posiada jeszcze rekordu DNS,
- `ssh.dpkomis.pl` rozwiązuje się do publicznych adresów proxy Cloudflare,
- bezpośrednie połączenie TCP/SSH na porcie 22 przez `ssh.dpkomis.pl` kończy się timeoutem,
- serwer jest chroniony przez Cloudflare Access i wymaga użycia `cloudflared access ssh` jako `ProxyCommand`,
- klient `cloudflared` jest zainstalowany lokalnie w `C:\Program Files (x86)\cloudflared\cloudflared.exe`,
- autoryzacja Cloudflare Access i logowanie dedykowanym kluczem działają poprawnie,
- utworzono dedykowany lokalny klucz ED25519 `C:\Users\Ja\.ssh\tasker-dpkomis-deploy`; jego odcisk to `SHA256:NC7CI/qegG2VJtAP/7OhUVvrspxcDUVdehrgg+kVqzo`,
- lokalny wpis `Host ssh.dpkomis.pl` korzysta z `cloudflared` i dedykowanego klucza,
- serwer działa na Ubuntu 24.04 LTS, posiada 16 CPU, 62 GiB RAM i około 858 GiB wolnego miejsca,
- Docker 29.6.2 i Docker Compose 5.3.1 działają poprawnie,
- aktywny Cloudflare Tunnel kieruje istniejące domeny bezpośrednio na porty kontenerów,
- nie ma osobnego reverse proxy na hoście; widoczny proces Nginx należy do istniejącego kontenera frontendowego,
- istniejący stos `dpkomis-prod` zajmuje porty 8080 i 3000 oraz korzysta z prywatnego PostgreSQL,
- nie potwierdzono automatycznego harmonogramu backupu aplikacji.

Stan produkcyjny z 2026-08-29:

- domena i reguła Cloudflare Tunnel działają,
- web, worker i PostgreSQL działają jako osobny stos `tasker-prod`,
- Google Calendar, Telegram i Web Push zostały sprawdzone produkcyjnie,
- skrypty `deploy/backup-tasker.sh`, `deploy/verify-tasker-backup.sh` i `deploy/check-tasker-health.sh` są uruchamiane z crona,
- n8n sprawdza stan operacyjny co 5 minut i informuje administratora na Telegramie o awarii oraz powrocie usługi.

Wydanie mobilne z 2026-09-02 ustawia viewport PWA na szerokość urządzenia, skalę początkową i maksymalną `1`, wyłącza skalowanie przez użytkownika oraz używa `viewport-fit=cover`. Pola formularzy mają na ekranach do 760 px co najmniej 16 px, dzięki czemu Safari na iPhone nie uruchamia automatycznego zoomu po ustawieniu fokusu. Odstępy treści uwzględniają górny i dolny safe area urządzenia.

Wydanie przypomnień z 2026-09-02 dodaje do nowo generowanych komunikatów imię i nazwisko autora oraz opcjonalną listę użytkowników i zespołów, którym zadanie udostępniono. Zmiana korzysta z istniejącego pola `text` endpointu dostaw Telegrama i nie wymaga migracji bazy, nowych sekretów, aktualizacji aktywnego workflow n8n ani zmiany menu komend bota. Web, worker i n8n nadal korzystają z tego samego kontraktu dostawy.

Wydanie powiadomień o dostępie z 2026-09-02 zapisuje natychmiastowy komunikat dla nowego wykonawcy i każdej nowej osoby wskazanej w bezpośrednim udostępnieniu. Web Push i Telegram respektują istniejące połączenia oraz preferencje odbiorcy, korzystają z dotychczasowej kolejki dostaw i prowadzą do szczegółów zadania. Zmiana nie wymaga migracji, sekretów, aktualizacji workflow n8n ani nowej szybkiej komendy. Obrazy `web` i `worker` wdrożono produkcyjnie 2026-09-02; health check pozostał zielony. Smoke test na dwóch technicznych zadaniach potwierdził komunikaty `Nowe zadanie dla Ciebie` i `Udostępniono Ci zadanie` oraz dla każdego stany `IN_APP: SENT`, `TELEGRAM: PENDING` i `WEB_PUSH: PENDING` przy aktywnych technicznych połączeniach. Zadania, powiadomienia, dostawy, audyt i użytkowników smoke testu następnie usunięto, a kontrolne liczniki zwróciły zero.

Wydanie Notatek z 2026-09-02 dodaje prywatne notatki, wiele dziennych lub tygodniowych harmonogramów porządkowych oraz kontrakt integracyjny `5` z `POST /api/integrations/notes`. Migracja `0008_famous_trauma.sql` tworzy tabele `notes` i `note_reminder_schedules`, typy enum kolorów i częstotliwości oraz nullable `notifications.target_path`, dzięki któremu wszystkie kanały mogą prowadzić do `/notes`. Worker obsługuje terminy według strefy użytkownika i korzysta z dotychczasowych preferencji IN_APP, WEB_PUSH i TELEGRAM. Zmiana nie dodaje sekretów. Aplikację i migrację należy wdrożyć przed opublikowaniem nowej wersji workflow `Tasker — Telegram + AI`.

Aktualizacja instrukcji Telegrama z 2026-09-02 rozdziela `/dodaj` i `/pomoc` w workflow `Tasker — Telegram + AI`. `/dodaj` ma osobny deterministyczny przebieg i pełny opis tworzenia, wykonawcy, udostępnienia, terminu, priorytetu, widoczności oraz zatwierdzania. `/pomoc` pokazuje skróty i obsługę istniejących zadań bez duplikowania instrukcji tworzenia. Wersję `d98aa757-456e-4da5-b5d6-99fef4affa6c` opublikowano produkcyjnie; zmiana nie wymaga migracji, nowych sekretów ani przebudowy obrazów aplikacji.

Aktualizacja webowego modułu Notatek z 2026-09-02 zastępuje karty kompaktową tabelą, przenosi formularz pod rozwijany przycisk w nagłówku oraz dodaje edycję bezpośrednio w wierszu i jawne usuwanie z potwierdzeniem. Wdrożono nowy obraz `web`; endpoint gotowości zwrócił `ready`, a zalogowany test produkcyjny potwierdził rozwijanie formularza, przejście wiersza w pola edycji oraz brak poziomego przepełnienia przy 390×844 px. Zmiana nie modyfikuje bazy danych, workera, sekretów, kontraktu integracyjnego ani workflow n8n.

Aktualizacja liczników nawigacji z 2026-09-02 pokazuje w nawiasach bieżącą liczbę elementów widoków `Dzisiaj`, `Notatki`, `Bieżące`, `Oczekujące`, `Delegowane`, `Cykliczne` i `Zrobione`. Zapytania liczników współdzielą warunki filtrowania z listami oraz liczą odrębne zadania, dlatego udostępnienia nie zawyżają wyniku. Nowy obraz `web` wdrożono produkcyjnie; endpoint gotowości zwrócił `ready`. Zalogowany test potwierdził wszystkie siedem liczb na panelu desktopowym, zgodność `Zadania (3)` z trzema wierszami docelowego widoku oraz brak poziomego przepełnienia w rozmiarze 390×844 px. Zmiana nie wymaga migracji bazy, przebudowy workera, nowych sekretów, zmiany kontraktu integracyjnego ani workflow n8n.

Poprawka responsywnego układu listy z 2026-09-02 łączy awatar autora oraz treść zadania w jeden blok układu, dzięki czemu zadania otrzymane nie rozdzielają awatara, tytułu, metadanych i menu na przypadkowe wiersze na telefonach. Licznik każdej sekcji ma niezależny element 30×30 px z wymuszonym centrowaniem tekstu. Wdrożono wyłącznie nowy obraz `web`; gotowość aplikacji i bazy pozostała w stanie `ready`. Zalogowana kontrola produkcji objęła szerokości 360, 390, 430 i 1440 px, wiersze z awatarem autora i bez niego, granice menu i statusów, poziome przepełnienie oraz geometryczne położenie cyfr. Wszystkie warianty przeszły; odchylenie środka tekstu od środka badge'a wyniosło najwyżej 0,2 px. Zmiana nie wymaga migracji, workera, sekretów, zmiany kontraktu integracyjnego ani workflow n8n.

Wydanie polskich etykiet i priorytetów z 2026-09-02 zachowuje prostą regułę Telegrama: brak rodzaju oznacza prywatny, a firmowy wymaga jawnego wskazania. Podgląd szkicu tłumaczy typ, wszystkie cztery priorytety oraz trzy poziomy dostępu i nie wyświetla enumów API. Aktywny workflow `Tasker — Telegram + AI` opublikowano jako wersję `a66bbbcc-f8cc-4cbb-ae63-73bd276159d6`; kopia poprzedniej wersji znajduje się w `backups/workflows/tasker-ai-before-polish-priority-20260902.json`. Web pozwala autorowi zmienić typ, autorowi lub wykonawcy zmienić priorytet, pokazuje plakietkę na każdym wierszu i sortuje pilne oraz wysokie zadania przed normalnymi i niskimi, zachowując wcześniejszą kolejność terminów w ramach poziomu. Lint, typowanie, 70 testów, walidacja workflow i build przeszły; renderer czterech kombinacji nie ujawnił wartości `PRIVATE`, `COMPANY`, `SHARED`, `LOW`, `NORMAL`, `HIGH` ani `URGENT`. Zalogowana kontrola produkcji potwierdziła komplet plakietek i oba formularze na desktopie oraz przy 360 px. Wykryte w trakcie kontroli przepełnienie szczegółów zostało usunięte przez jednokolumnowe metadane mobilne; końcowy `scrollWidth` zrównał się z szerokością klienta. Zmiana nie wymaga migracji, workera, nowych sekretów, nowej komendy ani aktualizacji menu BotFathera.

Poprawka automatycznego zapisu typu i priorytetu z 2026-09-02 zastępuje niekontrolowane formularze kontrolowanymi selektami. Wybór wartości natychmiast wywołuje akcję serwerową, zachowuje wybraną wartość podczas odświeżenia danych i pokazuje stan zapisu albo błąd; osobne przyciski „Zmień typ” i „Zmień priorytet” usunięto. Zmiana dotyczy widoku szczegółów oraz menu wiersza i nie wymaga migracji, zmian workera ani workflow n8n. Produkcyjny test potwierdził automatyczne przejścia typu `COMPANY` → `PRIVATE` oraz priorytetu `NORMAL` → `HIGH` → `NORMAL` zarówno w interfejsie, jak i tabeli zadań oraz audycie; wartości zadania testowego przywrócono po kontroli. Menu przy szerokości 360 px mieści oba selekty bez poziomego przepełnienia (`scrollWidth = clientWidth`). Lint, typowanie, 70 testów oraz build produkcyjny przeszły poprawnie.

Poprawka integracji Telegram/OpenAI z 2026-09-02 usuwa z modelu `gpt-5.4-mini` nieobsługiwany parametr `temperature`, który zatrzymywał interpretację poleceń błędem HTTP 400 przed utworzeniem szkicu. Aktywny workflow `Tasker — Telegram + AI` opublikowano jako wersję `09d20e2b-2e0a-47fb-a66c-1daadbd941f6`; kopia poprzedniej wersji znajduje się w `backups/workflows/tasker-ai-before-remove-temperature-20260902.json`. Walidacja źródła przeszła bez problemów, bezpieczny dry-run Responses API z docelowym modelem i parametrami zwrócił `200` oraz `completed`, webhook Telegrama jest zarejestrowany bez błędu i bez oczekujących aktualizacji. Nie ponawiano nieudanych wiadomości użytkowników, aby nie tworzyć duplikatów. Zmiana nie wymaga migracji, restartu aplikacji, nowej komendy ani aktualizacji menu BotFathera.

Poprawka widoczności udostępnionych zadań z 2026-09-02 rozszerza filtry `Dzisiaj` i `Bieżące` o bezpośrednich odbiorców oraz członków udostępnionych zespołów, bez włączania wszystkich zadań firmowych do osobistej listy. Widoki oraz liczniki korzystają ze wspólnego warunku. Otrzymany wiersz pokazuje autora i jego awatar; odbiorca samego udostępnienia nie widzi akcji zastrzeżonych dla autora lub wykonawcy. Nowy obraz `web` wdrożono produkcyjnie, a endpoint gotowości pozostał w stanie `ready`. Kontrola na rzeczywistym wpisie udostępnienia dla Michała zwróciła w jego filtrze `Bieżące` zadanie „Ogarnąć polcarda z Michałem…” wraz z autorem Mateuszem i dostępnym awatarem autora. Zalogowany smoke test właściciela potwierdził zachowanie jego akcji, poprawny mobilny układ listy i brak błędów konsoli. Zmiana nie wymaga migracji, sekretów, aktualizacji workera, kontraktu integracyjnego ani workflow n8n.

Wydanie podziału firmowe/prywatne z 2026-09-02 dodaje enum `task_scope`, kolumnę `tasks.scope` oraz kontrakt integracyjny `6`. Migracja `0009_fixed_amphibian.sql` klasyfikuje istniejące rekordy `visibility=COMPANY|SHARED` jako firmowe, pozostałe jako prywatne, a także uzupełnia aktywne szkice Telegrama. Rodzaj nie zmienia dostępu: `scope` odpowiada wyłącznie za klasyfikację i prezentację, a `visibility` nadal steruje uprawnieniami. Wszystkie widoki webowe pokazują pionowe sekcje Firmowe i Prywatne; autor może zmienić rodzaj w szczegółach. Przed migracją utworzono backup `tasker-20260902T174026Z.dump` i potwierdzono odtworzenie 28 tabel. Po migracji obrazy `web` i `worker` przeszły health check, a chroniony `/api/integrations/health` zwrócił kontrakt `6` i możliwość `TASK_SCOPE_PRIVATE_COMPANY`. Smoke test API wymusił z tekstu `COMPANY` mimo wejściowego `PRIVATE` oraz `PRIVATE` mimo wejściowego `COMPANY`, anulował oba szkice i sprawdził 10 pozycji zestawienia bez brakującego autora lub nieprawidłowego rodzaju. Produkcyjny workflow `Tasker — Telegram + AI` opublikowano jako wersję `314b5471-5027-4066-835a-4b6d39b9c12b`; wykonanie webhooka `263836` zakończyło się sukcesem, wygenerowało i wysłało dwa komunikaty zawierające oba nagłówki oraz autorów. Zalogowany test webowy potwierdził pionowe sekcje `Firmowe (1)` i `Prywatne (7)` w widoku Bieżące, brak poziomego przepełnienia przy 390×844 px oraz formularze o rozmiarze tekstu 16 px. Zmiana nie dodaje sekretów ani nowej komendy; właściciel bota powinien jedynie uaktualnić opis istniejącego `/zadania` w BotFatherze.

Dołączenie użytkownika Pauliny Grzankowskiej z 2026-09-03 rozszerza zespół o nowego użytkownika firmowego (`paulina.grzankowska@dpkomis.pl`, rola `COMPANY_MEMBER`). Paulina została dodana do `src/lib/pilot-users.ts` oraz mocka wykonawców w `n8n/tasker-telegram-ai.workflow.ts`. Wdrożenie produkcyjne przeprowadzono 2026-09-03: przed zmianą wykonano automatyczny backup `tasker-20260903T093055Z.dump`, wykonano skrypt `deploy/add-paulina-grzankowska.sql`, przebudowano i zrestartowano obraz `tasker-prod-web`, a endpointy `/api/health/ready` oraz `/api/health/operations` potwierdziły status `ready` i `operational`. Dla Pauliny wygenerowano jednorazowy 7-dniowy link aktywacyjny: `[chroniony link aktywacyjny — wartość pominięta]`. Po aktywacji hasła konto uzyskuje pełną aktywność w aplikacji webowej oraz asystencie Telegrama. Zmiana nie wymagała migracji schematu, nowych sekretów ani nowej komendy bota.

Poprawka nakładania menu opcji zadania oraz bezpośredniej edycji rodzaju wpisu z 2026-09-03 usuwa przycinanie menu akcji (`•••` / `.task-menu-popover`) na dole listy zadań w widoku „Dzisiaj” (`overflow: visible` na `.today-board`), podnosi `z-index: 30` dla otwartego `.task-menu[open]` i popovera (oraz `35` w widoku mobilnym), dodaje bezpośrednie pole edycji rodzaju wpisu (`AutoSaveTaskSelect` w wariancie `row`) w wierszach listy zadań dla autora (Firmowy / Prywatny) oraz dodaje klikalny link z kopiowaniem do bota Telegrama (`@dpkomis_tasker_bot`) w karcie ustawień integracji. Wdrożono nowy obraz `web`; endpointy `/api/health/ready` i `/api/health/operations` potwierdziły status `ready` i `operational`. Zmiana nie wymaga migracji bazy, restartu workera, nowych sekretów ani zmian workflow n8n.

Brak bezpośredniej odpowiedzi SSH nie oznacza awarii serwera. W tym środowisku dostęp jest pośredniczony przez Cloudflare Access. Po zalogowaniu poprawne połączenie powinno używać polecenia równoważnego z:

```sshconfig
Host ssh.dpkomis.pl
    User dpkomis
    ProxyCommand "C:\Program Files (x86)\cloudflared\cloudflared.exe" access ssh --hostname %h
    IdentityFile C:\Users\Ja\.ssh\tasker-dpkomis-deploy
    IdentitiesOnly yes
```

Wpisu nie należy dodawać do lokalnej konfiguracji przed pomyślnym teście jednorazowego połączenia i potwierdzeniem właściwego klucza SSH.

## 2. Docelowy układ

```text
Użytkownik
    ↓ HTTPS
Cloudflare DNS/Access/Tunnel
    ↓ http://127.0.0.1:8090 na origin
Tasker Web/API ─── PostgreSQL
       │               ↑
       └──── Worker ────┘
              │
              ├── Web Push
              ├── Google Calendar
              ├── Telegram
              └── transkrypcja głosu
```

Tasker Web/API będzie mapowany wyłącznie na `127.0.0.1:8090`, dzięki czemu dostęp zapewni Cloudflare Tunnel bez publicznego wystawiania portu aplikacji. PostgreSQL i interfejs workera pozostają wyłącznie w prywatnej sieci kontenerowej.

## 3. Warunki przed wdrożeniem

Przed jakąkolwiek zmianą serwera należy ustalić:

1. wykonać kopię `/etc/cloudflared/config.yml` przed dodaniem reguły Taskera,
2. potwierdzić możliwość bezpiecznego użycia `sudo` do walidacji i przeładowania usługi `cloudflared`,
3. utworzyć trasę DNS `tasker.dpkomis.pl` dla istniejącego tunelu w panelu Cloudflare,
4. ustalić lokalizację szyfrowanej kopii poza tym serwerem,
5. ustalić limity retencji backupów i logów,
6. przygotować sekrety integracji bez zapisywania ich w repozytorium.

Pierwsze połączenie ma być odczytowe. Nie należy instalować pakietów, restartować usług ani modyfikować reverse proxy w ramach audytu.

## 4. Cloudflare i DNS

Należy utworzyć trasę DNS `tasker.dpkomis.pl` wskazującą na istniejący Cloudflare Tunnel. Na origin do konfiguracji `/etc/cloudflared/config.yml`, przed końcową regułą `http_status:404`, należy dodać:

```yaml
  - hostname: tasker.dpkomis.pl
    service: http://127.0.0.1:8090
```

Przed przeładowaniem należy wykonać kopię pliku i uruchomić walidację konfiguracji. Zmiana nie może modyfikować istniejących reguł `dpkomis.pl`, `www`, `api` ani `ssh`.

Rekomendowane ustawienia:

- ruch HTTP przez proxy Cloudflare, o ile jest zgodny z istniejącą infrastrukturą,
- tryb SSL/TLS **Full (strict)**,
- ważny certyfikat na origin: Let's Encrypt albo Cloudflare Origin Certificate,
- automatyczne przekierowanie HTTP do HTTPS,
- WebSocket dozwolony, jeśli będzie potrzebny w panelu,
- brak agresywnego cache dla `/api/*`, callbacków OAuth i webhooków,
- cache statycznych zasobów wersjonowanych,
- podstawowe limity żądań dla logowania, webhooka Telegram i endpointów integracji.

Nie należy kierować zwykłego SSH przez pomarańczowe proxy Cloudflare, chyba że infrastruktura świadomie korzysta ze Spectrum lub Cloudflare Tunnel/Access. Dostęp administracyjny powinien używać bezpośredniego rekordu DNS-only, tunelu lub VPN zgodnie z istniejącą polityką serwera.

## 5. Wejście HTTP przez Cloudflare Tunnel

Cloudflare Tunnel ma przekazywać `tasker.dpkomis.pl` do aplikacji nasłuchującej wyłącznie lokalnie na porcie 8090. Aplikacja powinna prawidłowo interpretować:

- prawidłowy nagłówek `Host`, adres klienta i informację o HTTPS,
- limity rozmiaru odpowiednie dla krótkich wiadomości głosowych,
- dłuższy timeout wyłącznie dla endpointów, które rzeczywiście go wymagają,
- osobny endpoint `/health/live` i `/health/ready`,
- logi dostępu z wyłączeniem tokenów, nagrań i danych prywatnych,
- przekierowanie HTTP → HTTPS.

Cloudflare pozostaje warstwą TLS. Aplikacja musi ufać nagłówkom proxy tylko od kontrolowanego wejścia i generować publiczne adresy z bazowego URL `https://tasker.dpkomis.pl`.

## 6. Układ aplikacji na serwerze

Zgodnie z istniejącym układem serwera Tasker otrzyma wydzielone miejsce `/home/dpkomis/apps/tasker-prod`, z podziałem na:

- plik Compose i konfigurację wdrożeniową,
- zaszyfrowane/chronione zmienne środowiskowe poza repozytorium,
- trwały wolumen PostgreSQL,
- katalog backupów o ograniczonym dostępie,
- wersjonowane obrazy aplikacji.

Procesy:

- `web` – panel i API,
- `worker` – przypomnienia oraz integracje,
- `postgres` – baza bez publicznego portu,
- opcjonalny lokalny mechanizm wykonywania backupów.

Web/API mapuje port kontenera wyłącznie jako `127.0.0.1:8090:<port-kontenera>`. Nie należy stosować `0.0.0.0:8090`.

Kontenery nie powinny działać jako root, jeśli zastosowane obrazy na to pozwalają. Obrazy powinny być przypięte do wersji, a nie do zmiennego tagu `latest`.

## 7. Sekrety i adresy callback

Sekrety nie trafiają do Git ani obrazu kontenera. Środowisko produkcyjne będzie potrzebować m.in.:

- sekretu sesji aplikacji,
- danych połączenia PostgreSQL,
- klucza szyfrowania tokenów integracji,
- Google OAuth client ID/secret,
- tokenu bota Telegram,
- kluczy VAPID dla Web Push,
- danych dostawcy transkrypcji,
- opcjonalnych danych usługi e-mail.

Po uruchomieniu domeny należy skonfigurować dokładne callbacki, np.:

- Google OAuth: `https://tasker.dpkomis.pl/api/integrations/google/callback`,
- Telegram: `https://tasker.dpkomis.pl/api/webhooks/telegram`.

Webhook Telegram musi posiadać sekret weryfikacyjny. Callback OAuth musi sprawdzać `state` i być przypisany do zalogowanego użytkownika.

Produkcyjny workflow `Tasker — Telegram + AI` w n8n korzysta z chronionych credentials `Tasker Telegram Bot`, `Tasker OpenAI` oraz `Tasker API`. Dla wiadomości głosowej pobiera plik `.oga` jako dane binarne, transkrybuje polską mowę w węźle OpenAI i przekazuje wyłącznie wynik tekstowy do dalszej interpretacji. Tasker nie zapisuje nagrania ani transkrypcji w PostgreSQL. Retencję binarnych danych wykonań należy kontrolować po stronie n8n i utrzymywać możliwie krótką; logi aplikacji nie mogą zawierać treści nagrania ani transkrypcji.

Kontrakt integracyjny `3` dodaje ręcznie zatwierdzane intencje `SHARE_TASK` i `REASSIGN_TASK`. Wdrożenie wymaga jednoczesnej aktualizacji aplikacji oraz aktywnego workflow n8n; workflow nie może zostać przełączony wcześniej niż API, ponieważ starszy kontrakt odrzuci nowe intencje. Przekazanie zadania przebudowuje przyszłe przypomnienia i jest odzwierciedlane w Google Calendar przez istniejący cykliczny worker synchronizacji.

Kontrakt integracyjny `4` rozszerza `CREATE_TASK` o pole `shareWith`. Aplikację należy wdrożyć przed workflow n8n. Nie wymaga to migracji SQL, ponieważ identyfikator odbiorcy jest przechowywany w istniejącym payloadzie JSONB szkicu, a po potwierdzeniu korzysta z istniejącej tabeli `task_shares`.

Kontrakt integracyjny `6` rozszerza `CREATE_TASK` o `taskScope: PRIVATE|COMPANY` oraz wiersze list o `taskScope` i `author`. Kolejność wdrożenia jest obowiązkowa: backup i jego weryfikacja → migracja `0009_fixed_amphibian.sql` → obrazy aplikacji → kontrola `/api/integrations/health` z wersją `6` → publikacja workflow n8n → smoke test prywatnego i firmowego szkicu oraz `/zadania`.

Kontrakt integracyjny `5` dodaje `CREATE_NOTE` i endpoint `/api/integrations/notes`. Workflow rozpoznaje `/notatka TREŚĆ` oraz naturalne sformułowania związane z notatkami, zapisuje notatkę bez szkicu zadania i wysyła potwierdzenie z linkiem. Właściciel bota musi dopisać `notatka - Zapisz prywatną notatkę` przez BotFathera `/setcommands` albo Bot API `setMyCommands`.

Menu BotFathera powinno opisywać rozdzielenie jako `dodaj - Jak dodać zadanie tekstem lub głosem` oraz `pomoc - Pozostałe możliwości bota`. Sama zmiana odpowiedzi odbywa się w aktywnym workflow; BotFather steruje jedynie tekstem widocznym pod przyciskiem „Menu”.

Kontrakt `5` wdrożono produkcyjnie 2026-09-02 razem z aktywną wersją workflow n8n `c9672dfb-4ff4-42be-a4bb-44bcb731405c`. Przed migracją utworzono backup `tasker-20260902T103723Z.dump` i potwierdzono jego pełne odtworzenie do izolowanej bazy z 26 tabelami. Smoke test endpointu notatek zwrócił `201` przy pierwszym zapisie oraz `200`, ten sam identyfikator i `created: false` po ponowieniu tego samego `sourceEventId`; techniczny rekord następnie usunięto. Osobny test workera przetworzył jeden termin, zapisał `IN_APP: SENT`, poprawnie pominął wyłączone `WEB_PUSH` i `TELEGRAM`, ustawił `target_path: /notes` oraz wyliczył kolejny termin w przyszłości; tymczasowego użytkownika i wszystkie jego dane usunięto kaskadowo. Widok mobilny 390×844 nie miał poziomego przepełnienia. Menu BotFathera wymaga jednorazowego dopisania komendy przez właściciela bota, ponieważ token bota pozostaje wyłącznie w chronionym credential n8n.

Kontrakt `4` wdrożono produkcyjnie 2026-08-31 razem z aktywną wersją workflow n8n `efc2656c-67bc-4087-a24a-baa4de05927e`. Przed wdrożeniem utworzono i zweryfikowano backup `tasker-before-create-share-20260831T154526Z.dump`. Smoke test potwierdził `NEEDS_CLARIFICATION` dla `SHARED` bez odbiorcy oraz kompletny szkic `DRAFT` z Michałem Murawskim w `shareWith`; oba techniczne szkice anulowano bez utworzenia zadań.

Kontrakt `3` wdrożono produkcyjnie 2026-08-30 razem z aktywną wersją workflow n8n `e7927994-0f13-4fbe-8e55-8514311e1a08`. Kontrola `/api/integrations/health` potwierdziła obie możliwości, a smoke test utworzył i anulował bez wykonywania mutacji kompletne szkice `SHARE_TASK` oraz `REASSIGN_TASK`. Przed testem wykonano i sprawdzono katalog backupu `tasker-before-telegram-sharing-20260830T215209Z.dump`.

Po pierwszym teście Telegrama poprawiono błąd składni wyrażenia podglądu dla nowych intencji oraz skierowano wiadomości krótsze niż 3 znaki bezpośrednio do pomocy. Trzy błędne wykonania zatrzymały się przed wysłaniem podglądu i nie zmieniły żadnego zadania.

Kolejny test potwierdził wykonanie `SHARE_TASK`, lecz ujawnił niezależny błąd składni komunikatu końcowego. Sama operacja zwróciła `CONFIRMED`, a ponowne kliknięcia były idempotentne. Zagnieżdżony warunek komunikatu zastąpiono mapą intencji, aby ograniczyć ryzyko podobnych błędów przy następnych operacjach.

## 8. Procedura pierwszego wdrożenia

1. Wykonać odczytowy audyt SSH i zapisać bezpieczne wnioski bez sekretów.
2. Uzgodnić miejsce aplikacji i sposób integracji z istniejącym reverse proxy.
3. Przygotować produkcyjny plik Compose oraz przykład zmiennych środowiskowych.
4. Zbudować i przetestować obrazy poza serwerem produkcyjnym.
5. Utworzyć katalog aplikacji, sieć i chronione sekrety.
6. Uruchomić PostgreSQL i migracje.
7. Uruchomić web oraz worker na porcie lokalnym.
8. Sprawdzić health check lokalnie na serwerze.
9. Dodać regułę `tasker.dpkomis.pl` do konfiguracji Cloudflare Tunnel i zweryfikować konfigurację.
10. Utworzyć trasę DNS hosta do istniejącego tunelu w Cloudflare.
11. Zweryfikować HTTPS, nagłówki, logowanie, push i callbacki integracji.
12. Wykonać pierwszą kopię zapasową i próbne odtworzenie.
13. Dopiero po testach zaprosić czterech użytkowników pilotażowych.

## 9. Aktualizacje i wycofanie wersji

Każde wdrożenie powinno posiadać identyfikowalną wersję obrazu. Bezpieczny przebieg aktualizacji:

1. backup bazy przed migracją zmieniającą schemat,
2. pobranie/zbudowanie wersjonowanych obrazów, w tym jawne `docker compose build migrate web worker`,
3. uruchomienie migracji z nowo zbudowanego obrazu `migrate`, kompatybilnej z bieżącą i nową wersją,
4. wymiana procesu web i workera,
5. test health check oraz kluczowego przepływu,
6. zachowanie poprzedniego obrazu do szybkiego rollbacku.

Rollback aplikacji nie może automatycznie cofać destrukcyjnej migracji bazy. Migracje MVP powinny być projektowane jako rozszerzające i odwracalne operacyjnie.

Migracja `0007_shallow_captain_midlands.sql` dodaje nullable pole `tasks.planned_for_date` oraz indeks wykonawca + data planu. Jest rozszerzająca: starsza wersja aplikacji ignoruje kolumnę, dlatego rollback obrazu nie wymaga cofania migracji.

Migracja `0008_famous_trauma.sql` jest rozszerzająca: dodaje wyłącznie nowe typy, tabele, indeksy i nullable `notifications.target_path`. Starsza wersja aplikacji ignoruje te elementy, dlatego rollback obrazu nie wymaga cofania migracji; przed jej uruchomieniem nadal obowiązuje pełny backup PostgreSQL.

### Wdrożenie poprawek z code review (wykonane 2026-10-01)

Gałąź `claude/relaxed-gauss-23rram` zawiera poprawki opisane w `docs/FIX_ROADMAP.md`. Pełna instrukcja dla wykonującego wdrożenie, łącznie z obowiązkowym scaleniem z kodem produkcyjnym spoza GitHuba (notatki, `taskScope`), znajduje się w `docs/DEPLOY_HANDOFF_2026-10-01.md`. Wdrożenie wykonano po scaleniu stanu produkcji `7db1494` z poprawkami (`1156c36`) i korekcie kontekstu Docker (`e03389b`). Poniższa lista opisuje kolejność procedury:

1. Wykonać i zweryfikować backup: `deploy/backup-tasker.sh`.
2. Sprawdzić, że chroniony `.env` zawiera jawne `SESSION_SECRET` oraz `INTEGRATION_ENCRYPTION_KEY` (np. `grep -c '^SESSION_SECRET=' .env`, bez wyświetlania wartości). Nowa wersja odmawia startu w produkcji, jeżeli którejś brakuje — dotychczas po cichu używała wartości deweloperskich.
3. Sprawdzić, czy zespoły firmowe zawierają osoby zewnętrzne (nowa reguła nie usuwa istniejących członkostw):
   `select t.name, u.email from teams t join team_members m on m.team_id = t.id join users u on u.id = m.user_id join user_roles ur on ur.user_id = u.id join roles r on r.id = ur.role_id where not t.is_external and r.key = 'EXTERNAL';`
   Wynik należy omówić z właścicielem przed ewentualną zmianą.
4. Zbudować obrazy i uruchomić migrację `0010_login_attempts.sql`. Migracja tylko dodaje tabelę `login_attempts` z indeksami, dlatego rollback obrazu nie wymaga jej cofania.
5. Wymienić procesy `web` i `worker`, sprawdzić `/api/health/ready` i `/api/health/operations`.
6. Dopiero po aplikacji zaktualizować w n8n workflow „Tasker — przypomnienia Telegram” (wyjście błędu per wiadomość, raport `success:false`) oraz „Tasker — Telegram + AI” (tylko czaty prywatne, polskie etykiety podglądu). Przy okazji zmienić nazwę poświadczenia „Tasket Telegram Bot” na „Tasker Telegram Bot”.
7. Smoke test: logowanie, utworzenie i zakończenie zadania, avatar w ustawieniach, `/dzisiaj` w Telegramie, szkic z potwierdzeniem, testowy push.

Zmiany zachowania istotne operacyjnie:

- `/api/health/operations` zwraca `degraded` dla nieświeżego lub zdegradowanego workera, nieudanego przypomnienia w ciągu 24 h albo co najmniej 3 nieudanych dostaw w ciągu 24 h. Pojedyncza nieudana dostawa nie wyłącza już stanu `operational` na dobę, a nieosiągalni odbiorcy Telegrama są oznaczani jako `SKIPPED`.
- Worker wykonuje każdy krok skanu niezależnie i zapisuje heartbeat ze statusem `HEALTHY` albo `DEGRADED` oraz wynikiem każdego kroku. Nowy krok porządkowy usuwa wygasłe sesje, zużyte kody Telegrama i próby logowania starsze niż 30 dni.
- Logowanie blokuje konto po 5 nieudanych próbach w ciągu 15 minut (oraz adres IP po 20); adres IP pochodzi z nagłówka `CF-Connecting-IP` ustawianego przez Cloudflare.
- Aplikacja wysyła nagłówki CSP, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` i HSTS.

## 10. Kopie zapasowe i monitoring

Minimum produkcyjne:

- codzienny automatyczny backup PostgreSQL,
- szyfrowana kopia poza tym samym wolumenem/serwerem,
- określona retencja, początkowo rekomendowane 7 kopii dziennych i 4 tygodniowe,
- regularny test odtworzenia,
- monitoring health check, zajętości dysku i błędów workera,
- alert, gdy harmonogram przypomnień przestaje być przetwarzany,
- logi bez tokenów OAuth, nagrań głosowych i treści prywatnych zadań.

Lokalny harmonogram instaluje `deploy/install-operations-cron.sh`: codzienny backup o 02:17, zaszyfrowany upload poza serwer o 02:27, cotygodniową próbę odtworzenia w izolowanej bazie oraz kontrolę zdrowia co 5 minut. Backup jest weryfikowany przez `pg_restore --list`, ma uprawnienia `0600` i retencję 14 dni.

Upload poza serwer jest bezpiecznie pomijany do czasu utworzenia chronionego pliku `/home/dpkomis/apps/tasker-prod/.env.offsite-backup` (uprawnienia `0600`). Wymagane są `TASKER_BACKUP_ENCRYPTION_KEY_FILE` oraz `TASKER_OFFSITE_UPLOAD_URL`; opcjonalnie adres może zawierać `{filename}`. Nazwa pliku jest również przekazywana w nagłówku `X-Tasker-Backup-Name`. Opcjonalnie można podać bearer token albo dane Basic Auth. Skrypt szyfruje AES-256-CBC z PBKDF2, wysyła wyłącznie zaszyfrowany plik i sumę SHA-256, po czym usuwa plik tymczasowy.

W produkcji upload kieruje do aktywnego workflow n8n „Tasker — szyfrowany backup offsite”, który zapisuje pliki w osobnym folderze „Tasker Backups” na Google Drive. Pierwszy rzeczywisty zaszyfrowany dump i jego suma zostały przesłane oraz zweryfikowane 2026-08-29. Klucz szyfrowania znajduje się wyłącznie w chronionym katalogu `.secrets` na serwerze Taskera; n8n i Google Drive nigdy go nie otrzymują.

Druga kopia klucza odzyskiwania jest przechowywana poza serwerem jako plik chroniony Windows DPAPI, przypisany do bieżącego konta użytkownika: `C:\Users\Ja\Documents\Tasker Recovery\tasker-backup-key.dpapi`. Nie jest to plik tekstowy i nie należy go wysyłać do repozytorium ani Google Drive. Do kontrolowanego odzyskania klucza służy `deploy/recover-tasker-backup-key.ps1`.

Pełna próba odtworzenia offsite została wykonana 2026-08-29 na rzeczywistym pliku pobranym z Google Drive. Sprawdzono sumę SHA-256, odszyfrowano AES-256-CBC/PBKDF2, zweryfikowano katalog `pg_restore` i odtworzono kopię w izolowanej bazie. Wynik: 23 tabele, 4 zadania i poprawny schemat cykliczności. Baza testowa oraz pliki tymczasowe zostały usunięte po teście.

Aktywny workflow n8n „Tasker — retencja backupów offsite” uruchamia się codziennie o 03:15 czasu `Europe/Warsaw`. Zachowuje 14 najnowszych zestawów dziennych, a następnie po jednym zestawie tygodniowym z 8 kolejnych tygodni. Plik dump i odpowiadająca mu suma są traktowane jako jeden zestaw. Stare pliki są przenoszone do kosza Google Drive, a nie kasowane bezpowrotnie. Źródło konfiguracji znajduje się w `n8n/tasker-offsite-retention.workflow.json`; ścieżka webhooka i identyfikator folderu są celowo zastąpione placeholderami. Produkcyjny workflow został sprawdzony 2026-08-29 na nieszkodliwym pliku technicznym, wykonanie n8n `252199` zakończyło się sukcesem.

Procedura awaryjna:

1. Pobrać plik `*.dump.enc` i odpowiadający mu `*.sha256` z folderu „Tasker Backups”.
2. Na komputerze z tym samym kontem Windows odzyskać klucz do tymczasowego pliku: `powershell -File deploy/recover-tasker-backup-key.ps1 -ProtectedKeyPath "C:\Users\Ja\Documents\Tasker Recovery\tasker-backup-key.dpapi" -DestinationPath "C:\Temp\tasker-backup.key"`.
3. Zweryfikować sumę SHA-256 zaszyfrowanego pliku przed odszyfrowaniem.
4. Odszyfrować plik przez OpenSSL z AES-256-CBC, PBKDF2 i 200 000 iteracji, używając odzyskanego pliku klucza.
5. Uruchomić `pg_restore --list`, a następnie odtworzyć dump wyłącznie do nowej, izolowanej bazy.
6. Sprawdzić migracje, liczbę tabel i kluczowe dane, zanim baza zastąpi środowisko produkcyjne.
7. Bezpiecznie usunąć tymczasowy jawny plik klucza i odszyfrowany dump.

## 11. Następny krok operacyjny

Stos produkcyjny działa w `/home/dpkomis/apps/tasker-prod`, a publiczne endpointy `/api/health/ready` i `/api/health/operations` służą odpowiednio do kontroli aplikacji oraz całego procesu przypomnień. Szyfrowana kopia poza serwerem działa przez n8n i Google Drive.

Klucz poza serwerem, pełna próba awaryjna oraz automatyczna retencja Google Drive są wdrożone i sprawdzone. Następnym krokiem operacyjnym jest obserwacja metryk i uwag czterech użytkowników podczas pilotażu oraz okresowe powtarzanie pełnego testu odtworzenia offsite.


### Bramka 0 przed poprawkami code review — 2026-10-01

Kontekst Docker wyklucza `.secrets`, `backups`, `logs`, `.tmp`, `.codex-remote-attachments`, dumpy i archiwa wdrożeniowe obok istniejącego wykluczenia `.env*`. Przed startem nowych kontenerów należy potwierdzić wykluczenia na rzeczywistym kontekście serwera. Skrypty backupu i odtworzenia można uruchamiać przez `bash deploy/backup-tasker.sh` oraz `bash deploy/verify-tasker-backup.sh`, jeśli pliki nie mają bitu wykonania.

Odnaleziono niezacommitowany lokalny kod produkcyjny: Notatki, rodzaj zadania (`scope` / `taskScope`), kontrakt integracyjny 6, podział list firmowe/prywatne, liczniki nawigacji, powiadomienia o dostępie i poprawki mobilne. Odczyt produkcji potwierdził 10 migracji (0000–0009); czasy journalu i sumy SHA-256 wszystkich plików SQL odpowiadają tabeli `drizzle.__drizzle_migrations`. Produkcja zawiera `notes`, `note_reminder_schedules` oraz `tasks.scope`. Wszystkie 141 plików w `src`, `drizzle` i `n8n` odpowiadają lokalnej kopii poza rozszerzonym lokalnie `drafts.test.ts`. Katalog produkcyjny nie jest repozytorium Git; kod przekazywano jako archiwum. Stan produkcyjny zapisano na `main` jako `7db1494`.

Scalenie zachowuje rodzaj zadania i powiadomienia o dostępie we wspólnych transakcjach, produkcyjne filtry udostępnień w widokach osobistych przez `EXISTS`, liczniki nawigacji oraz krok przypomnień notatek w izolowanym skanie workera. Zmiana rodzaju i priorytetu korzysta z blokady aktywnego zadania i obsługi błędu w istniejącym kontrolowanym selekcie; zakończone i anulowane zadania nie podlegają tym mutacjom. Migrację logowania przenumerowano na `0010_login_attempts.sql`; zawiera tylko tabelę i dwa indeksy. Weryfikacja 2026-10-01: frozen install, typecheck, lint, 85 testów jednostkowych, 28 integracyjnych oraz build przeszły. Testy potwierdzają zachowanie `COMPANY` niezależnie od prywatnej widoczności przy wyścigu zatwierdzeń szkicu i zakończeń cyklu. Aplikacja i migracja `0010` wdrożone z commita `e03389be2ee5cdaa3587bcdd393d8f5542b03216`; oba workflow n8n opublikowane po walidacji.

### Wynik wdrożenia 2026-10-01

- Backup `tasker-20261001T081910Z.dump` (2 225 104 bajty), pełne odtworzenie kontrolne: 28 tabel. Kopia kodu: `backups/tasker-source-pre-review-20261001.tar.gz`.
- Rollback: `tasker-prod-web:pre-review-20261001`, `tasker-prod-runner:pre-review-20261001`, `tasker-prod-migrate:pre-review-20261001`. Nie cofać migracji.
- Zweryfikowano obecność obu sekretów; zapytanie o osoby zewnętrzne w zespołach firmowych zwróciło 0 wierszy.
- Przypomnienia n8n: `b9cd9ee0-6b66-42e7-8c5c-af86d4a0c6d2`; Telegram + AI: `3a14174f-0e03-43b7-8907-880fbf167c34`. Kopie obu poprzednich grafów zapisano w `backups/*-before.json` i sprawdzono SHA-256.
- Credential `5IbWlDjmEVAQkvzT` nazwano „Tasker Telegram Bot”; powiązania zachowano. Źródło AI odzwierciedla aktualne parametry produkcyjne (w tym `gpt-5.6-luna` i `OpenAi account`), połączenia i credentials.
- Pierwsza budowa wykazała brak wykluczenia `.secrets` i `backups`. Nie uruchomiono jej obrazów; poprawiono `.dockerignore`, zweryfikowano rzeczywisty kontekst audytem `COPY`, przebudowano obrazy. Usunięto konkretnie cztery wpisy cache tej budowy (292,3 MB), a ich brak sprawdzono ponownie; pozostały cache i obrazy rollbacku zachowano.
- Grupa wizualna przypomnień obejmuje pobranie i rozdzielenie dostaw; rozgałęzienia wysyłki i raportów pozostają poza nią, zgodnie z walidacją n8n.
- Testy i ograniczenia smoke testu: `docs/DEPLOY_REPORT_2026-10-01.md`.
