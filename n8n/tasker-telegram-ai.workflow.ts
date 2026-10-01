import {
  expr,
  ifElse,
  languageModel,
  memory,
  newCredential,
  node,
  nodeJson,
  outputParser,
  switchCase,
  trigger,
  workflow,
} from "@n8n/workflow-sdk";

const telegramTrigger = trigger({
  type: "n8n-nodes-base.telegramTrigger",
  version: 1.5,
  config: {
    name: "Odbierz wiadomość z Telegrama",
    parameters: { updates: ["message", "callback_query"] },
    credentials: { telegramApi: newCredential("Tasker Telegram Bot") },
  },
  output: [
    {
      update_id: 123456,
      message: {
        message_id: 10,
        from: { id: 123456789 },
        chat: { id: 123456789 },
        text: "Dodaj zadanie dla Michała: oddzwonić jutro o 15:00",
      },
    },
  ],
});

const isVoiceMessage = ifElse({
  version: 2.3,
  config: {
    name: "Czy to wiadomość głosowa?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{
          leftValue: expr("{{ $json.message?.voice?.file_id }}"),
          rightValue: "",
          operator: { type: "string", operation: "exists", singleValue: true },
        }],
        combinator: "and",
      },
    },
  },
});

const downloadVoiceMessage = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Pobierz wiadomość głosową",
    parameters: {
      resource: "file",
      fileId: expr("{{ $json.message.voice.file_id }}"),
      additionalFields: {},
    },
    credentials: { telegramApi: newCredential("Tasker Telegram Bot") },
  },
  output: [{ file_id: "voice-file-id", file_path: "voice/file_1.oga" }],
});

const transcribeVoiceMessage = node({
  type: "@n8n/n8n-nodes-langchain.openAi",
  version: 1.8,
  config: {
    name: "Transkrybuj wiadomość głosową",
    parameters: {
      resource: "audio",
      operation: "transcribe",
      options: { language: "pl", prompt: "Polecenie dotyczące zadań lub notatek w języku polskim." },
    },
    credentials: { openAiApi: newCredential("Tasker OpenAI") },
  },
  output: [{ text: "Dodaj zadanie oddzwonić jutro o 15:00" }],
});

const normalizeUpdate = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Rozpoznaj rodzaj polecenia",
    parameters: {
      mode: "runOnceForEachItem",
      language: "javaScript",
      jsCode:
        "const update = $(\"Odbierz wiadomość z Telegrama\").item.json;\n" +
        "const callback = update.callback_query || null;\n" +
        "const message = callback?.message || update.message || null;\n" +
        "let text = String($json.text || message?.text || '').trim();\n" +
        "let directIntent = '';\n" +
        "if (/^\\/dzisiaj(?:@\\w+)?$/i.test(text)) directIntent = 'LIST_TODAY';\n" +
        "else if (/^\\/jutro(?:@\\w+)?$/i.test(text)) directIntent = 'LIST_TOMORROW';\n" +
        "else if (/^\\/zalegle(?:@\\w+)?$/i.test(text)) directIntent = 'LIST_OVERDUE';\n" +
        "else if (/^\\/zadania(?:@\\w+)?$/i.test(text)) directIntent = 'LIST_ALL';\n" +
        "else {\n" +
        "  const normalizedText = text.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');\n" +
        "  const asksForTasks = /\\b(pokaz|wyswietl|wypisz|sprawdz|jakie|lista|zestawienie)\\b/.test(normalizedText) && /\\bzadan(?:ia|ie|iach)?\\b/.test(normalizedText);\n" +
        "  if (asksForTasks && /\\b(?:jutro|na jutro)\\b/.test(normalizedText)) directIntent = 'LIST_TOMORROW';\n" +
        "  else if (asksForTasks && /\\b(?:dzis(?:iaj)?|na dzis)\\b/.test(normalizedText)) directIntent = 'LIST_TODAY';\n" +
        "  else if (asksForTasks && /(?:\\bzalegl(?:e|ych|ymi)?\\b|po terminie)/.test(normalizedText)) directIntent = 'LIST_OVERDUE';\n" +
        "  else if (asksForTasks && /(?:\\bwszystk(?:ie|ich|imi)?\\b|\\bkategori(?:e|ach)\\b)/.test(normalizedText)) directIntent = 'LIST_ALL';\n" +
        "}\n" +
        "const scopeText = text.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ');\n" +
        "const hasCompanyScope = /(?:^|\\s)firmow(?:e|a|y|ego|ej|emu|ym|ych)(?:\\s|$)/.test(scopeText);\n" +
        "const hasPrivateScope = /(?:^|\\s)prywatn(?:e|a|y|ego|ej|emu|ym|ych)(?:\\s|$)/.test(scopeText);\n" +
        "const explicitTaskScope = hasCompanyScope && !hasPrivateScope ? 'COMPANY' : (hasPrivateScope && !hasCompanyScope ? 'PRIVATE' : '');\n" +
        "const noteCommand = text.match(/^\\/notatka(?:@\\w+)?(?:\\s+([\\s\\S]+))?$/i);\n" +
        "const noteNatural = text.match(/^(?:dodaj|zapisz)(?:\\s+mi)?\\s+(?:do\\s+notatek|w\\s+notatkach|notatk[ęe])\\s*[,;:\\-]?\\s*([\\s\\S]+)$/i);\n" +
        "const noteContent = String(noteCommand?.[1] || noteNatural?.[1] || '').trim();\n" +
        "const callbackData = String(callback?.data || '');\n" +
        "let route = 'create';\n" +
        "let draftId = '';\n" +
        "let linkCode = '';\n" +
        "if (callbackData.startsWith('tasker_confirm:')) { route = 'confirm'; draftId = callbackData.slice(15); }\n" +
        "else if (callbackData.startsWith('tasker_cancel:')) { route = 'cancel'; draftId = callbackData.slice(14); }\n" +
        "else {\n" +
        "  const link = text.match(/^\\/(?:start|polacz)\\s+([A-Z0-9]{6,20})$/i);\n" +
        "  if (link) { route = 'link'; linkCode = link[1].toUpperCase(); }\n" +
        "  else if (noteContent) route = 'note';\n" +
        "  else if (directIntent) route = 'list';\n" +
        "  else if (/^\\/dodaj(?:@\\w+)?$/i.test(text)) route = 'add_help';\n" +
        "  else if (!text || text.length < 3 || /^\\/(?:start|pomoc|help|notatka)(?:@\\w+)?$/i.test(text)) route = 'help';\n" +
        "}\n" +
        "return { json: { route, text, directIntent, explicitTaskScope, noteContent, draftId, linkCode, telegramUserId: String(callback?.from?.id || message?.from?.id || ''), chatId: String(message?.chat?.id || ''), callbackQueryId: String(callback?.id || ''), sourceEventId: 'telegram-update-' + String(update.update_id || '') } };",
    },
  },
  output: [
    {
      route: "create",
      text: "Dodaj zadanie dla Michała: oddzwonić jutro o 15:00",
      directIntent: "",
      noteContent: "",
      draftId: "",
      linkCode: "",
      telegramUserId: "123456789",
      chatId: "123456789",
      callbackQueryId: "",
      sourceEventId: "telegram-update-123456",
    },
  ],
});

