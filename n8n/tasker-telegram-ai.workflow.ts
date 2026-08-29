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

const normalizeUpdate = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Rozpoznaj rodzaj polecenia",
    parameters: {
      mode: "runOnceForEachItem",
      language: "javaScript",
      jsCode:
        "const update = $json;\n" +
        "const callback = update.callback_query || null;\n" +
        "const message = callback?.message || update.message || null;\n" +
        "const text = String(message?.text || '').trim();\n" +
        "const callbackData = String(callback?.data || '');\n" +
        "let route = 'create';\n" +
        "let draftId = '';\n" +
        "let linkCode = '';\n" +
        "if (callbackData.startsWith('tasker_confirm:')) { route = 'confirm'; draftId = callbackData.slice(15); }\n" +
        "else if (callbackData.startsWith('tasker_cancel:')) { route = 'cancel'; draftId = callbackData.slice(14); }\n" +
        "else {\n" +
        "  const link = text.match(/^\\/(?:start|polacz)\\s+([A-Z0-9]{6,20})$/i);\n" +
        "  if (link) { route = 'link'; linkCode = link[1].toUpperCase(); }\n" +
        "  else if (!text || /^\\/(?:start|pomoc|help)$/i.test(text)) route = 'help';\n" +
        "}\n" +
        "return { json: { route, text, draftId, linkCode, telegramUserId: String(callback?.from?.id || message?.from?.id || ''), chatId: String(message?.chat?.id || ''), callbackQueryId: String(callback?.id || ''), sourceEventId: 'telegram-update-' + String(update.update_id || '') } };",
    },
  },
  output: [
    {
      route: "create",
      text: "Dodaj zadanie dla Michała: oddzwonić jutro o 15:00",
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
      numberOutputs: 5,
      output: expr("{{ ({ link: 0, confirm: 1, cancel: 2, create: 3, help: 4 })[$json.route] ?? 4 }}"),
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
        '{{ $json.statusCode >= 200 && $json.statusCode < 300 ? ($json.body?.preview?.intent === "COMPLETE_TASK" ? "✅ Zadanie zostało oznaczone jako zrobione." : ($json.body?.preview?.intent === "RESCHEDULE_TASK" ? "✅ Termin zadania został przesunięty." : "✅ Zadanie zostało utworzone w Taskerze.")) : "❌ Nie udało się wykonać polecenia: " + ($json.body?.error ?? "nieznany błąd") }}',
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
      options: { temperature: 0.1, reasoningEffort: "low", maxRetries: 2, timeout: 60000 },
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
          "dueDate",
          "dueTime",
          "visibility",
          "priority",
        ],
        properties: {
          intent: { type: "string", enum: ["CREATE_TASK", "COMPLETE_TASK", "RESCHEDULE_TASK", "LIST_TODAY", "LIST_OVERDUE"] },
          title: { type: "string", maxLength: 300 },
          taskQuery: { type: "string", maxLength: 300 },
          description: { type: "string", maxLength: 5000 },
          assignee: { type: "string", maxLength: 320 },
          dueDate: { type: "string", description: "YYYY-MM-DD albo pusty ciąg" },
          dueTime: { type: "string", description: "HH:mm albo pusty ciąg" },
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
          "Użyj CREATE_TASK dla nowego zadania, COMPLETE_TASK dla oznaczenia istniejącego jako zrobione, RESCHEDULE_TASK dla zmiany terminu, LIST_TODAY dla listy na dziś i LIST_OVERDUE dla zaległych. " +
          "Dla COMPLETE_TASK i RESCHEDULE_TASK wpisz rozpoznawalny fragment tytułu w taskQuery, a title pozostaw pusty. Dla list oba pola pozostaw puste. " +
          "Dla CREATE_TASK wpisz tytuł w title, a taskQuery pozostaw pusty. " +
          "Rozpoznawaj daty względne według podanej daty w strefie Europe/Warsaw. " +
          'Autorem polecenia jest {{ $json.body.author.name }}. Dostępni wykonawcy: {{ $json.body.users.map((user) => user.name).join(", ") }}. ' +
          "Wykonawca to osoba, która ma wykonać czynność, a nie odbiorca, klient, adresat, rozmówca ani osoba występująca tylko w treści zadania. " +
          "Formy 'żebym', 'abym' i 'bym' jednoznacznie oznaczają autora — wtedy zwróć pusty assignee. " +
          "Przykład: 'przypomnij mi, żebym wysłał stronę Pawłowi' oznacza pusty assignee, ponieważ autor wysyła, a Paweł jest odbiorcą. " +
          "Ustaw nazwisko jako assignee tylko przy jawnym wykonawcy, np. 'Paweł ma wysłać', 'przypomnij Pawłowi, żeby wysłał', 'deleguj Pawłowi'. " +
          "Jeśli rola osoby jest niejasna, zwróć pusty assignee — Tasker przypisze autora. " +
          "Jeżeli daty lub godziny nie podano, zwróć pusty ciąg. Domyślna widoczność to PRIVATE, a priorytet NORMAL. " +
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
        description: "",
        assignee: "Michał Murawski",
        dueDate: "2026-08-29",
        dueTime: "15:00",
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
        '{{ { telegramUserId: $("Rozpoznaj rodzaj polecenia").item.json.telegramUserId, sourceEventId: $("Rozpoznaj rodzaj polecenia").item.json.sourceEventId, sourceText: $("Rozpoznaj rodzaj polecenia").item.json.text, intent: $json.output.intent, ...($json.output.intent === "CREATE_TASK" ? { title: $json.output.title, description: $json.output.description, assignee: $json.output.assignee, visibility: $json.output.visibility, priority: $json.output.priority } : {}), ...(["COMPLETE_TASK", "RESCHEDULE_TASK"].includes($json.output.intent) ? { taskQuery: $json.output.taskQuery } : {}), ...($json.output.dueDate ? { dueDate: $json.output.dueDate } : {}), ...($json.output.dueDate && $json.output.dueTime ? { dueTime: $json.output.dueTime } : {}) } }}',
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
          visibility: "PRIVATE",
          priority: "NORMAL",
        },
      },
      statusCode: 201,
    },
  ],
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

