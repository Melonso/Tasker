# API integracyjne Taskera

Warstwa integracyjna służy do połączenia z n8n bez udostępniania bazy danych. Jej publiczny adres bazowy to `https://tasker.dpkomis.pl/api/integrations`.

## Uwierzytelnianie

Każde żądanie wymaga nagłówka:

```http
Authorization: Bearer <N8N_SERVICE_SECRET>
```

Sekret ma co najmniej 32 znaki, jest przechowywany wyłącznie w chronionych zmiennych środowiskowych Taskera oraz credentials n8n i nie trafia do workflow, logów ani repozytorium. Brak konfiguracji powoduje bezpieczną odmowę wszystkich żądań.

## Kontrola gotowości

```http
GET /api/integrations/health
```

Zwraca wersję kontraktu i listę dostępnych możliwości. Kontrakt `6` obejmuje możliwości kontraktu `5` oraz `TASK_SCOPE_PRIVATE_COMPANY`: niezależny od widoczności rodzaj zadania, rozpoznawanie firmowe/prywatne i odpowiednie grupowanie list.

## Połączenie Telegrama

Zalogowany użytkownik generuje w „Moich ustawieniach” ośmioznakowy kod ważny 10 minut. Workflow obsługujący `/start KOD` wywołuje:

```http
POST /api/integrations/telegram/link
Content-Type: application/json

{
  "code": "ABCD2345",
  "telegramUserId": "123456789",
  "chatId": "123456789"
}
```

Kod jest przechowywany wyłącznie jako hash, działa raz i nie może przejąć Telegrama już przypisanego do innego konta.

## Notatki z Telegrama

```http
POST /api/integrations/notes
Content-Type: application/json

{
  "telegramUserId": "123456789",
  "sourceEventId": "telegram-update-98771",
  "content": "Pomysł na nową kampanię i lista materiałów do przygotowania",
  "title": "Pomysł na kampanię"
}
```

`title` jest opcjonalny. Bez niego Tasker tworzy krótki tytuł z początku treści. Połączenie Telegrama wskazuje właściciela, dlatego notatka pozostaje prywatna i nie jest zadaniem, nie ma wykonawcy, terminu ani szkicu do zatwierdzenia. `sourceEventId` jest unikalny, więc ponowione wykonanie n8n zwraca tę samą notatkę zamiast tworzyć duplikat.

Odpowiedź `201` dla nowego rekordu albo `200` dla ponowienia ma postać:

```json
{
  "kind": "NOTE_CREATED",
  "created": true,
  "note": {
    "id": "<uuid>",
    "title": "Pomysł na kampanię",
    "url": "/notes#note-<uuid>"
  }
}
```

Workflow kieruje do tego endpointu `/notatka TREŚĆ` oraz deterministycznie rozpoznane zwroty „dodaj do notatek TREŚĆ”, „zapisz w notatkach TREŚĆ” i „zapisz notatkę TREŚĆ”. Ta sama reguła działa po transkrypcji wiadomości głosowej i omija interpretację zadaniową modelu AI.

## Polecenia z Telegrama

```http
POST /api/integrations/commands/drafts
Content-Type: application/json

{
  "telegramUserId": "123456789",
  "sourceEventId": "telegram-update-98765",
  "intent": "CREATE_TASK",
  "title": "Wysłać materiały do strony",
  "description": "Materiały do nowej wersji strony",
  "assignee": "Michał Murawski",
  "shareWith": "Paweł Kurek",
  "dueDate": "2026-08-29",
  "dueTime": "15:00",
  "taskScope": "COMPANY",
  "visibility": "COMPANY",
  "priority": "NORMAL"
}
```

`sourceEventId` zapewnia idempotencję ponowionych aktualizacji Telegrama. `taskScope` przyjmuje `PRIVATE` albo `COMPANY` i określa sekcję zadania niezależnie od dostępu; brak pola zachowuje kompatybilny domyślny rodzaj `PRIVATE`. API dodatkowo rozpoznaje jawne słowa „firmowe” i „prywatne” w `sourceText`, więc polecenia `dodaj zadanie firmowe…` i `dodaj zadanie prywatne…` nie zależą wyłącznie od wyniku modelu AI. `assignee` oznacza wyłącznie głównego wykonawcę, natomiast opcjonalne `shareWith` oznacza osobę otrzymującą dostęp bez zmiany wykonawcy. Podanie `shareWith` wymusza widoczność `SHARED`, ale nie zmienia `taskScope`; zatwierdzenie tworzy zadanie i wpis `task_shares` w jednej transakcji. Tasker sam rozpoznaje obie osoby wśród użytkowników dostępnych autorowi. Brak lub niejednoznaczna osoba zwraca stan `NEEDS_CLARIFICATION`. Szkic wygasa po 30 minutach.