const routeCommand = switchCase({
  version: 3.4,
  config: {
    name: "Wybierz operację",
    parameters: {
      mode: "expression",
      numberOutputs: 8,
      output: expr("{{ ({ link: 0, confirm: 1, cancel: 2, create: 3, help: 4, list: 5, note: 6, add_help: 7 })[$json.route] ?? 4 }}"),
    },
  },
});

const linkAccount = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Połącz konto z Taskerem",
    parameters: {
      method: "POST",
      url: "https://tasker.dpkomis.pl/api/integrations/telegram/link",
      authentication: "genericCredentialType",
      genericAuthType: "httpBearerAuth",
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        '{{ { code: $("Rozpoznaj rodzaj polecenia").item.json.linkCode, telegramUserId: $("Rozpoznaj rodzaj polecenia").item.json.telegramUserId, chatId: $("Rozpoznaj rodzaj polecenia").item.json.chatId } }}',
      ),
      options: { response: { response: { fullResponse: true, neverError: true, responseFormat: "json" } } },
    },
    credentials: { httpBearerAuth: { id: "vtvrzLWu4B9S4lTr", name: "Tasker API" } },
  },
  output: [{ body: { linked: true, user: { name: "Mateusz Meloch" } }, statusCode: 200 }],
});

const linkReply = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Potwierdź połączenie konta",
    parameters: {
      resource: "message",
      operation: "sendMessage",
      chatId: expr('{{ $("Rozpoznaj rodzaj polecenia").item.json.chatId }}'),
      text: expr(
        '{{ $json.statusCode >= 200 && $json.statusCode < 300 ? "✅ Konto połączone. Możesz już wpisywać zadania zwykłym językiem." : ($json.body?.error === "INVALID_OR_EXPIRED_CODE" ? "❌ Kod jest nieprawidłowy albo wygasł. Wygeneruj nowy w ustawieniach Taskera." : "❌ Nie udało się połączyć konta: " + ($json.body?.error ?? "nieznany błąd")) }}',
      ),
      additionalFields: { appendAttribution: false, disable_web_page_preview: true },
    },
    credentials: { telegramApi: newCredential("Tasker Telegram Bot") },
  },
  output: [{ ok: true, result: { message_id: 11 } }],
});

const acknowledgeConfirm = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Przyjmij potwierdzenie",
    parameters: {
      resource: "callback",
      operation: "answerQuery",
      queryId: expr("{{ $json.callbackQueryId }}"),
      additionalFields: { text: "Wykonuję polecenie…", cache_time: 0, show_alert: false },
    },
    credentials: { telegramApi: newCredential("Tasker Telegram Bot") },
  },
  output: [{ ok: true, result: true }],
});

const confirmDraft = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Zatwierdź szkic w Taskerze",
    parameters: {
      method: "POST",
      url: expr(
        'https://tasker.dpkomis.pl/api/integrations/commands/drafts/{{ $("Rozpoznaj rodzaj polecenia").item.json.draftId }}/confirm',
      ),
      authentication: "genericCredentialType",
      genericAuthType: "httpBearerAuth",
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        '{{ { telegramUserId: $("Rozpoznaj rodzaj polecenia").item.json.telegramUserId } }}',
      ),
      options: { response: { response: { fullResponse: true, neverError: true, responseFormat: "json" } } },
    },
    credentials: { httpBearerAuth: { id: "vtvrzLWu4B9S4lTr", name: "Tasker API" } },
  },
  output: [{ body: { status: "CONFIRMED", taskId: "00000000-0000-0000-0000-000000000000" }, statusCode: 200 }],
});