const summaryReply = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Pokaż listę zadań",
    parameters: {
      resource: "message",
      operation: "sendMessage",
      chatId: expr('{{ $("Rozpoznaj rodzaj polecenia").item.json.chatId }}'),
      text: expr('{{ ($json.body.tasks?.length ? (($json.body.view === "OVERDUE" ? "⚠️ Zaległe zadania" : "📅 Zadania na dziś") + "\n\n" + $json.body.tasks.map((task, index) => (index + 1) + ". " + task.title + (task.dueAt ? " — " + DateTime.fromISO(task.dueAt).setZone("Europe/Warsaw").toFormat("dd.MM HH:mm") : "")).join("\n")) : ($json.body.view === "OVERDUE" ? "✅ Nie masz zaległych zadań." : "✅ Nie masz zadań na dziś.")) }}'),
      additionalFields: { appendAttribution: false, disable_web_page_preview: true },
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
        '{{ $json.body.preview.intent === "COMPLETE_TASK" ? "✅ Oznaczyć jako zrobione?\n\nZadanie: " + $json.body.preview.title + "\n\nTa operacja wymaga ręcznego zatwierdzenia." : ($json.body.preview.intent === "RESCHEDULE_TASK" ? "📅 Przesunąć termin?\n\nZadanie: " + $json.body.preview.title + "\nNowy termin: " + DateTime.fromISO($json.body.preview.dueAt).setZone("Europe/Warsaw").toFormat("dd.MM.yyyy HH:mm") + "\n\nTa operacja wymaga ręcznego zatwierdzenia." : "📝 Szkic zadania\n\nTytuł: " + $json.body.preview.title + "\nWykonawca: " + ($json.body.preview.assignee ?? "autor") + "\nTermin: " + ($json.body.preview.dueAt ? DateTime.fromISO($json.body.preview.dueAt).setZone("Europe/Warsaw").toFormat("dd.MM.yyyy HH:mm") : "bez terminu") + "\nPriorytet: " + $json.body.preview.priority + "\nWidoczność: " + $json.body.preview.visibility + "\n\nZatwierdzić? Jeśli nic nie wybierzesz, zadanie zostanie utworzone automatycznie za 10 minut.") }}',
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
        "1. W ustawieniach Taskera wygeneruj kod połączenia.\n" +
        "2. Wyślij: /polacz KOD\n" +
        "3. Pisz naturalnie, np.: Dodaj dla Michała zadanie oddzwonić jutro o 15:00.\n" +
        "4. Możesz też napisać: oznacz oddzwonić jako zrobione; przełóż raport na poniedziałek 9:00; pokaż zadania na dziś; pokaż zaległe.\n" +
        "5. Operacje zmieniające zadania potwierdzasz przyciskiem.",
      additionalFields: { appendAttribution: false, disable_web_page_preview: true },
    },
    credentials: { telegramApi: newCredential("Tasker Telegram Bot") },
  },
  output: [{ ok: true, result: { message_id: 16 } }],
});

export default workflow("tasker-telegram-ai", "Tasker — Telegram + AI")
  .add(telegramTrigger)
  .to(normalizeUpdate)
  .to(
    routeCommand
      .onCase(0, linkAccount.to(linkReply))
      .onCase(1, acknowledgeConfirm.to(confirmDraft).to(confirmReply))
      .onCase(2, acknowledgeCancel.to(cancelDraft).to(cancelReply))
      .onCase(
        3,
        assignableUsers.to(taskAgent).to(createDraft).to(isSummary.onTrue(summaryReply).onFalse(draftReady.onTrue(draftPreview).onFalse(draftProblem))),
      )
      .onCase(4, helpReply),
  );
