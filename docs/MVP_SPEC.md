# Specyfikacja MVP Taskera

## 1. Cel produktu

Tasker ma zapobiegać gubieniu terminów, poleceń i informacji zwrotnej. Użytkownik powinien móc szybko utworzyć zadanie tekstem lub głosem, delegować je, otrzymać serię przypomnień i jednoznacznie sprawdzić, kto jest odpowiedzialny za wykonanie.

Najważniejsza obietnica produktu:

> Jeśli zadanie ma właściciela i termin, system przypomina o nim aż do wykonania albo świadomego przesunięcia terminu.

## 2. Zakres MVP

### 2.1 Zadania

Zadanie zawiera co najmniej:

- tytuł,
- opcjonalny opis,
- autora,
- jednego głównego wykonawcę,
- opcjonalny termin,
- opcjonalną datę przypięcia do osobistego planu dnia wykonawcy,
- priorytet,
- stan wykonania,
- zakres widoczności,
- opcjonalną regułę cykliczności,
- daty utworzenia, modyfikacji i zakończenia.

Dozwolone stany domenowe:

- `OPEN` – aktywne,
- `WAITING` – oczekujące na informację lub zdarzenie,
- `COMPLETED` – wykonane,
- `CANCELED` – anulowane.

Widoki w interfejsie:

- **Bieżące** – aktywne zadania przypisane do użytkownika,
- **Oczekujące** – zadania w stanie `WAITING`,
- **Delegowane** – aktywne zadania utworzone/delegowane przez użytkownika innej osobie,
- **Cykliczne** – zadania posiadające regułę powtarzania,
- **Zrobione** – zakończone archiwum.

Widok **Dzisiaj** ma hierarchię zadaniową, nie statystyczną. Najpierw pokazuje pracę w sekcjach „Po terminie”, „Plan na dziś” i „Termin na dziś”. Liczniki kategorii są wtórnym, stale rozwiniętym podsumowaniem. Wykonawca może przypiąć własne aktywne zadanie do planu na bieżący dzień niezależnie od jego terminu.

Zmiana na `WAITING` wymaga krótkiego powodu i opcjonalnej daty ponownego sprawdzenia. Zakończenie zadania zapisuje wykonawcę i czas wykonania.

### 2.2 Rodzaj zadania i widoczność

Rodzaj zadania jest niezależny od zakresu dostępu:

- `PRIVATE` – sprawa osobista, wyświetlana w sekcji „Prywatne”,
- `COMPANY` – sprawa służbowa, wyświetlana w sekcji „Firmowe”.

Każdy widok webowy prezentuje najpierw pionową sekcję firmową, a następnie prywatną. Ten układ obowiązuje na desktopie i urządzeniach mobilnych; aplikacja nie używa dwóch równoległych kolumn, aby zachować czytelność na wąskim ekranie.

Brak jawnego rodzaju w poleceniu Telegrama oznacza zadanie prywatne. Rodzaj firmowy jest nadawany wyłącznie po wskazaniu „firmowe” lub odpowiedniej odmiany; agent nie zgaduje rodzaju na podstawie branżowego słownictwa. Autor może później zmienić typ zadania w aplikacji, a sam wybór zapisuje zmianę bez dodatkowego potwierdzania.

Każde zadanie pokazuje plakietkę priorytetu: pilny, wysoki, normalny albo niski. W obrębie sekcji i kategorii zadania są porządkowane najpierw według priorytetu (`URGENT`, `HIGH`, `NORMAL`, `LOW`), a następnie według terminu. Autor i wykonawca mogą zmienić priorytet w aplikacji; wybór nowej wartości zapisuje się automatycznie.

Zakresy zadania:

- `PRIVATE` – widoczne tylko dla autora i wykonawcy, jeśli autor świadomie je deleguje,
- `COMPANY` – widoczne dla uprawnionych użytkowników firmowych,
- `SHARED` – widoczne wyłącznie dla wskazanych osób lub grup.

Administrator techniczny może widzieć metadane potrzebne do diagnostyki, ale bez treści prywatnego tytułu, opisu i komentarzy. Każdy odczyt wymagający awaryjnego podniesienia uprawnień musi być jawny, ograniczony czasowo i zapisany w audycie; funkcja awaryjna nie jest częścią pierwszego MVP.

### 2.3 Delegowanie i informacja zwrotna

- Zadanie posiada jednego wykonawcę odpowiedzialnego za realizację.
- Delegujący zachowuje dostęp do zadania i jego historii.
- Wykonawca może zakończyć zadanie, dodać komentarz, ustawić oczekiwanie lub zaproponować/przesunąć termin zgodnie z uprawnieniami.
- Po terminie alert otrzymują wykonawca i delegujący.
- Każda zmiana wykonawcy, terminu, stanu lub widoczności trafia do historii.