const confirmReply = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Wyślij wynik zatwierdzenia",
    parameters: {
      resource: "message",
      operation: "sendMessage",
      chatId: expr('{{ $("Rozpoznaj rodzaj polecenia").item.json.chatId }}'),
      text: expr(
        '{{ $json.statusCode >= 200 && $json.statusCode < 300 ? ({ COMPLETE_TASK: "✅ Zadanie zostało oznaczone jako zrobione.", RESCHEDULE_TASK: "✅ Termin zadania został przesunięty.", SHARE_TASK: "✅ Zadanie zostało udostępnione.", REASSIGN_TASK: "✅ Zadanie zostało przekazane nowemu wykonawcy." }[$json.body?.preview?.intent] ?? "✅ Zadanie zostało utworzone w Taskerze.") : "❌ Nie udało się wykonać polecenia: " + ($json.body?.message ?? $json.body?.error ?? "nieznany błąd") }}',
      ),
      additionalFields: { appendAttribution: false, disable_web_page_preview: true },
    },
    credentials: { telegramApi: newCredential("Tasker Telegram Bot") },
  },
  output: [{ ok: true, result: { message_id: 12 } }],
});

const acknowledgeCancel = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Przyjmij anulowanie",
    parameters: {
      resource: "callback",
      operation: "answerQuery",
      queryId: expr("{{ $json.callbackQueryId }}"),
      additionalFields: { text: "Anuluję szkic…", cache_time: 0, show_alert: false },
    },
    credentials: { telegramApi: newCredential("Tasker Telegram Bot") },
  },
  output: [{ ok: true, result: true }],
});

const cancelDraft = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Anuluj szkic w Taskerze",
    parameters: {
      method: "POST",
      url: expr(
        'https://tasker.dpkomis.pl/api/integrations/commands/drafts/{{ $("Rozpoznaj rodzaj polecenia").item.json.draftId }}/cancel',
      ),
      authentication: "genericCredentialType",
      genericAuthType: "httpBearerAuth",
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        '{{ { telegramUserId: $("Rozpoznaj rodzaj polecenia").item.json.telegramUserId } }}',
      ),
      options: { response: { response: { fullResponse: true, neverError: true, responseFormat: "json" } } },
    },
    credentials: { httpBearerAuth: { id: "vtvrzLWu4B9S4lTr", name: "Tasker API" } },
  },
  output: [{ body: { status: "CANCELED" }, statusCode: 200 }],
});

const cancelReply = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Wyślij wynik anulowania",
    parameters: {
      resource: "message",
      operation: "sendMessage",
      chatId: expr('{{ $("Rozpoznaj rodzaj polecenia").item.json.chatId }}'),
      text: expr(
        '{{ $json.statusCode >= 200 && $json.statusCode < 300 ? "🗑️ Szkic został anulowany. Zadanie nie powstało." : "❌ Nie udało się anulować szkicu: " + ($json.body?.error ?? "nieznany błąd") }}',
      ),
      additionalFields: { appendAttribution: false, disable_web_page_preview: true },
    },
    credentials: { telegramApi: newCredential("Tasker Telegram Bot") },
  },
  output: [{ ok: true, result: { message_id: 13 } }],
});

const taskModel = languageModel({
  type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
  version: 1.3,
  config: {
    name: "Model rozumiejący polecenie",
    parameters: {
      model: { __rl: true, mode: "list", value: "gpt-5.4-mini", cachedResultName: "gpt-5.4-mini" },
      responsesApiEnabled: true,
      options: { reasoningEffort: "low", maxRetries: 2, timeout: 60000 },
    },
    credentials: { openAiApi: newCredential("Tasker OpenAI") },
  },
});

const taskMemory = memory({
  type: "@n8n/n8n-nodes-langchain.memoryBufferWindow",
  version: 1.4,
  config: {
    name: "Pamięć rozmowy użytkownika",
    parameters: {
      sessionIdType: "customKey",
      sessionKey: nodeJson(normalizeUpdate, "chatId"),
      contextWindowLength: 6,
    },
  },
});

const taskParser = outputParser({
  type: "@n8n/n8n-nodes-langchain.outputParserStructured",
  version: 1.3,
  config: {
    name: "Struktura szkicu zadania",
    parameters: {
      schemaType: "manual",
      inputSchema: JSON.stringify({
        type: "object",
        additionalProperties: false,
        required: [
          "intent",
          "title",
          "taskQuery",
          "description",
          "assignee",
          "shareWith",
          "dueDate",
          "dueTime",
          "taskScope",
          "visibility",
          "priority",
        ],
        properties: {
          intent: { type: "string", enum: ["CREATE_TASK", "COMPLETE_TASK", "RESCHEDULE_TASK", "SHARE_TASK", "REASSIGN_TASK", "LIST_TODAY", "LIST_TOMORROW", "LIST_OVERDUE", "LIST_ALL"] },
          title: { type: "string", maxLength: 300 },
          taskQuery: { type: "string", maxLength: 300 },
          description: { type: "string", maxLength: 5000 },
          assignee: { type: "string", maxLength: 320 },
          shareWith: { type: "string", maxLength: 320 },
          dueDate: { type: "string", description: "YYYY-MM-DD albo pusty ciąg" },
          dueTime: { type: "string", description: "HH:mm albo pusty ciąg" },
          taskScope: { type: "string", enum: ["PRIVATE", "COMPANY"] },
          visibility: { type: "string", enum: ["PRIVATE", "COMPANY", "SHARED"] },
          priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"] },
        },
      }),
      autoFix: false,
    },
  },
});

