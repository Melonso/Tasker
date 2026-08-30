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

Zwraca wersję kontraktu i listę dostępnych możliwości. Kontrakt `2` dodaje listę na jutro oraz zestawienie aktywnych kategorii.

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
  "dueDate": "2026-08-29",
  "dueTime": "15:00",
  "visibility": "COMPANY",
  "priority": "NORMAL"
}
```

`sourceEventId` zapewnia idempotencję ponowionych aktualizacji Telegrama. Tasker sam rozpoznaje wykonawcę wśród osób dostępnych użytkownikowi. Brak lub niejednoznaczna osoba zwraca stan `NEEDS_CLARIFICATION`. Szkic wygasa po 30 minutach.

Ten sam endpoint obsługuje także bezpieczne operacje na istniejących zadaniach:

```json
{ "telegramUserId": "123456789", "sourceEventId": "telegram-update-98766", "intent": "COMPLETE_TASK", "taskQuery": "wysłać raport" }
```

```json
{ "telegramUserId": "123456789", "sourceEventId": "telegram-update-98767", "intent": "RESCHEDULE_TASK", "taskQuery": "wysłać raport", "dueDate": "2026-09-01", "dueTime": "09:00" }
```

`taskQuery` nie musi być dokładnym tytułem. Tasker pobiera wszystkie aktywne zadania, których połączony użytkownik jest autorem lub wykonawcą, i ocenia podobieństwo do podanego fragmentu. Dopasowanie ignoruje wielkość liter, polskie znaki, interpunkcję oraz typowe elementy adresów internetowych, a także toleruje odmiany, prefiksy słów i drobne literówki. Przykładowo `wysłać stronę helpyou` dopasuje zadanie `Wysłać stronę www.helpyouprawo.pl panu Pawłowi`.

Jeżeli dwa tytuły są podobnie prawdopodobne, Tasker nie wykonuje operacji na chybił-trafił. Zwraca `NEEDS_CLARIFICATION` z najbliższymi tytułami i prosi o bardziej charakterystyczny fragment. Zakończenie albo przesunięcie rozpoznanego zadania nadal wymaga ręcznego zatwierdzenia.

Listy `LIST_TODAY`, `LIST_TOMORROW` i `LIST_OVERDUE` zwracają od razu `kind: SUMMARY` i maksymalnie 20 zadań:

```json
{ "telegramUserId": "123456789", "sourceEventId": "telegram-update-98768", "intent": "LIST_TOMORROW" }
```

`LIST_ALL` zwraca aktywne zadania w grupach `current`, `waiting`, `delegated` i `recurring`, zgodnie z uprawnieniami oraz widokami panelu. Jedno zadanie może wystąpić w kilku grupach, tak samo jak w aplikacji. Workflow dzieli długie zestawienie na osobne wiadomości kategorii, aby nie przekroczyć limitu 4096 znaków Telegrama. Utworzenie, zakończenie i przesunięcie zwracają `kind: DRAFT`.

## Wiadomości głosowe

Workflow rozpoznaje pole `message.voice.file_id`, pobiera plik z Telegrama i przekazuje jego binarną zawartość do węzła OpenAI `Transcribe a recording` z językiem polskim. Wynik transkrypcji trafia następnie do dokładnie tej samej ścieżki interpretacji, walidacji i szkicu co wiadomość tekstowa. Tasker nie zapisuje oryginalnego nagrania ani transkrypcji w swojej bazie; techniczna retencja danych wykonania po stronie n8n podlega konfiguracji instancji n8n.

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
- n8n nie powinien logować nagłówka `Authorization` ani treści prywatnych zadań.

## Menu komend bota

Workflow mapuje komendy bez udziału modelu AI:

- `/dzisiaj` — lista zadań na dziś,
- `/jutro` — lista zadań z terminem na jutro,
- `/zalegle` — lista zadań po terminie,
- `/zadania` — pełne zestawienie Bieżących, Oczekujących, Delegowanych i Cyklicznych; długie kategorie są dzielone na kolejne wiadomości,
- `/dodaj` — instrukcja dodawania zadania tekstem lub głosem,
- `/pomoc` — pełna skrócona instrukcja i odnośnik do ustawień.

Telegram w zwykłym trybie HTML nie obsługuje znacznika `<table>`. Workflow używa więc HTML do nagłówków i klikalnych tytułów, ale dane prezentuje w mobilnych sekcjach kategorii zamiast w szerokiej tabeli. To zachowuje czytelność na telefonie i mieści się w limicie wiadomości.

Wpis dla BotFathera (`/setcommands`):

```text
dzisiaj - Zadania na dziś
jutro - Zadania z terminem na jutro
zalegle - Zadania po terminie
zadania - Wszystkie aktywne kategorie
dodaj - Jak dodać zadanie tekstem lub głosem
pomoc - Instrukcja i możliwości bota
```

Listę widoczną pod przyciskiem „Menu” ustawia właściciel bota przez `setMyCommands` albo `/setcommands` w BotFatherze. Polecenia nie zawierają polskich znaków, zgodnie z ograniczeniami Telegram Bot API.