### 2.4 Terminy i przypomnienia

Reguła bazowa dla zadania z terminem:

| Warunek | Zaplanowane przypomnienia |
|---|---|
| termin za co najmniej 7 dni | 7 dni, 1 dzień i 1 godzinę przed |
| termin za 1–7 dni | 1 dzień i 1 godzinę przed |
| termin za 1–24 godziny | 1 godzinę przed |
| termin za mniej niż godzinę | brak nadrabiania pominiętych alertów; termin pozostaje widoczny jako pilny |
| termin przekroczony | codziennie o 9:00 do wykonania lub zmiany terminu |

Jeśli podano wyłącznie datę, `dueAt` otrzymuje godzinę 14:00 w strefie użytkownika. Wszystkie daty są przechowywane w UTC, a prezentowane i planowane w strefie użytkownika.

Zmiana terminu:

1. anuluje niewysłane przypomnienia starego terminu,
2. tworzy nowy harmonogram,
3. aktualizuje powiązane wydarzenia Google Calendar,
4. zapisuje autora zmiany w audycie.

Zmiana terminu nie może usunąć historii wcześniejszych terminów.

### 2.5 Kanały powiadomień

MVP obsługuje:

- centrum powiadomień w aplikacji,
- web push poprzez service workera/PWA,
- wiadomości Telegram po połączeniu konta,
- wydarzenia w Google Calendar.

Silnik Taskera jest źródłem harmonogramu przypomnień. Wpis w Google Calendar nie zastępuje alertu aplikacji. Każda próba wysyłki ma stan, liczbę prób i identyfikator idempotencji, aby ponowne uruchomienie procesu nie wysłało duplikatów.

Przy utworzeniu lub przekazaniu zadania nowy wykonawca otrzymuje natychmiastowy wpis w centrum powiadomień. Taki sam wpis otrzymuje każda nowa osoba wskazana w bezpośrednim udostępnieniu. Web Push i Telegram są kolejkowane wyłącznie, gdy odbiorca ma dostępny i włączony kanał; przypisanie zadania samemu sobie nie generuje alertu.

Powiadomienie zawiera:

- tytuł zadania,
- termin,
- informację, kto je delegował lub wykonuje,
- akcje „Otwórz”, „Zrobione” i „Przesuń termin”, jeśli kanał je obsługuje.

### 2.6 Google Calendar

Na stronie „Moje ustawienia” użytkownik może:

- połączyć konto Google przez OAuth,
- wybrać istniejący kalendarz lub utworzyć kalendarz „Tasker”,
- sprawdzić stan ostatniej synchronizacji,
- ponowić połączenie lub odłączyć konto.

Każde dostępne użytkownikowi zadanie z terminem może posiadać powiązanie kalendarzowe. Domyślna polityka MVP:

- zadania własne i przydzielone trafiają do kalendarza wykonawcy,
- delegujący może włączyć synchronizowanie zadań delegowanych do swojego kalendarza,
- brak połączenia Google nie blokuje tworzenia ani delegowania zadania,
- aktualizacja terminu aktualizuje wydarzenie,
- zakończenie oznacza wydarzenie jako wykonane,
- usunięcie połączenia nie usuwa zadań z Taskera.

Synchronizacja musi przechowywać identyfikator wydarzenia i wersję/znacznik synchronizacji. Błędy mają być ponawiane w tle i widoczne użytkownikowi w ustawieniach.

### 2.7 Telegram i polecenia głosowe

Użytkownik łączy konto Telegram jednorazowym, krótkotrwałym kodem wygenerowanym w ustawieniach. Bot przyjmuje tekst i wiadomości głosowe.

Minimalne intencje MVP:

- utwórz zadanie,
- deleguj zadanie,
- przesuń termin,
- oznacz jako wykonane,
- udostępnij istniejące zadanie wskazanej osobie bez zmiany wykonawcy,
- utwórz zadanie i od razu udostępnij je wskazanej osobie bez zmiany wykonawcy,
- przekaż istniejące zadanie nowemu wykonawcy,
- pokaż zadania na dziś, jutro, przeterminowane albo pełne zestawienie aktywnych kategorii.

Przykład:

> „Przypomnij Michałowi, żeby jutro do piętnastej wysłał materiały do strony.”

System przygotowuje podgląd:

- tytuł: „Wysłać materiały do strony”,
- wykonawca: Michał Murawski,
- termin: jutro, 15:00,
- delegujący: aktualny użytkownik,
- widoczność: firmowa.