const assignableUsers = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Pobierz wykonawców z Taskera",
    parameters: {
      method: "GET",
      url: "https://tasker.dpkomis.pl/api/integrations/users/assignable",
      authentication: "genericCredentialType",
      genericAuthType: "httpBearerAuth",
      sendQuery: true,
      queryParameters: {
        parameters: [
          {
            name: "telegramUserId",
            value: expr('{{ $("Rozpoznaj rodzaj polecenia").item.json.telegramUserId }}'),
          },
        ],
      },
      options: { response: { response: { fullResponse: true, neverError: true, responseFormat: "json" } } },
    },
    credentials: { httpBearerAuth: { id: "vtvrzLWu4B9S4lTr", name: "Tasker API" } },
  },
  output: [
    {
      body: {
        author: { name: "Mateusz Meloch" },
        users: [
          { name: "Mateusz Meloch" },
          { name: "Michał Murawski" },
          { name: "Nadia Kamieniecka-Nowak" },
          { name: "Paulina Grzankowska" },
          { name: "Paweł Kurek" },
        ],
      },
      statusCode: 200,
    },
  ],
});

const taskAgent = node({
  type: "@n8n/n8n-nodes-langchain.agent",
  version: 3.1,
  config: {
    name: "Zinterpretuj zadanie przez AI",
    parameters: {
      promptType: "define",
      text: expr(
        'Data i czas w Polsce: {{ $now.setZone("Europe/Warsaw").toISO() }}\nPolecenie użytkownika: {{ $("Rozpoznaj rodzaj polecenia").item.json.text }}',
      ),
      hasOutputParser: true,
      enableStreaming: false,
      options: {
        maxIterations: 3,
        returnIntermediateSteps: false,
        systemMessage: expr(
          "Jesteś precyzyjnym asystentem Taskera. Rozpoznajesz polecenia dotyczące zadań. " +
          "Nigdy nie tworzysz zadania samodzielnie i niczego nie dopowiadasz poza strukturą. " +
          "Użyj CREATE_TASK dla nowego zadania, COMPLETE_TASK dla oznaczenia istniejącego jako zrobione, RESCHEDULE_TASK dla zmiany terminu, SHARE_TASK dla dodania osobie dostępu bez zmiany wykonawcy, REASSIGN_TASK dla przekazania zadania nowemu wykonawcy, LIST_TODAY dla listy na dziś, LIST_TOMORROW dla listy na jutro, LIST_OVERDUE dla zaległych i LIST_ALL dla zestawienia wszystkich aktywnych kategorii. " +
          "Zwroty 'dodaj Michała do zadania', 'udostępnij zadanie Michałowi' oznaczają SHARE_TASK. Zwroty 'przekaż zadanie Michałowi', 'przypisz zadanie Michałowi' albo 'zmień wykonawcę na Michała' oznaczają REASSIGN_TASK. " +
          "Dla COMPLETE_TASK, RESCHEDULE_TASK, SHARE_TASK i REASSIGN_TASK użytkownik nie musi znać dokładnego tytułu. Wpisz w taskQuery charakterystyczne słowa z jego polecenia, pomijając zwroty sterujące; title pozostaw pusty. Dla SHARE_TASK i REASSIGN_TASK wpisz pełną nazwę rozpoznanej osoby z listy w assignee. Tasker pobierze dozwolone aktywne zadania i dopasuje tytuł tolerując odmiany, interpunkcję, domeny i drobne literówki. Dla list oba pola pozostaw puste. " +
          "Dla CREATE_TASK wpisz tytuł w title, a taskQuery pozostaw pusty. Jeżeli użytkownik w tym samym poleceniu tworzy zadanie i udostępnia je osobie, nadal użyj CREATE_TASK, wpisz pełną nazwę tej osoby z listy w shareWith i ustaw visibility na SHARED. assignee nadal oznacza wyłącznie wykonawcę; shareWith oznacza osobę otrzymującą dostęp. W pozostałych przypadkach shareWith pozostaw pusty. " +
          "Rodzaj zadania zapisuj niezależnie od widoczności: zwroty 'zadanie firmowe' lub 'firmowa sprawa' oznaczają taskScope COMPANY, a 'zadanie prywatne' lub 'prywatna sprawa' oznaczają taskScope PRIVATE. Jeśli rodzaju nie podano, ustaw PRIVATE. Udostępnienie zadania nie zmienia automatycznie jego rodzaju. " +
          "Rozpoznawaj daty względne według podanej daty w strefie Europe/Warsaw. " +
          'Autorem polecenia jest {{ $json.body.author.name }}. Dostępni wykonawcy: {{ $json.body.users.map((user) => user.name).join(", ") }}. ' +
          "Wykonawca to osoba, która ma wykonać czynność, a nie odbiorca, klient, adresat, rozmówca ani osoba występująca tylko w treści zadania. " +
          "Formy 'żebym', 'abym' i 'bym' jednoznacznie oznaczają autora — wtedy zwróć pusty assignee. " +
          "Przykład: 'przypomnij mi, żebym wysłał stronę Pawłowi' oznacza pusty assignee, ponieważ autor wysyła, a Paweł jest odbiorcą. " +
          "Ustaw nazwisko jako assignee tylko przy jawnym wykonawcy, np. 'Paweł ma wysłać', 'przypomnij Pawłowi, żeby wysłał', 'deleguj Pawłowi'. " +
          "Jeśli rola osoby jest niejasna, zwróć pusty assignee — Tasker przypisze autora. " +
          "Jeżeli daty lub godziny nie podano, zwróć pusty ciąg. Domyślny rodzaj to PRIVATE, domyślna widoczność to PRIVATE, a priorytet NORMAL. " +
          "Słowa pilne/natychmiast oznaczają URGENT, wysoki priorytet oznacza HIGH.",
        ),
      },
    },
    subnodes: { model: taskModel, memory: taskMemory, outputParser: taskParser },
  },
  output: [
    {
      output: {
        intent: "CREATE_TASK",
        title: "Oddzwonić",
        taskQuery: "",
        description: "",
        assignee: "Michał Murawski",
        shareWith: "",
        dueDate: "2026-08-29",
        dueTime: "15:00",
        taskScope: "PRIVATE",
        visibility: "PRIVATE",
        priority: "NORMAL",
      },
    },
  ],
});

