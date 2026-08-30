# Rejestr decyzji produktowych

Data bazowa ustaleń: 2026-08-28. Strefa czasowa pierwszego wdrożenia: `Europe/Warsaw`.

## Zatwierdzone decyzje

1. Panel pokazuje cztery główne widoki: **Bieżące**, **Oczekujące**, **Delegowane** i **Cykliczne**.
2. „Delegowane” i „Cykliczne” są cechami/widokami, a nie wzajemnie wykluczającymi się statusami. Zadanie może być jednocześnie cykliczne i delegowane.
3. Zadania zakończone są dostępne w archiwum „Zrobione”.
4. Każde zadanie posiadające termin jest synchronizowane z Google Calendar użytkownika, jeśli połączył konto.
5. Gdy użytkownik poda datę bez godziny, aplikacja przyjmuje domyślnie **14:00**.
6. Przypomnienia przed terminem są planowane na 7 dni, 1 dzień i 1 godzinę wcześniej, o ile wskazany moment przypomnienia znajduje się jeszcze w przyszłości.
7. Po przekroczeniu terminu przypomnienie jest wysyłane codziennie o **9:00** aż do zakończenia zadania lub zmiany terminu.
8. Przypomnienie o przeterminowanym zadaniu otrzymują wykonawca i osoba delegująca.
9. Aplikacja posiada własny silnik powiadomień. Google Calendar nie jest jedynym źródłem alertów.
10. Obsługiwane kanały to centrum powiadomień w aplikacji, web push i Telegram. Dostępność kanału zależy od połączeń oraz preferencji użytkownika.
11. Użytkownik może zmienić termin w panelu. Zmiana przelicza harmonogram przypomnień i aktualizuje Google Calendar.
12. Każdy użytkownik ma stronę „Moje ustawienia” do zarządzania własnym profilem, integracjami i powiadomieniami.
13. Google Calendar jest łączony przez OAuth z poziomu przycisku w ustawieniach. Aplikacja nie przechowuje hasła do konta Google.
14. Tokeny integracji muszą być zaszyfrowane w bazie danych.
15. Administrator techniczny nie uzyskuje automatycznego dostępu do treści prywatnych zadań.
16. Środowiskiem produkcyjnym będzie istniejący serwer dostępny docelowo przez SSH jako `dpkomis@ssh.dpkomis.pl`.
17. Publicznym adresem aplikacji będzie `https://tasker.dpkomis.pl`.
18. Strefa DNS `dpkomis.pl` jest zarządzana w Cloudflare.
19. Aplikacja ma działać za HTTPS i reverse proxy; baza danych oraz proces workera nie mogą być publicznie wystawione do Internetu.
20. Wdrożenie nie może zmieniać konfiguracji istniejących usług bez wcześniejszego audytu serwera i wykonania kopii zmienianych plików konfiguracyjnych.
21. Tasker będzie osobnym projektem Docker Compose w `/home/dpkomis/apps/tasker-prod` i nie będzie dołączany do istniejącego stosu `dpkomis-prod`.
22. Web/API Taskera będzie dostępne dla tunelu wyłącznie na `127.0.0.1:8090`; baza PostgreSQL nie otrzyma publicznego mapowania portu.
23. Istniejący Cloudflare Tunnel zostanie rozszerzony o regułę `tasker.dpkomis.pl` → `http://127.0.0.1:8090`.
24. Dla Taskera należy utworzyć automatyczne kopie PostgreSQL, ponieważ audyt nie potwierdził działającego harmonogramu backupu aplikacji.
25. Użytkownik może wgrać avatar PNG, JPG lub WebP do 1 MB. Obraz jest przechowywany w PostgreSQL, dzięki czemu nie znika przy wymianie kontenera.
26. Kompletny szkic Telegrama jest automatycznie zatwierdzany po 10 minutach bez reakcji. Szkic niejasny zawsze czeka na doprecyzowanie.
27. Kod źródłowy jest wersjonowany w repozytorium `https://github.com/Melonso/Tasker`.
28. Ekran „Dzisiaj” pokazuje najpierw zadania, a liczniki kategorii są stale rozwiniętym podsumowaniem pod listą.
29. Osobisty plan dnia należy do wykonawcy. Tylko wykonawca może przypiąć aktywne zadanie do własnego planu na bieżącą datę.
30. Mobilny pasek nawigacji zawiera `Dzisiaj`, `Zadania`, centralne `Dodaj`, `Powiadomienia` i `Więcej`; szczegółowe statusy są filtrami, nie równorzędnymi głównymi celami nawigacji.
31. Formularz tworzenia eksponuje tytuł, wykonawcę, termin i priorytet. Opis, widoczność, udostępnianie oraz cykliczność są opcjami rozwijanymi na żądanie.
32. Polecenia Telegrama kończące lub przesuwające zadanie nie wymagają dokładnego tytułu. Tasker dopasowuje charakterystyczny fragment wyłącznie do aktywnych zadań, których użytkownik jest autorem lub wykonawcą, i wymaga doprecyzowania przy niejednoznacznym wyniku.
33. Podsumowanie liczby zadań na ekranie „Dzisiaj” jest zawsze rozwinięte i nie posiada sterowania do zwijania, zarówno na komputerze, jak i na urządzeniu mobilnym.
34. Bot Telegram posiada deterministyczne skróty `/jutro` i `/zadania` obok `/dzisiaj` i `/zalegle`. Pełne zestawienie jest dzielone na mobilne sekcje kategorii zamiast szerokiej tabeli HTML, której zwykły tryb wiadomości Telegrama nie obsługuje.
35. Wiadomości głosowe Telegrama są pobierane przez n8n, transkrybowane jako polska mowa przez OpenAI i dalej obsługiwane tą samą ścieżką szkicu co polecenia tekstowe. Tasker nie przechowuje oryginalnego nagrania ani transkrypcji.
36. Polecenie „dodaj osobę do zadania” oznacza bezpośrednie udostępnienie bez zmiany wykonawcy, natomiast „przekaż/przypisz zadanie osobie” zmienia jedynego głównego wykonawcę. Obie operacje może zatwierdzić wyłącznie autor zadania i żadna nie podlega automatycznemu zatwierdzeniu.

## Użytkownicy pilotażowi i role

| Użytkownik | Rola początkowa | Zakres |
|---|---|---|
| Paweł Kurek | właściciel biznesowy | sprawy firmowe, zespoły, delegowanie i kontrola realizacji |
| Mateusz Meloch | administrator aplikacji + użytkownik firmowy | konfiguracja techniczna, użytkownicy, integracje, diagnostyka oraz zwykła praca z zadaniami |
| Michał Murawski | użytkownik firmowy | własne, firmowe i udostępnione zadania |
| Nadia Kamieniecka-Nowak | użytkownik zewnętrzny | wyłącznie własne zadania i sprawy udostępnione bezpośrednio lub przez przypisaną grupę |

## Przyjęte założenia wymagające walidacji w pilotażu

- Wydarzenie reprezentujące termin zadania ma domyślnie 15 minut, aby nie blokować dużego fragmentu kalendarza.
- Google Calendar jest widokiem terminów, natomiast wykonanie, delegowanie i historia pozostają zarządzane w Taskerze.
- Po zakończeniu zadania wydarzenie w kalendarzu pozostaje i otrzymuje oznaczenie wykonania zamiast być usuwane.
- Użytkownik może wyłączyć poszczególne kanały, ale centrum powiadomień w aplikacji zawsze zachowuje historię alertów.