Kompletny szkic nowego zadania można potwierdzić przyciskiem „Zapisz” lub odrzucić. Może on zawierać jednego wykonawcę i jednego bezpośredniego odbiorcę udostępnienia; obie role są pokazane oddzielnie. Brak reakcji przez 10 minut powoduje automatyczne utworzenie wyłącznie kompletnego nowego zadania i wysłanie potwierdzenia. Szkic `SHARED` bez odbiorcy pozostaje niekompletny. Zakończenie, przesunięcie terminu, udostępnienie istniejącego zadania oraz przekazanie wykonawcy zawsze wymagają ręcznego zatwierdzenia. Niejednoznaczna osoba, data lub zadanie wymaga doprecyzowania i nigdy nie jest zatwierdzana automatycznie.

Szybka komenda `/dodaj` jest kanoniczną instrukcją tworzenia i wyjaśnia odrębność wykonawcy oraz odbiorcy udostępnienia. `/pomoc` pokazuje pozostałe możliwości, skróty i operacje na istniejących zadaniach, a w sprawie tworzenia odsyła do `/dodaj` zamiast powtarzać jej treść.

Transkrypcja mowy działa przez węzeł OpenAI w n8n, oddzielony od logiki biznesowej Taskera, dzięki czemu dostawcę można zmienić bez przebudowy obsługi zadań. Tasker nie zapisuje nagrania ani transkrypcji w swojej bazie. Plik binarny podlega retencji technicznej instancji n8n; docelową polityką pozostaje możliwie szybkie usuwanie danych wykonania po przetworzeniu.

### 2.8 Notatki — rozszerzenie po MVP

Notatka jest prywatnym rekordem właściciela, całkowicie niezależnym od zadania. Zawiera tytuł, treść, jeden z sześciu kolorów oraz daty utworzenia i modyfikacji. Nie ma wykonawcy, terminu zadania, widoczności firmowej, komentarzy ani synchronizacji Google Calendar.

Notatkę można tworzyć, edytować i usuwać w osobnym module. Widok webowy jest kompaktową tabelą podobną do prostej bazy Notion: przycisk „Dodaj notatkę” w górnej części rozwija pola tworzenia, a kliknięcie istniejącego wiersza zamienia go w edytowalne pola tytułu, treści i koloru. Usunięcie jest dostępne z wiersza i wymaga potwierdzenia. Telegram zapisuje notatkę natychmiast przez `/notatka TREŚĆ` albo sformułowania „dodaj do notatek…” i „zapisz w notatkach…”. Identyfikator aktualizacji Telegrama zapewnia idempotencję.

Użytkownik może skonfigurować wiele niezależnych przypomnień o uporządkowaniu notatek. Każde ma częstotliwość dzienną albo tygodniową, dla tygodniowej wybrany dzień, lokalną godzinę i stan włączone/wyłączone. Przypomnienie korzysta z kanałów użytkownika i prowadzi do `/notes`.

### 2.9 Moje ustawienia

Każdy użytkownik może zarządzać:

- imieniem, nazwiskiem i strefą czasową,
- avatarem wyświetlanym przy użytkowniku, zadaniach i komentarzach,
- domyślną godziną zadania,
- godziną codziennej eskalacji,
- kanałami i typami powiadomień,
- subskrypcjami web push,
- połączeniem Google Calendar,
- połączeniem Telegram,
- językiem i wyglądem aplikacji.
- dziennymi i tygodniowymi harmonogramami porządkowania notatek.

Ustawienia globalne są dostępne wyłącznie administratorowi aplikacji i obejmują konfigurację integracji, domyślne polityki, zarządzanie użytkownikami, stan procesów w tle oraz diagnostykę.

## 3. Ekrany MVP

1. **Logowanie i aktywacja zaproszenia**.
2. **Dzisiaj** – zadania przeterminowane, świadomie przypięte do planu oraz z terminem na dziś; zadania są rozdzielone na firmowe i prywatne, a statystyki pozostają stale widoczne pod listą.
3. **Bieżące** – aktywne zadania przypisane użytkownikowi oraz jawnie udostępnione bez zmiany wykonawcy.
4. **Oczekujące**.
5. **Delegowane**.
6. **Cykliczne**.
7. **Zrobione**.
8. **Szczegóły zadania** – komentarze, historia, termin, wykonawca i widoczność.
9. **Nowe/edytowane zadanie** – szybki formularz eksponuje tytuł, rodzaj prywatne/firmowe, wykonawcę, termin i priorytet, a opis, widoczność, udostępnianie oraz cykliczność rozwija się na żądanie. Autor może później zmienić rodzaj w szczegółach zadania.
10. **Centrum powiadomień**.
11. **Notatki** – prywatne karty z tytułem, treścią, kolorem i edycją.
12. **Moje ustawienia** – profil, Google, Telegram, push, preferencje i harmonogramy notatek.
13. **Administracja** – użytkownicy, konfiguracja i kondycja integracji.