const createDraft = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Utwórz szkic w Taskerze",
    parameters: {
      method: "POST",
      url: "https://tasker.dpkomis.pl/api/integrations/commands/drafts",
      authentication: "genericCredentialType",
      genericAuthType: "httpBearerAuth",
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        '{{ { telegramUserId: $("Rozpoznaj rodzaj polecenia").item.json.telegramUserId, sourceEventId: $("Rozpoznaj rodzaj polecenia").item.json.sourceEventId, sourceText: $("Rozpoznaj rodzaj polecenia").item.json.text, intent: $json.output.intent, ...($json.output.intent === "CREATE_TASK" ? { title: $json.output.title, description: $json.output.description, assignee: $json.output.assignee, shareWith: $json.output.shareWith, taskScope: $("Rozpoznaj rodzaj polecenia").item.json.explicitTaskScope || $json.output.taskScope, visibility: $json.output.visibility, priority: $json.output.priority } : {}), ...(["COMPLETE_TASK", "RESCHEDULE_TASK", "SHARE_TASK", "REASSIGN_TASK"].includes($json.output.intent) ? { taskQuery: $json.output.taskQuery } : {}), ...(["SHARE_TASK", "REASSIGN_TASK"].includes($json.output.intent) ? { assignee: $json.output.assignee } : {}), ...($json.output.dueDate ? { dueDate: $json.output.dueDate } : {}), ...($json.output.dueDate && $json.output.dueTime ? { dueTime: $json.output.dueTime } : {}) } }}',
      ),
      options: { response: { response: { fullResponse: true, neverError: true, responseFormat: "json" } } },
    },
    credentials: { httpBearerAuth: { id: "vtvrzLWu4B9S4lTr", name: "Tasker API" } },
  },
  output: [
    {
      body: {
        id: "00000000-0000-0000-0000-000000000000",
        status: "DRAFT",
        preview: {
          title: "Oddzwonić",
          assignee: "Michał Murawski",
          dueAt: "2026-08-29T13:00:00.000Z",
          taskScope: "PRIVATE",
          visibility: "PRIVATE",
          priority: "NORMAL",
        },
      },
      statusCode: 201,
    },
  ],
});

const directListRequest = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Pobierz szybką listę z Taskera",
    parameters: {
      method: "POST",
      url: "https://tasker.dpkomis.pl/api/integrations/commands/drafts",
      authentication: "genericCredentialType",
      genericAuthType: "httpBearerAuth",
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        '{{ { telegramUserId: $("Rozpoznaj rodzaj polecenia").item.json.telegramUserId, sourceEventId: $("Rozpoznaj rodzaj polecenia").item.json.sourceEventId, intent: $("Rozpoznaj rodzaj polecenia").item.json.directIntent } }}',
      ),
      options: { response: { response: { fullResponse: true, neverError: true, responseFormat: "json" } } },
    },
    credentials: { httpBearerAuth: { id: "vtvrzLWu4B9S4lTr", name: "Tasker API" } },
  },
  output: [{ body: { kind: "SUMMARY", view: "TOMORROW", tasks: [] }, statusCode: 200 }],
});

const createNoteRequest = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Zapisz notatkę w Taskerze",
    parameters: {
      method: "POST",
      url: "https://tasker.dpkomis.pl/api/integrations/notes",
      authentication: "genericCredentialType",
      genericAuthType: "httpBearerAuth",
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        '{{ { telegramUserId: $("Rozpoznaj rodzaj polecenia").item.json.telegramUserId, sourceEventId: $("Rozpoznaj rodzaj polecenia").item.json.sourceEventId, content: $("Rozpoznaj rodzaj polecenia").item.json.noteContent } }}',
      ),
      options: { response: { response: { fullResponse: true, neverError: true, responseFormat: "json" } } },
    },
    credentials: { httpBearerAuth: { id: "vtvrzLWu4B9S4lTr", name: "Tasker API" } },
  },
  output: [{ body: { kind: "NOTE_CREATED", created: true, note: { id: "00000000-0000-0000-0000-000000000000", title: "Pomysł", url: "/notes#note-00000000-0000-0000-0000-000000000000" } }, statusCode: 201 }],
});

