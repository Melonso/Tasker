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

Zwraca wersję kontraktu i listę dostępnych możliwości.

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

Listy `LIST_TODAY` i `LIST_OVERDUE` zwracają od razu `kind: SUMMARY` i maksymalnie 20 zadań. Utworzenie, zakończenie i przesunięcie zwracają `kind: DRAFT`.

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
- Kompletny szkic można zatwierdzić lub anulować ręcznie. Brak reakcji powoduje automatyczne zatwierdzenie po 10 minutach tylko przy tworzeniu zadania. Zakończenie i przesunięcie terminu zawsze wymagają ręcznego potwierdzenia.
- Identyfikatory Telegrama są mapowane na aktywne konto Taskera.
- Tasker ponownie waliduje wykonawcę, widoczność i role.
- n8n nie powinien logować nagłówka `Authorization` ani treści prywatnych zadań.

## Menu komend bota

Workflow mapuje komendy bez udziału modelu AI:

- `/dzisiaj` — lista zadań na dziś,
- `/zalegle` — lista zadań po terminie,
- `/dodaj` — instrukcja dodawania zadania tekstem lub głosem,
- `/pomoc` — pełna skrócona instrukcja i odnośnik do ustawień.

Listę widoczną pod przyciskiem „Menu” ustawia właściciel bota przez `setMyCommands` albo `/setcommands` w BotFatherze. Polecenia nie zawierają polskich znaków, zgodnie z ograniczeniami Telegram Bot API.