Szkic z `visibility: SHARED` bez `shareWith` nigdy nie otrzymuje stanu `DRAFT`: API prosi o wskazanie odbiorcy, dzięki czemu taki szkic nie może zostać zatwierdzony ręcznie ani automatycznie. Podgląd kompletnego szkicu pokazuje oddzielnie wykonawcę oraz osobę otrzymującą dostęp.

Ten sam endpoint obsługuje także bezpieczne operacje na istniejących zadaniach:

```json
{ "telegramUserId": "123456789", "sourceEventId": "telegram-update-98766", "intent": "COMPLETE_TASK", "taskQuery": "wysłać raport" }
```

```json
{ "telegramUserId": "123456789", "sourceEventId": "telegram-update-98767", "intent": "RESCHEDULE_TASK", "taskQuery": "wysłać raport", "dueDate": "2026-09-01", "dueTime": "09:00" }
```

Udostępnienie zachowuje obecnego wykonawcę i dodaje wskazanej osobie dostęp. Przekazanie zmienia jedynego głównego wykonawcę:

```json
{ "telegramUserId": "123456789", "sourceEventId": "telegram-update-98769", "intent": "SHARE_TASK", "taskQuery": "polcard", "assignee": "Michał Murawski" }
```

```json
{ "telegramUserId": "123456789", "sourceEventId": "telegram-update-98770", "intent": "REASSIGN_TASK", "taskQuery": "polcard", "assignee": "Michał Murawski" }
```

Obie operacje może wykonać wyłącznie autor aktywnego zadania i obie zawsze wymagają ręcznego zatwierdzenia. `SHARE_TASK` ustawia widoczność `SHARED`, zachowuje wykonawcę i tworzy bezpośrednie udostępnienie. `REASSIGN_TASK` zmienia wykonawcę, czyści jego osobiste przypięcie do planu dnia, przebudowuje przypomnienia według strefy i preferencji nowego wykonawcy oraz pozwala workerowi Google Calendar usunąć stare i utworzyć nowe powiązanie przy kolejnym przebiegu synchronizacji. Po zatwierdzeniu wskazana osoba otrzymuje powiadomienie w aplikacji oraz, jeśli kanał jest włączony i połączony, przez Web Push i Telegram. Ta sama zasada działa przy utworzeniu zadania z innym wykonawcą albo `shareWith`.

`taskQuery` nie musi być dokładnym tytułem. Tasker pobiera wszystkie aktywne zadania, których połączony użytkownik jest autorem lub wykonawcą, i ocenia podobieństwo do podanego fragmentu. Dopasowanie ignoruje wielkość liter, polskie znaki, interpunkcję oraz typowe elementy adresów internetowych, a także toleruje odmiany, prefiksy słów i drobne literówki. Przykładowo `wysłać stronę helpyou` dopasuje zadanie `Wysłać stronę www.helpyouprawo.pl panu Pawłowi`.

Jeżeli dwa tytuły są podobnie prawdopodobne, Tasker nie wykonuje operacji na chybił-trafił. Zwraca `NEEDS_CLARIFICATION` z najbliższymi tytułami i prosi o bardziej charakterystyczny fragment. Zakończenie, przesunięcie, udostępnienie i przekazanie rozpoznanego zadania wymagają ręcznego zatwierdzenia.

Listy `LIST_TODAY`, `LIST_TOMORROW` i `LIST_OVERDUE` zwracają od razu `kind: SUMMARY` i maksymalnie 20 zadań:

```json
{ "telegramUserId": "123456789", "sourceEventId": "telegram-update-98768", "intent": "LIST_TOMORROW" }
```

`LIST_ALL` zwraca aktywne zadania w grupach `current`, `waiting`, `delegated` i `recurring`, zgodnie z uprawnieniami oraz widokami panelu. Każdy wiersz zawiera `taskScope`, `author` oraz `assignee`. Jedno zadanie może wystąpić w kilku grupach, tak samo jak w aplikacji. Workflow buduje najpierw wiadomości „Zadania firmowe” i „Zadania prywatne”, wewnątrz zachowuje kategorie statusów, a przy każdym zadaniu dopisuje autora. Długie zestawienie jest dzielone poniżej bezpiecznego limitu Telegrama. Utworzenie, zakończenie i przesunięcie zwracają `kind: DRAFT`.

## Wiadomości głosowe