const noteReply = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Potwierdź zapisanie notatki",
    parameters: {
      resource: "message",
      operation: "sendMessage",
      chatId: expr('{{ $("Rozpoznaj rodzaj polecenia").item.json.chatId }}'),
      text: expr(
        '{{ $json.statusCode >= 200 && $json.statusCode < 300 ? ($json.body.created ? "✅ Notatka została zapisana.\n\n" + $json.body.note.title : "ℹ️ Ta notatka była już zapisana.") + "\n\nhttps://tasker.dpkomis.pl" + $json.body.note.url : ($json.body?.error === "TELEGRAM_ACCOUNT_NOT_LINKED" ? "Najpierw połącz Telegram z kontem Taskera. Wygeneruj kod w ustawieniach i wyślij: /polacz KOD" : "❌ Nie udało się zapisać notatki: " + ($json.body?.error ?? "nieznany błąd")) }}',
      ),
      additionalFields: { appendAttribution: false, disable_web_page_preview: true },
    },
    credentials: { telegramApi: newCredential("Tasker Telegram Bot") },
  },
  output: [{ ok: true, result: { message_id: 18 } }],
});

const isSummary = ifElse({
  version: 2.3,
  config: {
    name: "Czy zwrócić listę?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{ leftValue: expr("{{ $json.body?.kind }}"), rightValue: "SUMMARY", operator: { type: "string", operation: "equals" } }],
        combinator: "and",
      },
    },
  },
});

const formatSummary = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Sformatuj listę zadań",
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode: `const body = $input.first().json.body || {};
const escapeHtml = (value) => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");
const dueLabel = (value) => value
  ? " · " + DateTime.fromISO(value).setZone("Europe/Warsaw").toFormat("dd.MM HH:mm")
  : " · bez terminu";
const taskLine = (task, index, showAssignee) => {
  const title = escapeHtml(task.title);
  const url = "https://tasker.dpkomis.pl/tasks/" + encodeURIComponent(task.id);
  const author = task.author ? " · autor: " + escapeHtml(task.author) : "";
  const assignee = showAssignee && task.assignee ? " · wykonawca: " + escapeHtml(task.assignee) : "";
  return (index + 1) + ". <a href=\\\"" + url + "\\\">" + title + "</a>" + dueLabel(task.dueAt) + author + assignee;
};
const scopeMessages = (scope, scopeIcon, scopeLabel, definitions) => {
  const scopeHeading = scopeIcon + " <b>" + scopeLabel + "</b>";
  const chunks = [];
  let message = scopeHeading;
  definitions.forEach(([icon, label, allTasks, showAssignee]) => {
    const tasks = allTasks.filter((task) => (task.taskScope || "PRIVATE") === scope);
    const groupHeading = "\\n\\n" + icon + " <b>" + label + " (" + tasks.length + ")</b>";
    if (message.length + groupHeading.length > 3600) {
      chunks.push(message);
      message = scopeHeading + " — ciąg dalszy" + groupHeading;
    } else {
      message += groupHeading;
    }
    if (!tasks.length) {
      message += "\\nBrak zadań.";
      return;
    }
    tasks.forEach((task, index) => {
      const line = "\\n" + taskLine(task, index, showAssignee);
      if (message.length + line.length > 3600) {
        chunks.push(message);
        message = scopeHeading + " — ciąg dalszy\\n\\n" + icon + " <b>" + label + "</b>" + line;
      } else {
        message += line;
      }
    });
  });
  chunks.push(message);
  return chunks;
};
if (body.view === "ALL") {
  const definitions = [
    ["🟢", "Bieżące", body.groups?.current || [], false],
    ["🟠", "Oczekujące", body.groups?.waiting || [], false],
    ["🔵", "Delegowane", body.groups?.delegated || [], true],
    ["🔁", "Cykliczne", body.groups?.recurring || [], false],
  ];
  return [
    ...scopeMessages("COMPANY", "🏢", "Zadania firmowe", definitions),
    ...scopeMessages("PRIVATE", "🔒", "Zadania prywatne", definitions),
  ].map((message) => ({ json: { message } }));
}
const labels = {
  TODAY: ["📅", "Zadania na dziś", "✅ Nie masz zadań na dziś."],
  TOMORROW: ["🌅", "Zadania na jutro", "✅ Nie masz zadań na jutro."],
  OVERDUE: ["⚠️", "Zaległe zadania", "✅ Nie masz zaległych zadań."],
};
const [icon, label, empty] = labels[body.view] || ["📋", "Zadania", "Brak zadań."];
const tasks = body.tasks || [];
if (!tasks.length) return [{ json: { message: empty } }];
const definitions = [[icon, label, tasks, false]];
return [
  ...scopeMessages("COMPANY", "🏢", "Firmowe", definitions),
  ...scopeMessages("PRIVATE", "🔒", "Prywatne", definitions),
].map((message) => ({ json: { message } }));`,
    },
  },
  output: [{ message: "🌅 <b>Zadania na jutro (1)</b>\n1. Oddzwonić · 31.08 15:00" }],
});

