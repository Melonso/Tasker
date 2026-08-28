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
2. pobranie/zbudowanie wersjonowanych obrazów,
3. uruchomienie migracji kompatybilnej z bieżącą i nową wersją,
4. wymiana procesu web i workera,
5. test health check oraz kluczowego przepływu,
6. zachowanie poprzedniego obrazu do szybkiego rollbacku.

Rollback aplikacji nie może automatycznie cofać destrukcyjnej migracji bazy. Migracje MVP powinny być projektowane jako rozszerzające i odwracalne operacyjnie.

## 10. Kopie zapasowe i monitoring

Minimum produkcyjne:

- codzienny automatyczny backup PostgreSQL,
- szyfrowana kopia poza tym samym wolumenem/serwerem,
- określona retencja, początkowo rekomendowane 7 kopii dziennych i 4 tygodniowe,
- regularny test odtworzenia,
- monitoring health check, zajętości dysku i błędów workera,
- alert, gdy harmonogram przypomnień przestaje być przetwarzany,
- logi bez tokenów OAuth, nagrań głosowych i treści prywatnych zadań.

Lokalny harmonogram instaluje `deploy/install-operations-cron.sh`: codzienny backup o 02:17, cotygodniową próbę odtworzenia w izolowanej bazie oraz kontrolę zdrowia co 5 minut. Backup jest weryfikowany przez `pg_restore --list`, ma uprawnienia `0600` i retencję 14 dni. Nadal wymagane jest wskazanie szyfrowanego miejsca poza serwerem dla drugiej kopii.

## 11. Następny krok operacyjny

Stos produkcyjny działa w `/home/dpkomis/apps/tasker-prod`, a publiczne endpointy `/api/health/ready` i `/api/health/operations` służą odpowiednio do kontroli aplikacji oraz całego procesu przypomnień. Następnym krokiem operacyjnym jest skonfigurowanie szyfrowanej kopii backupów poza serwerem.