Workflow rozpoznaje pole `message.voice.file_id`, pobiera plik z Telegrama i przekazuje jego binarną zawartość do węzła OpenAI `Transcribe a recording` z językiem polskim. Wynik transkrypcji trafia następnie do dokładnie tej samej ścieżki interpretacji, walidacji i szkicu co wiadomość tekstowa. Tasker nie zapisuje oryginalnego nagrania ani transkrypcji w swojej bazie; techniczna retencja danych wykonania po stronie n8n podlega konfiguracji instancji n8n.

Naturalne prośby o listę, np. „Pokaż moje zadania na jutro”, są rozpoznawane deterministycznie po transkrypcji i kierowane bezpośrednio do odpowiedniej operacji `LIST_*`. Dzięki temu nie mogą zostać omyłkowo potraktowane jako polecenie utworzenia zadania. Reguła działa identycznie dla tekstu i głosu; model AI pozostaje używany do bardziej swobodnych poleceń zmieniających zadania.

## Dostawa przypomnień Telegram

Workflow `Tasker — przypomnienia Telegram` pobiera gotowe komunikaty przez:

```http
POST /api/integrations/notifications/telegram/claim
Content-Type: application/json

{ "limit": 20 }
```

Pole `text` zawiera nagłówek przypomnienia, tytuł i termin zadania, autora, opcjonalną listę bezpośrednich udostępnień użytkownikom i zespołom oraz odnośnik do zadania. Przykładowa treść:

```text
🔔 Zadanie po terminie

Oddzwonić do klienta · termin 01.09.2026, 15:00
Autor: Nadia Kowalska
Udostępnione: Michał Murawski, zespół Sprzedaż

https://tasker.dpkomis.pl/tasks/<taskId>
```

Autor jest obecny zawsze. Wiersz `Udostępnione` jest pomijany, gdy zadanie nie ma bezpośrednich udostępnień. Ta sama treść bez otaczającego formatu Telegrama jest zapisywana w centrum powiadomień i wysyłana przez Web Push. Workflow n8n przekazuje `text` bez modyfikowania, dlatego zmiana treści nie wymaga aktualizacji aktywnego workflow ani nowej szybkiej komendy bota.

Ten sam endpoint dostarcza również przypomnienia porządkowe modułu Notatki. Mają treść `Pamiętaj, aby uporządkować swoje notatki.` i adres `https://tasker.dpkomis.pl/notes`; nie zawierają `taskId`. Pole `targetUrl` jest wspólnym celem linku, a dotychczasowe `taskUrl` pozostaje obsługiwane dla zgodności.

Endpoint dostarcza także zdarzenia o nowym dostępie do zadania. Nowy wykonawca otrzymuje nagłówek `Nowe zadanie dla Ciebie`, a bezpośrednio wskazany odbiorca udostępnienia `Udostępniono Ci zadanie`; treść podaje tytuł i autora, a link prowadzi do szczegółów zadania. Rekord w centrum powiadomień powstaje zawsze. Dostawy Telegram i Web Push mają stan `PENDING` wyłącznie wtedy, gdy odbiorca ma odpowiednio połączone konto/subskrypcję i nie wyłączył kanału; w pozostałych przypadkach są oznaczane jako `SKIPPED`. Istniejący workflow `Tasker — przypomnienia Telegram` obsługuje te komunikaty bez zmian kontraktu i bez nowej komendy bota.

## Potwierdzenie szkicu

```http
POST /api/integrations/commands/drafts/<draftId>/confirm
Content-Type: application/json

{
  "telegramUserId": "123456789"
}
```

Tasker ponownie sprawdza właściciela szkicu i uprawnienia. Dopiero to wywołanie tworzy zadanie, audyt oraz harmonogram przypomnień. Ponowne potwierdzenie zakończonego szkicu zwraca ten sam identyfikator zadania.

## Anulowanie szkicu

```http
POST /api/integrations/commands/drafts/<draftId>/cancel
Content-Type: application/json

{
  "telegramUserId": "123456789"
}
```

Anulowanie jest idempotentne i nie tworzy zadania. Potwierdzonego lub aktualnie przetwarzanego szkicu nie można anulować.

## Zasady dla workflow AI

- Model przygotowuje dane, ale nie otrzymuje dostępu do bazy.
- Przy zakończeniu i przesunięciu model przekazuje jedynie charakterystyczne słowa w `taskQuery`; pełną listę dozwolonych aktywnych zadań pobiera i dopasowuje dopiero Tasker po uwierzytelnieniu użytkownika.
- Kompletny szkic można zatwierdzić lub anulować ręcznie. Brak reakcji powoduje automatyczne zatwierdzenie po 10 minutach tylko przy tworzeniu zadania. Zakończenie i przesunięcie terminu zawsze wymagają ręcznego potwierdzenia.
- Identyfikatory Telegrama są mapowane na aktywne konto Taskera.
- Tasker ponownie waliduje wykonawcę, widoczność i role.
- Tasker ponownie rozpoznaje jawny rodzaj firmowy/prywatny z tekstu źródłowego i przechowuje go niezależnie od widoczności.
- n8n nie powinien logować nagłówka `Authorization` ani treści prywatnych zadań.

