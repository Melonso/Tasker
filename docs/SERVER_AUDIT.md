# Audyt serwera produkcyjnego

Data audytu: 2026-08-28. Audyt wykonano odczytowo przez Cloudflare Access i SSH, bez `sudo`, instalowania pakietów, restartów i zmian konfiguracji.

## Podsumowanie

Serwer posiada bardzo duży zapas zasobów i może obsłużyć Taskera jako oddzielny stos Docker Compose. Nie ma potrzeby dokładania nowej maszyny ani współdzielenia bazy z istniejącą aplikacją.

## System i zasoby

| Element | Stan |
|---|---|
| Host | `miniserwer` |
| System | Ubuntu 24.04.4 LTS |
| Kernel | Linux 6.8, x86_64 |
| CPU | 16 logicznych procesorów |
| RAM | 62 GiB, około 60 GiB dostępne podczas audytu |
| Swap | 8 GiB, niewykorzystany |
| Dysk główny | 937 GiB, około 858 GiB wolne, 4% wykorzystania |
| Czas działania | około 30 dni |
| Obciążenie | bliskie zeru podczas audytu |

## Kontenery

- Docker Server/Client: 29.6.2
- Docker Compose: 5.3.1
- istniejący projekt: `dpkomis-prod`
- konfiguracja: `/home/dpkomis/apps/dpkomis-prod/docker-compose.yml`
- usługi: migracje, backend, frontend i PostgreSQL 15
- frontend: port hosta 8080,
- backend: port hosta 3000,
- PostgreSQL istniejącego projektu nie ma publicznego mapowania portu.

Istniejącego PostgreSQL nie należy współdzielić z Taskerem. Oddzielna instancja/volume ułatwi backup, migracje, ograniczenie dostępu i niezależny rollback.

## Cloudflare

- `cloudflared.service` działa jako usługa systemowa,
- tunel jest konfigurowany przez `/etc/cloudflared/config.yml`,
- istniejące reguły obsługują domenę główną, `www`, `api` oraz SSH,
- ruch HTTP jest kierowany bezpośrednio na porty kontenerów,
- końcowa reguła zwraca 404 dla nieznanych hostów,
- `tasker.dpkomis.pl` nie posiada jeszcze rekordu DNS ani reguły ingress.

Docelowa reguła Taskera:

```yaml
  - hostname: tasker.dpkomis.pl
    service: http://127.0.0.1:8090
```

Musi zostać umieszczona przed końcową regułą 404.

## Katalogi i backup

- aplikacje znajdują się w `/home/dpkomis/apps`,
- istnieją ręczne katalogi kopii w `/home/dpkomis/dpkomis-backups`,
- konto `dpkomis` nie ma własnego crontaba,
- audyt bez `sudo` nie potwierdził dedykowanego automatycznego backupu bazy aplikacji,
- jedynym widocznym timerem z nazwą backupu był systemowy backup metadanych pakietów, nie danych aplikacji.

Tasker powinien otrzymać:

- katalog `/home/dpkomis/apps/tasker-prod`,
- oddzielny wolumen PostgreSQL,
- codzienny dump bazy,
- szyfrowaną kopię poza tym serwerem,
- udokumentowany test odtworzenia.

## Dostęp administracyjny

- użytkownik: `dpkomis`,
- konto należy do grup `sudo`, `docker` i `adm`,
- SSH jest dostępne przez Cloudflare Access,
- utworzono dedykowany klucz `tasker-dpkomis-deploy`,
- odcisk klucza: `SHA256:NC7CI/qegG2VJtAP/7OhUVvrspxcDUVdehrgg+kVqzo`,
- logowanie kluczem zostało zweryfikowane.

Klucz prywatny pozostaje poza repozytorium. Jego utrata lub podejrzenie ujawnienia wymaga usunięcia odpowiadającej linii z `~/.ssh/authorized_keys` na serwerze.

## Porty widoczne podczas audytu

- 22 – SSH origin dla tunelu,
- 3000 – istniejący backend,
- 8080 – istniejący frontend,
- lokalne porty systemowe DNS i Cloudflare.

Nowy port 8090 powinien zostać związany wyłącznie z `127.0.0.1`, a nie wszystkimi interfejsami.

## Ryzyka zastane

1. Istniejące porty 3000 i 8080 są związane z `0.0.0.0`; Tasker nie powinien powielać tego wzorca.
2. Nie potwierdzono automatycznych kopii danych aplikacji.
3. Build cache Dockera zajmuje około 14,9 GiB, ale przy obecnej ilości wolnego miejsca nie stanowi blokady.
4. Modyfikacja tunelu wymaga dostępu `sudo` i ostrożnej walidacji, ponieważ ten sam plik obsługuje działające usługi.

## Rekomendacja

Można rozpocząć implementację lokalnie. Produkcję należy zmienić dopiero po przygotowaniu działającego obrazu, pliku Compose, migracji, health checku i backupu. Pierwsze wdrożenie powinno utworzyć całkowicie oddzielny stos `tasker-prod` i nie restartować kontenerów `dpkomis-prod`.