const summaryReply = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Pokaż listę zadań",
    parameters: {
      resource: "message",
      operation: "sendMessage",
      chatId: expr('{{ $("Rozpoznaj rodzaj polecenia").item.json.chatId }}'),
      text: expr("{{ $json.message }}"),
      additionalFields: { appendAttribution: false, disable_web_page_preview: true, parse_mode: "HTML" },
    },
    credentials: { telegramApi: newCredential("Tasker Telegram Bot") },
  },
  output: [{ ok: true, result: { message_id: 17 } }],
});

const draftReady = ifElse({
  version: 2.3,
  config: {
    name: "Czy szkic jest gotowy?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [
          {
            leftValue: expr("{{ $json.body?.status }}"),
            rightValue: "DRAFT",
            operator: { type: "string", operation: "equals" },
          },
        ],
        combinator: "and",
      },
    },
  },
});

const draftPreview = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Pokaż szkic do zatwierdzenia",
    parameters: {
      resource: "message",
      operation: "sendMessage",
      chatId: expr('{{ $("Rozpoznaj rodzaj polecenia").item.json.chatId }}'),
      text: expr(
        '{{ (() => { const preview = $json.body.preview; if (preview.intent === "COMPLETE_TASK") return "✅ Oznaczyć jako zrobione?\n\nZadanie: " + preview.title + "\n\nTa operacja wymaga ręcznego zatwierdzenia."; if (preview.intent === "RESCHEDULE_TASK") return "📅 Przesunąć termin?\n\nZadanie: " + preview.title + "\nNowy termin: " + DateTime.fromISO(preview.dueAt).setZone("Europe/Warsaw").toFormat("dd.MM.yyyy HH:mm") + "\n\nTa operacja wymaga ręcznego zatwierdzenia."; if (preview.intent === "SHARE_TASK") return "👥 Udostępnić zadanie?\n\nZadanie: " + preview.title + "\nDostęp otrzyma: " + preview.targetUser + "\nWykonawca pozostanie bez zmian.\n\nTa operacja wymaga ręcznego zatwierdzenia."; if (preview.intent === "REASSIGN_TASK") return "🔁 Przekazać zadanie?\n\nZadanie: " + preview.title + "\nNowy wykonawca: " + preview.targetUser + "\n\nTa operacja wymaga ręcznego zatwierdzenia."; const taskType = preview.taskScope === "COMPANY" ? "firmowy" : "prywatny"; const priority = ({ LOW: "niski", NORMAL: "normalny", HIGH: "wysoki", URGENT: "pilny" })[preview.priority] ?? "normalny"; const access = ({ PRIVATE: "prywatny — autor i wykonawca", COMPANY: "firmowy — użytkownicy firmowi", SHARED: "udostępniony wybranej osobie" })[preview.visibility] ?? "prywatny — autor i wykonawca"; return "📝 Szkic zadania\n\nTytuł: " + preview.title + "\nTyp zadania: " + taskType + "\nWykonawca: " + (preview.assignee ?? "autor zadania") + (preview.shareWith ? "\nUdostępniono: " + preview.shareWith : "") + "\nTermin: " + (preview.dueAt ? DateTime.fromISO(preview.dueAt).setZone("Europe/Warsaw").toFormat("dd.MM.yyyy HH:mm") : "bez terminu") + "\nPriorytet: " + priority + "\nDostęp: " + access + "\n\nZatwierdzić? Jeśli nic nie wybierzesz, zadanie zostanie utworzone automatycznie za 10 minut."; })() }}',
      ),
      replyMarkup: "inlineKeyboard",
      inlineKeyboard: {
        rows: [
          {
            row: {
              buttons: [
                {
                  text: "✅ Zatwierdź",
                  additionalFields: { callback_data: expr("tasker_confirm:{{ $json.body.id }}") },
                },
                {
                  text: "❌ Anuluj",
                  additionalFields: { callback_data: expr("tasker_cancel:{{ $json.body.id }}") },
                },
              ],
            },
          },
        ],
      },
      additionalFields: { appendAttribution: false, disable_web_page_preview: true },
    },
    credentials: { telegramApi: newCredential("Tasker Telegram Bot") },
  },
  output: [{ ok: true, result: { message_id: 14 } }],
});

const draftProblem = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Poproś o poprawienie polecenia",
    parameters: {
      resource: "message",
      operation: "sendMessage",
      chatId: expr('{{ $("Rozpoznaj rodzaj polecenia").item.json.chatId }}'),
      text: expr(
        '{{ $json.body?.status === "NEEDS_CLARIFICATION" ? "Potrzebuję doprecyzowania: " + ($json.body.clarification ?? "podaj więcej szczegółów") : ($json.body?.error === "TELEGRAM_ACCOUNT_NOT_LINKED" ? "Najpierw połącz Telegram z kontem Taskera. Wygeneruj kod w ustawieniach i wyślij: /polacz KOD" : "Nie udało się przygotować szkicu: " + ($json.body?.error ?? "nieznany błąd")) }}',
      ),
      additionalFields: { appendAttribution: false, disable_web_page_preview: true },
    },
    credentials: { telegramApi: newCredential("Tasker Telegram Bot") },
  },
  output: [{ ok: true, result: { message_id: 15 } }],
});