## Menu komend bota

Workflow mapuje komendy bez udziału modelu AI:

- `/dzisiaj` — lista zadań na dziś,
- `/jutro` — lista zadań z terminem na jutro,
- `/zalegle` — lista zadań po terminie,
- `/zadania` — pełne zestawienie rozdzielone na firmowe i prywatne, a następnie na Bieżące, Oczekujące, Delegowane i Cykliczne; każdy wiersz podaje autora,
- `/notatka TREŚĆ` — natychmiast zapisz prywatną notatkę i zwróć odnośnik do niej,
- `/dodaj` — kompletna instrukcja tworzenia zadania tekstem lub głosem: rodzaj firmowe/prywatne, tytuł, wykonawca, odrębny odbiorca udostępnienia, termin, godzina, priorytet, widoczność oraz zasady ręcznego i automatycznego zatwierdzania,
- `/pomoc` — przegląd skrótów, notatek, ustawień i operacji na istniejących zadaniach; odsyła do `/dodaj` i nie powtarza instrukcji tworzenia.

Te same listy można wywołać naturalnym zdaniem tekstowym albo głosowym zawierającym prośbę o pokazanie zadań i zakres: dziś, jutro, zaległe albo wszystkie/kategorie.

Udostępnianie i przekazywanie pozostają poleceniami naturalnymi, ponieważ zawsze wymagają nazwy osoby i fragmentu tytułu; osobna szybka komenda nie skróciłaby tego przepływu. Przykłady: `dodaj Michała do zadania z Polcardem` oraz `przekaż zadanie z Polcardem Michałowi`.

Jedno polecenie może określić rodzaj oraz od razu udostępnić zadanie, np. `dodaj zadanie firmowe sprawdzić faktury za godzinę i udostępnij je Michałowi`. Model zwraca wtedy `CREATE_TASK`, `taskScope: COMPANY`, autora jako wykonawcę oraz Michała w `shareWith`; nie próbuje wykonywać sekwencji dwóch niezależnych szkiców.

Rodzaj domyślny to zawsze `PRIVATE`; `COMPANY` wymaga jawnego słowa „firmowe” lub jego odmiany. Podgląd szkicu nie pokazuje użytkownikowi enumów kontraktu. Używa etykiet `Typ zadania: prywatny|firmowy`, `Priorytet: niski|normalny|wysoki|pilny` oraz `Dostęp: prywatny — autor i wykonawca|firmowy — użytkownicy firmowi|udostępniony wybranej osobie`. Wartości techniczne pozostają wyłącznie w payloadzie API.

Węzeł interpretujący polecenie używa modelu `gpt-5.4-mini` przez Responses API z `reasoningEffort: low`, limitem ponowień i timeoutem, ale bez parametru `temperature`, którego ten model nie obsługuje. Zmiana modelu wymaga kontrolnego wywołania z dokładnym zestawem parametrów aktywnego workflow.

Pusta albo bardzo krótka wiadomość (mniej niż 3 znaki, np. `?`) nie jest przekazywana do modelu z pamięcią rozmowy. Workflow pokazuje wtedy instrukcję, aby model nie powtarzał przypadkowo poprzedniej intencji.

Telegram w zwykłym trybie HTML nie obsługuje znacznika `<table>`. Workflow używa więc HTML do nagłówków i klikalnych tytułów, ale dane prezentuje w mobilnych sekcjach kategorii zamiast w szerokiej tabeli. To zachowuje czytelność na telefonie i mieści się w limicie wiadomości.

Wpis dla BotFathera (`/setcommands`):

```text
dzisiaj - Zadania na dziś
jutro - Zadania z terminem na jutro
zalegle - Zadania po terminie
zadania - Firmowe i prywatne z autorami
notatka - Zapisz prywatną notatkę
dodaj - Jak dodać zadanie tekstem lub głosem
pomoc - Pozostałe możliwości bota
```

Listę widoczną pod przyciskiem „Menu” ustawia właściciel bota przez `setMyCommands` albo `/setcommands` w BotFatherze. Polecenia nie zawierają polskich znaków, zgodnie z ograniczeniami Telegram Bot API.