Na urządzeniach mobilnych kluczowe akcje „Dodaj”, „Zrobione” i „Przesuń” muszą być dostępne bez rozwijania wielopoziomowych menu. Dolny pasek zawiera `Dzisiaj`, `Zadania`, centralne `Dodaj`, `Powiadomienia` i `Więcej`. Etykiety `Dzisiaj`, `Zadania` oraz pozycji w menu `Więcej` pokazują w nawiasach liczbę elementów, a na komputerze analogiczne liczniki są widoczne przy wszystkich pozycjach zadań i notatek w panelu bocznym. Licznik korzysta z tego samego filtra dostępu i statusu co ekran docelowy, uwzględnia zero i po wejściu odpowiada liczbie widocznych wierszy.

Zadanie przypisane odbiorcy oraz zadanie jedynie mu udostępnione są widoczne w jego głównych listach. Ponieważ delegowanie zmienia wykonawcę, a udostępnienie tylko rozszerza dostęp, wiersz otrzymanego zadania pokazuje autora z jego awatarem. Odbiorca samego udostępnienia może otworzyć szczegóły i komentować, ale lista nie proponuje mu zakończenia ani zmiany terminu; te operacje pozostają dostępne autorowi i wykonawcy.

Podział firmowe/prywatne nie nadaje ani nie odbiera dostępu. Zadanie firmowe może pozostać widoczne tylko dla autora i wykonawcy, a zadanie prywatne może zostać świadomie udostępnione konkretnej osobie. To pole służy klasyfikacji i prezentacji, natomiast `visibility` nadal steruje uprawnieniami.

## 4. Model uprawnień

| Operacja | Właściciel biznesowy | Administrator aplikacji | Użytkownik firmowy | Użytkownik zewnętrzny |
|---|---:|---:|---:|---:|
| własne ustawienia i integracje | tak | tak | tak | tak |
| konfiguracja globalna | nie | tak | nie | nie |
| zarządzanie użytkownikami technicznie | ograniczone | tak | nie | nie |
| zarządzanie zespołami biznesowymi | tak | opcjonalnie | nie | nie |
| zadania firmowe | tak | jak zwykły członek | tak | nie |
| zadania bezpośrednio udostępnione | tak | tak | tak | tak |
| cudze zadania prywatne | nie | nie | nie | nie |

Rola techniczna i dostęp do treści są rozdzielone. Mateusz może administrować systemem, a jednocześnie działać jako zwykły użytkownik firmowy.

## 5. Model danych

Minimalne encje:

- `User` – konto, profil, strefa i stan,
- `Role` oraz `UserRole` – role techniczne i biznesowe,
- `Team` oraz `TeamMember` – struktura firmy i grup współdzielenia,
- `Task` – treść, stan, autor, wykonawca, termin i widoczność,
- `TaskShare` – jawne udostępnienia osobom/grupom,
- `TaskComment` – informacja zwrotna,
- `TaskRecurrence` – reguła i następne wystąpienie,
- `TaskDueDateHistory` – historia zmian terminu,
- `Reminder` – logiczny punkt harmonogramu,
- `NotificationDelivery` – wysyłka przez konkretny kanał,
- `Notification` – wpis w centrum powiadomień,
- `PushSubscription` – urządzenie/przeglądarka,
- `GoogleConnection` i `CalendarEventLink`,
- `TelegramConnection`,
- `Note` oraz `NoteReminderSchedule`,
- `AuditEvent` – niezmienialny dziennik operacji.

Wszystkie rekordy biznesowe otrzymują stabilne identyfikatory, znaczniki czasu i mechanizm wersjonowania do ochrony przed równoczesną edycją.

## 6. Kryteria sukcesu pilotażu

MVP można uznać za użyteczne, jeśli podczas dwutygodniowego pilotażu:

- co najmniej 95% zaplanowanych alertów aplikacji zostanie wysłanych w ciągu 2 minut od planowanego czasu,
- żadne ponowienie procesu nie spowoduje podwójnego alertu,
- utworzenie głosowe typowego zadania zajmie mniej niż 30 sekund wraz z potwierdzeniem,
- zmiana terminu zaktualizuje panel, alerty i kalendarz bez ręcznej interwencji,
- Nadia nie zobaczy żadnego zadania firmowego, którego jej nie udostępniono,
- administrator nie zobaczy treści cudzych zadań prywatnych,
- każde delegowane zadanie będzie miało jednoznacznego wykonawcę i historię zmian.

## 7. Poza zakresem pierwszego MVP

- zaawansowane raporty produktywności,
- natywne aplikacje iOS i Android,
- wiele niezależnych firm/organizacji,
- wieloetapowe procesy akceptacji,
- zależności i podzadania o dowolnej głębokości,
- rozliczanie czasu,
- pełny komunikator zastępujący Telegram,
- automatyczne wykonywanie ryzykownych lub niejednoznacznych poleceń.