const helpReply = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Pokaż instrukcję",
    parameters: {
      resource: "message",
      operation: "sendMessage",
      chatId: expr("{{ $json.chatId }}"),
      text:
        "Tasker przez Telegram\n\n" +
        "/dzisiaj — zadania na dziś\n" +
        "/jutro — zadania z terminem na jutro\n" +
        "/zalegle — zadania po terminie\n" +
        "/zadania — zadania firmowe i prywatne z podziałem na kategorie\n" +
        "/notatka TREŚĆ — zapisz prywatną notatkę\n" +
        "/dodaj — pełna instrukcja tworzenia zadań\n" +
        "/pomoc — wszystkie możliwości\n\n" +
        "Obsługa istniejących zadań: możesz napisać lub nagrać: oznacz raport jako zrobiony, przełóż raport na poniedziałek 9:00, dodaj Michała do zadania z Polcardem albo przekaż raport Michałowi. Zmiany zawsze potwierdzasz przyciskiem.\n\n" +
        "Notatki są osobnym modułem. Zapiszesz je przez /notatka TREŚĆ, „dodaj do notatek…” albo „zapisz w notatkach…”.\n\n" +
        "Ustawienia: https://tasker.dpkomis.pl/settings",
      additionalFields: { appendAttribution: false, disable_web_page_preview: true },
    },
    credentials: { telegramApi: newCredential("Tasker Telegram Bot") },
  },
  output: [{ ok: true, result: { message_id: 16 } }],
});

const addHelpReply = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Pokaż instrukcję dodawania",
    parameters: {
      resource: "message",
      operation: "sendMessage",
      chatId: expr("{{ $json.chatId }}"),
      text:
        "Jak dodać zadanie w Taskerze\n\n" +
        "Napisz albo nagraj polecenie zwykłym językiem. Podaj tyle informacji, ile znasz: co trzeba zrobić, kto ma to wykonać, termin, godzinę, priorytet i ewentualnie komu zadanie udostępnić.\n\n" +
        "Przykłady:\n" +
        "• Dodaj zadanie firmowe wysłać raport jutro o 14:00.\n" +
        "• Dodaj prywatne zadanie kupić prezent w piątek o 10:30.\n" +
        "• Dodaj dla Michała zadanie firmowe oddzwonić do klienta w piątek o 10:30.\n" +
        "• Dodaj zadanie sprawdzić faktury za godzinę i udostępnij je Michałowi.\n" +
        "• Dodaj dla Michała zadanie przygotować ofertę do poniedziałku i udostępnij je Pawłowi.\n" +
        "• Dodaj pilne zadanie żebym dziś zadzwonił do księgowej.\n\n" +
        "Wykonawca a udostępnienie:\n" +
        "• Wykonawca odpowiada za realizację. Zwroty „dla Michała”, „Michał ma” albo „niech Michał” wskazują Michała jako wykonawcę.\n" +
        "• Zwroty „żebym”, „abym” i „bym” oznaczają Ciebie jako wykonawcę.\n" +
        "• „Udostępnij Michałowi” daje Michałowi dostęp, ale nie zmienia wykonawcy. Możesz jednocześnie wskazać innego wykonawcę i inną osobę do udostępnienia.\n" +
        "• Klient, odbiorca telefonu lub adresat wiadomości nie staje się automatycznie wykonawcą.\n\n" +
        "Rodzaj, dostęp i priorytet:\n" +
        "• Napisz „zadanie firmowe” albo „zadanie prywatne”. Bez wskazania rodzaju zadanie będzie prywatne.\n" +
        "• Rodzaj określa sekcję na listach. Dostęp jest osobną decyzją: zadanie może być udostępnione osobie bez zmiany jego rodzaju.\n" +
        "• Słowa „pilne” i „natychmiast” ustawiają priorytet pilny; możesz też podać niski lub wysoki priorytet.\n\n" +
        "Przed zapisem bot pokaże osobno tytuł, rodzaj, wykonawcę, odbiorcę udostępnienia, termin, priorytet i dostęp. Kompletny szkic nowego zadania możesz zatwierdzić lub anulować przyciskiem; bez reakcji zostanie zapisany automatycznie po 10 minutach. Niejasna osoba, data albo dostęp zawsze wymaga doprecyzowania.",
      additionalFields: { appendAttribution: false, disable_web_page_preview: true },
    },
    credentials: { telegramApi: newCredential("Tasker Telegram Bot") },
  },
  output: [{ ok: true, result: { message_id: 19 } }],
});

const summaryFlow = formatSummary.to(summaryReply);
const commandFlow = normalizeUpdate.to(
  routeCommand
    .onCase(0, linkAccount.to(linkReply))
    .onCase(1, acknowledgeConfirm.to(confirmDraft).to(confirmReply))
    .onCase(2, acknowledgeCancel.to(cancelDraft).to(cancelReply))
    .onCase(
      3,
      assignableUsers.to(taskAgent).to(createDraft).to(isSummary.onTrue(summaryFlow).onFalse(draftReady.onTrue(draftPreview).onFalse(draftProblem))),
    )
    .onCase(4, helpReply)
    .onCase(5, directListRequest.to(summaryFlow))
    .onCase(6, createNoteRequest.to(noteReply))
    .onCase(7, addHelpReply),
);

export default workflow("tasker-telegram-ai", "Tasker — Telegram + AI")
  .add(telegramTrigger)
  .to(
    isVoiceMessage
      .onTrue(downloadVoiceMessage.to(transcribeVoiceMessage).to(commandFlow))
      .onFalse(commandFlow),
  );
