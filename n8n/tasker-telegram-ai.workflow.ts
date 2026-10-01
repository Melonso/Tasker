import {
  ifElse,
  languageModel,
  memory,
  node,
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
    parameters: {
  "updates": [
    "message",
    "callback_query"
  ],
  "additionalFields": {}
},
    credentials: {
  "telegramApi": {
    "id": "5IbWlDjmEVAQkvzT",
    "name": "Tasker Telegram Bot"
  }
},
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

const isPrivateChat = ifElse({ version: 2.3, config: {
  "name": "Czy to czat prywatny?",
  "parameters": {
    "conditions": {
      "options": {
        "caseSensitive": true,
        "leftValue": "",
        "typeValidation": "strict",
        "version": 1
      },
      "conditions": [
        {
          "id": "8c3f1d2a-6b4e-4f7a-9d21-3e5b7a9c0f14",
          "leftValue": "={{ $json.callback_query?.message?.chat?.type ?? $json.message?.chat?.type ?? \"\" }}",
          "rightValue": "private",
          "operator": {
            "type": "string",
            "operation": "equals"
          }
        }
      ],
      "combinator": "and"
    },
    "options": {}
  },
  "position": [
    112,
    1056
  ]
} });

const isVoiceMessage = ifElse({
  version: 2.3,
  config: {
    name: "Czy to wiadomość głosowa?",
    parameters: {
  "conditions": {
    "options": {
      "caseSensitive": true,
      "leftValue": "",
      "typeValidation": "strict",
      "version": 1
    },
    "conditions": [
      {
        "leftValue": "={{ $json.message?.voice?.file_id }}",
        "rightValue": "",
        "operator": {
          "type": "string",
          "operation": "exists",
          "singleValue": true
        }
      }
    ],
    "combinator": "and"
  },
  "options": {}
},
  },
});

const downloadVoiceMessage = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Pobierz wiadomość głosową",
    parameters: {
  "resource": "file",
  "fileId": "={{ $json.message.voice.file_id }}",
  "additionalFields": {}
},
    credentials: {
  "telegramApi": {
    "id": "5IbWlDjmEVAQkvzT",
    "name": "Tasker Telegram Bot"
  }
},
  },
  output: [{ file_id: "voice-file-id", file_path: "voice/file_1.oga" }],
});

const transcribeVoiceMessage = node({
  type: "@n8n/n8n-nodes-langchain.openAi",
  version: 1.8,
  config: {
    name: "Transkrybuj wiadomość głosową",
    parameters: {
  "resource": "audio",
  "operation": "transcribe",
  "options": {
    "language": "pl"
  }
},
    credentials: {
  "openAiApi": {
    "id": "jEORlTJJGCpHWA6r",
    "name": "OpenAi account"
  }
},
  },
  output: [{ text: "Dodaj zadanie oddzwonić jutro o 15:00" }],
});

const normalizeUpdate = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Rozpoznaj rodzaj polecenia",
    parameters: {
  "mode": "runOnceForEachItem",
  "jsCode": "const update = $(\"Odbierz wiadomość z Telegrama\").item.json;\nconst callback = update.callback_query || null;\nconst message = callback?.message || update.message || null;\nlet text = String($json.text || message?.text || '').trim();\nlet directIntent = '';\nif (/^\\/dzisiaj(?:@\\w+)?$/i.test(text)) directIntent = 'LIST_TODAY';\nelse if (/^\\/jutro(?:@\\w+)?$/i.test(text)) directIntent = 'LIST_TOMORROW';\nelse if (/^\\/zalegle(?:@\\w+)?$/i.test(text)) directIntent = 'LIST_OVERDUE';\nelse if (/^\\/zadania(?:@\\w+)?$/i.test(text)) directIntent = 'LIST_ALL';\nelse {\n  const normalizedText = text.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');\n  const asksForTasks = /\\b(pokaz|wyswietl|wypisz|sprawdz|jakie|lista|zestawienie)\\b/.test(normalizedText) && /\\bzadan(?:ia|ie|iach)?\\b/.test(normalizedText);\n  if (asksForTasks && /\\b(?:jutro|na jutro)\\b/.test(normalizedText)) directIntent = 'LIST_TOMORROW';\n  else if (asksForTasks && /\\b(?:dzis(?:iaj)?|na dzis)\\b/.test(normalizedText)) directIntent = 'LIST_TODAY';\n  else if (asksForTasks && /(?:\\bzalegl(?:e|ych|ymi)?\\b|po terminie)/.test(normalizedText)) directIntent = 'LIST_OVERDUE';\n  else if (asksForTasks && /(?:\\bwszystk(?:ie|ich|imi)?\\b|\\bkategori(?:e|ach)\\b)/.test(normalizedText)) directIntent = 'LIST_ALL';\n}\nconst scopeText = text.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ');\nconst hasCompanyScope = /(?:^|\\s)firmow(?:e|a|y|ego|ej|emu|ym|ych)(?:\\s|$)/.test(scopeText);\nconst hasPrivateScope = /(?:^|\\s)prywatn(?:e|a|y|ego|ej|emu|ym|ych)(?:\\s|$)/.test(scopeText);\nconst explicitTaskScope = hasCompanyScope && !hasPrivateScope ? 'COMPANY' : (hasPrivateScope && !hasCompanyScope ? 'PRIVATE' : '');\nconst noteCommand = text.match(/^\\/notatka(?:@\\w+)?(?:\\s+([\\s\\S]+))?$/i);\nconst noteNatural = text.match(/^(?:dodaj|zapisz)(?:\\s+mi)?\\s+(?:do\\s+notatek|w\\s+notatkach|notatk[ęe])\\s*[,;:\\-]?\\s*([\\s\\S]+)$/i);\nconst noteContent = String(noteCommand?.[1] || noteNatural?.[1] || '').trim();\nconst callbackData = String(callback?.data || '');\nlet route = 'create';\nlet draftId = '';\nlet linkCode = '';\nif (callbackData.startsWith('tasker_confirm:')) { route = 'confirm'; draftId = callbackData.slice(15); }\nelse if (callbackData.startsWith('tasker_cancel:')) { route = 'cancel'; draftId = callbackData.slice(14); }\nelse {\n  const link = text.match(/^\\/(?:start|polacz)\\s+([A-Z0-9]{6,20})$/i);\n  if (link) { route = 'link'; linkCode = link[1].toUpperCase(); }\n  else if (noteContent) route = 'note';\n  else if (directIntent) route = 'list';\n  else if (/^\\/dodaj(?:@\\w+)?$/i.test(text)) route = 'add_help';\n  else if (!text || text.length < 3 || /^\\/(?:start|pomoc|help|notatka)(?:@\\w+)?$/i.test(text)) route = 'help';\n}\nreturn { json: { route, text, directIntent, explicitTaskScope, noteContent, draftId, linkCode, telegramUserId: String(callback?.from?.id || message?.from?.id || ''), chatId: String(message?.chat?.id || ''), callbackQueryId: String(callback?.id || ''), sourceEventId: 'telegram-update-' + String(update.update_id || '') } };"
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
  "mode": "expression",
  "numberOutputs": 8,
  "output": "={{ ({ link: 0, confirm: 1, cancel: 2, create: 3, help: 4, list: 5, note: 6, add_help: 7 })[$json.route] ?? 4 }}"
},
  },
});

const linkAccount = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Połącz konto z Taskerem",
    parameters: {
  "method": "POST",
  "url": "https://tasker.dpkomis.pl/api/integrations/telegram/link",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpBearerAuth",
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ { code: $(\"Rozpoznaj rodzaj polecenia\").item.json.linkCode, telegramUserId: $(\"Rozpoznaj rodzaj polecenia\").item.json.telegramUserId, chatId: $(\"Rozpoznaj rodzaj polecenia\").item.json.chatId } }}",
  "options": {
    "response": {
      "response": {
        "fullResponse": true,
        "neverError": true,
        "responseFormat": "json"
      }
    }
  }
},
    credentials: {
  "httpBearerAuth": {
    "id": "vtvrzLWu4B9S4lTr",
    "name": "Tasker API"
  }
},
  },
  output: [{ body: { linked: true, user: { name: "Mateusz Meloch" } }, statusCode: 200 }],
});

const linkReply = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Potwierdź połączenie konta",
    parameters: {
  "chatId": "={{ $(\"Rozpoznaj rodzaj polecenia\").item.json.chatId }}",
  "text": "={{ $json.statusCode >= 200 && $json.statusCode < 300 ? \"✅ Konto połączone. Możesz już wpisywać zadania zwykłym językiem.\" : ($json.body?.error === \"INVALID_OR_EXPIRED_CODE\" ? \"❌ Kod jest nieprawidłowy albo wygasł. Wygeneruj nowy w ustawieniach Taskera.\" : \"❌ Nie udało się połączyć konta: \" + ($json.body?.error ?? \"nieznany błąd\")) }}",
  "additionalFields": {
    "appendAttribution": false,
    "disable_web_page_preview": true
  }
},
    credentials: {
  "telegramApi": {
    "id": "5IbWlDjmEVAQkvzT",
    "name": "Tasker Telegram Bot"
  }
},
  },
  output: [{ ok: true, result: { message_id: 11 } }],
});

const acknowledgeConfirm = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Przyjmij potwierdzenie",
    parameters: {
  "resource": "callback",
  "queryId": "={{ $json.callbackQueryId }}",
  "additionalFields": {
    "cache_time": 0,
    "show_alert": false,
    "text": "Wykonuję polecenie…"
  }
},
    credentials: {
  "telegramApi": {
    "id": "5IbWlDjmEVAQkvzT",
    "name": "Tasker Telegram Bot"
  }
},
  },
  output: [{ ok: true, result: true }],
});

const confirmDraft = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Zatwierdź szkic w Taskerze",
    parameters: {
  "method": "POST",
  "url": "=https://tasker.dpkomis.pl/api/integrations/commands/drafts/{{ $(\"Rozpoznaj rodzaj polecenia\").item.json.draftId }}/confirm",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpBearerAuth",
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ { telegramUserId: $(\"Rozpoznaj rodzaj polecenia\").item.json.telegramUserId } }}",
  "options": {
    "response": {
      "response": {
        "fullResponse": true,
        "neverError": true,
        "responseFormat": "json"
      }
    }
  }
},
    credentials: {
  "httpBearerAuth": {
    "id": "vtvrzLWu4B9S4lTr",
    "name": "Tasker API"
  }
},
  },
  output: [{ body: { status: "CONFIRMED", taskId: "00000000-0000-0000-0000-000000000000" }, statusCode: 200 }],
});

const confirmReply = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Wyślij wynik zatwierdzenia",
    parameters: {
  "chatId": "={{ $(\"Rozpoznaj rodzaj polecenia\").item.json.chatId }}",
  "text": "={{ $json.statusCode >= 200 && $json.statusCode < 300 ? ({ COMPLETE_TASK: \"✅ Zadanie zostało oznaczone jako zrobione.\", RESCHEDULE_TASK: \"✅ Termin zadania został przesunięty.\", SHARE_TASK: \"✅ Zadanie zostało udostępnione.\", REASSIGN_TASK: \"✅ Zadanie zostało przekazane nowemu wykonawcy.\" }[$json.body?.preview?.intent] ?? \"✅ Zadanie zostało utworzone w Taskerze.\") : \"❌ Nie udało się wykonać polecenia: \" + ($json.body?.message ?? $json.body?.error ?? \"nieznany błąd\") }}",
  "additionalFields": {
    "appendAttribution": false,
    "disable_web_page_preview": true
  }
},
    credentials: {
  "telegramApi": {
    "id": "5IbWlDjmEVAQkvzT",
    "name": "Tasker Telegram Bot"
  }
},
  },
  output: [{ ok: true, result: { message_id: 12 } }],
});

const acknowledgeCancel = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Przyjmij anulowanie",
    parameters: {
  "resource": "callback",
  "queryId": "={{ $json.callbackQueryId }}",
  "additionalFields": {
    "cache_time": 0,
    "show_alert": false,
    "text": "Anuluję szkic…"
  }
},
    credentials: {
  "telegramApi": {
    "id": "5IbWlDjmEVAQkvzT",
    "name": "Tasker Telegram Bot"
  }
},
  },
  output: [{ ok: true, result: true }],
});

const cancelDraft = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Anuluj szkic w Taskerze",
    parameters: {
  "method": "POST",
  "url": "=https://tasker.dpkomis.pl/api/integrations/commands/drafts/{{ $(\"Rozpoznaj rodzaj polecenia\").item.json.draftId }}/cancel",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpBearerAuth",
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ { telegramUserId: $(\"Rozpoznaj rodzaj polecenia\").item.json.telegramUserId } }}",
  "options": {
    "response": {
      "response": {
        "fullResponse": true,
        "neverError": true,
        "responseFormat": "json"
      }
    }
  }
},
    credentials: {
  "httpBearerAuth": {
    "id": "vtvrzLWu4B9S4lTr",
    "name": "Tasker API"
  }
},
  },
  output: [{ body: { status: "CANCELED" }, statusCode: 200 }],
});

const cancelReply = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Wyślij wynik anulowania",
    parameters: {
  "chatId": "={{ $(\"Rozpoznaj rodzaj polecenia\").item.json.chatId }}",
  "text": "={{ $json.statusCode >= 200 && $json.statusCode < 300 ? \"🗑️ Szkic został anulowany. Zadanie nie powstało.\" : \"❌ Nie udało się anulować szkicu: \" + ($json.body?.error ?? \"nieznany błąd\") }}",
  "additionalFields": {
    "appendAttribution": false,
    "disable_web_page_preview": true
  }
},
    credentials: {
  "telegramApi": {
    "id": "5IbWlDjmEVAQkvzT",
    "name": "Tasker Telegram Bot"
  }
},
  },
  output: [{ ok: true, result: { message_id: 13 } }],
});

const taskModel = languageModel({
  type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
  version: 1.3,
  config: {
    name: "Model rozumiejący polecenie",
    parameters: {
  "model": {
    "__rl": true,
    "value": "gpt-5.6-luna",
    "mode": "list",
    "cachedResultName": "gpt-5.6-luna"
  },
  "builtInTools": {},
  "options": {
    "reasoningEffort": "medium",
    "timeout": 60000,
    "maxRetries": 2
  }
},
    credentials: {
  "openAiApi": {
    "id": "jEORlTJJGCpHWA6r",
    "name": "OpenAi account"
  }
},
  },
});

const taskMemory = memory({
  type: "@n8n/n8n-nodes-langchain.memoryBufferWindow",
  version: 1.4,
  config: {
    name: "Pamięć rozmowy użytkownika",
    parameters: {
  "sessionIdType": "customKey",
  "sessionKey": "={{ $('Rozpoznaj rodzaj polecenia').item.json.chatId }}",
  "contextWindowLength": 6
},
  },
});

const taskParser = outputParser({
  type: "@n8n/n8n-nodes-langchain.outputParserStructured",
  version: 1.3,
  config: {
    name: "Struktura szkicu zadania",
    parameters: {
  "schemaType": "manual",
  "inputSchema": "{\"type\":\"object\",\"additionalProperties\":false,\"required\":[\"intent\",\"title\",\"taskQuery\",\"description\",\"assignee\",\"shareWith\",\"dueDate\",\"dueTime\",\"taskScope\",\"visibility\",\"priority\"],\"properties\":{\"intent\":{\"type\":\"string\",\"enum\":[\"CREATE_TASK\",\"COMPLETE_TASK\",\"RESCHEDULE_TASK\",\"SHARE_TASK\",\"REASSIGN_TASK\",\"LIST_TODAY\",\"LIST_TOMORROW\",\"LIST_OVERDUE\",\"LIST_ALL\"]},\"title\":{\"type\":\"string\",\"maxLength\":300},\"taskQuery\":{\"type\":\"string\",\"maxLength\":300},\"description\":{\"type\":\"string\",\"maxLength\":5000},\"assignee\":{\"type\":\"string\",\"maxLength\":320},\"shareWith\":{\"type\":\"string\",\"maxLength\":320},\"dueDate\":{\"type\":\"string\",\"description\":\"YYYY-MM-DD albo pusty ciąg\"},\"dueTime\":{\"type\":\"string\",\"description\":\"HH:mm albo pusty ciąg\"},\"taskScope\":{\"type\":\"string\",\"enum\":[\"PRIVATE\",\"COMPANY\"]},\"visibility\":{\"type\":\"string\",\"enum\":[\"PRIVATE\",\"COMPANY\",\"SHARED\"]},\"priority\":{\"type\":\"string\",\"enum\":[\"LOW\",\"NORMAL\",\"HIGH\",\"URGENT\"]}}}"
},
  },
});

const assignableUsers = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Pobierz wykonawców z Taskera",
    parameters: {
  "url": "https://tasker.dpkomis.pl/api/integrations/users/assignable",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpBearerAuth",
  "sendQuery": true,
  "queryParameters": {
    "parameters": [
      {
        "name": "telegramUserId",
        "value": "={{ $(\"Rozpoznaj rodzaj polecenia\").item.json.telegramUserId }}"
      }
    ]
  },
  "options": {
    "response": {
      "response": {
        "fullResponse": true,
        "neverError": true,
        "responseFormat": "json"
      }
    }
  }
},
    credentials: {
  "httpBearerAuth": {
    "id": "vtvrzLWu4B9S4lTr",
    "name": "Tasker API"
  }
},
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
  "promptType": "define",
  "text": "=Data i czas w Polsce: {{ $now.setZone(\"Europe/Warsaw\").toISO() }}\nPolecenie użytkownika: {{ $(\"Rozpoznaj rodzaj polecenia\").item.json.text }}",
  "hasOutputParser": true,
  "options": {
    "systemMessage": "=Jesteś precyzyjnym asystentem Taskera. Rozpoznajesz polecenia dotyczące zadań. Nigdy nie tworzysz zadania samodzielnie i niczego nie dopowiadasz poza strukturą. Użyj CREATE_TASK dla nowego zadania, COMPLETE_TASK dla oznaczenia istniejącego jako zrobione, RESCHEDULE_TASK dla zmiany terminu, SHARE_TASK dla dodania osobie dostępu bez zmiany wykonawcy, REASSIGN_TASK dla przekazania zadania nowemu wykonawcy, LIST_TODAY dla listy na dziś, LIST_TOMORROW dla listy na jutro, LIST_OVERDUE dla zaległych i LIST_ALL dla zestawienia wszystkich aktywnych kategorii. Zwroty 'dodaj Michała do zadania', 'udostępnij zadanie Michałowi' oznaczają SHARE_TASK. Zwroty 'przekaż zadanie Michałowi', 'przypisz zadanie Michałowi' albo 'zmień wykonawcę na Michała' oznaczają REASSIGN_TASK. Dla COMPLETE_TASK, RESCHEDULE_TASK, SHARE_TASK i REASSIGN_TASK użytkownik nie musi znać dokładnego tytułu. Wpisz w taskQuery charakterystyczne słowa z jego polecenia, pomijając zwroty sterujące; title pozostaw pusty. Dla SHARE_TASK i REASSIGN_TASK wpisz pełną nazwę rozpoznanej osoby z listy w assignee. Tasker pobierze dozwolone aktywne zadania i dopasuje tytuł tolerując odmiany, interpunkcję, domeny i drobne literówki. Dla list oba pola pozostaw puste. Dla CREATE_TASK wpisz tytuł w title, a taskQuery pozostaw pusty. Jeżeli użytkownik w tym samym poleceniu tworzy zadanie i udostępnia je osobie, nadal użyj CREATE_TASK, wpisz pełną nazwę tej osoby z listy w shareWith i ustaw visibility na SHARED. assignee nadal oznacza wyłącznie wykonawcę; shareWith oznacza osobę otrzymującą dostęp. W pozostałych przypadkach shareWith pozostaw pusty. Rodzaj zadania zapisuj niezależnie od widoczności: zwroty 'zadanie firmowe' lub 'firmowa sprawa' oznaczają taskScope COMPANY, a 'zadanie prywatne' lub 'prywatna sprawa' oznaczają taskScope PRIVATE. Jeśli rodzaju nie podano, ustaw PRIVATE. Udostępnienie zadania nie zmienia automatycznie jego rodzaju. Rozpoznawaj daty względne według podanej daty w strefie Europe/Warsaw. Autorem polecenia jest {{ $json.body.author.name }}. Dostępni wykonawcy: {{ $json.body.users.map((user) => user.name).join(\", \") }}. Wykonawca to osoba, która ma wykonać czynność, a nie odbiorca, klient, adresat, rozmówca ani osoba występująca tylko w treści zadania. Formy 'żebym', 'abym' i 'bym' jednoznacznie oznaczają autora — wtedy zwróć pusty assignee. Przykład: 'przypomnij mi, żebym wysłał stronę Pawłowi' oznacza pusty assignee, ponieważ autor wysyła, a Paweł jest odbiorcą. Ustaw nazwisko jako assignee tylko przy jawnym wykonawcy, np. 'Paweł ma wysłać', 'przypomnij Pawłowi, żeby wysłał', 'deleguj Pawłowi'. Jeśli rola osoby jest niejasna, zwróć pusty assignee — Tasker przypisze autora. Jeżeli daty lub godziny nie podano, zwróć pusty ciąg. Domyślny rodzaj to PRIVATE, domyślna widoczność to PRIVATE, a priorytet NORMAL. Słowa pilne/natychmiast oznaczają URGENT, wysoki priorytet oznacza HIGH.",
    "maxIterations": 3,
    "returnIntermediateSteps": false
  }
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
  "method": "POST",
  "url": "https://tasker.dpkomis.pl/api/integrations/commands/drafts",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpBearerAuth",
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ { telegramUserId: $(\"Rozpoznaj rodzaj polecenia\").item.json.telegramUserId, sourceEventId: $(\"Rozpoznaj rodzaj polecenia\").item.json.sourceEventId, sourceText: $(\"Rozpoznaj rodzaj polecenia\").item.json.text, intent: $json.output.intent, ...($json.output.intent === \"CREATE_TASK\" ? { title: $json.output.title, description: $json.output.description, assignee: $json.output.assignee, shareWith: $json.output.shareWith, taskScope: $(\"Rozpoznaj rodzaj polecenia\").item.json.explicitTaskScope || $json.output.taskScope, visibility: $json.output.visibility, priority: $json.output.priority } : {}), ...([\"COMPLETE_TASK\", \"RESCHEDULE_TASK\", \"SHARE_TASK\", \"REASSIGN_TASK\"].includes($json.output.intent) ? { taskQuery: $json.output.taskQuery } : {}), ...([\"SHARE_TASK\", \"REASSIGN_TASK\"].includes($json.output.intent) ? { assignee: $json.output.assignee } : {}), ...($json.output.dueDate ? { dueDate: $json.output.dueDate } : {}), ...($json.output.dueDate && $json.output.dueTime ? { dueTime: $json.output.dueTime } : {}) } }}",
  "options": {
    "response": {
      "response": {
        "fullResponse": true,
        "neverError": true,
        "responseFormat": "json"
      }
    }
  }
},
    credentials: {
  "httpBearerAuth": {
    "id": "vtvrzLWu4B9S4lTr",
    "name": "Tasker API"
  }
},
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
  "method": "POST",
  "url": "https://tasker.dpkomis.pl/api/integrations/commands/drafts",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpBearerAuth",
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ { telegramUserId: $(\"Rozpoznaj rodzaj polecenia\").item.json.telegramUserId, sourceEventId: $(\"Rozpoznaj rodzaj polecenia\").item.json.sourceEventId, intent: $(\"Rozpoznaj rodzaj polecenia\").item.json.directIntent } }}",
  "options": {
    "response": {
      "response": {
        "fullResponse": true,
        "neverError": true,
        "responseFormat": "json"
      }
    }
  }
},
    credentials: {
  "httpBearerAuth": {
    "id": "vtvrzLWu4B9S4lTr",
    "name": "Tasker API"
  }
},
  },
  output: [{ body: { kind: "SUMMARY", view: "TOMORROW", tasks: [] }, statusCode: 200 }],
});

const createNoteRequest = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Zapisz notatkę w Taskerze",
    parameters: {
  "method": "POST",
  "url": "https://tasker.dpkomis.pl/api/integrations/notes",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpBearerAuth",
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ { telegramUserId: $(\"Rozpoznaj rodzaj polecenia\").item.json.telegramUserId, sourceEventId: $(\"Rozpoznaj rodzaj polecenia\").item.json.sourceEventId, content: $(\"Rozpoznaj rodzaj polecenia\").item.json.noteContent } }}",
  "options": {
    "response": {
      "response": {
        "fullResponse": true,
        "neverError": true,
        "responseFormat": "json"
      }
    }
  }
},
    credentials: {
  "httpBearerAuth": {
    "id": "vtvrzLWu4B9S4lTr",
    "name": "Tasker API"
  }
},
  },
  output: [{ body: { kind: "NOTE_CREATED", created: true, note: { id: "00000000-0000-0000-0000-000000000000", title: "Pomysł", url: "/notes#note-00000000-0000-0000-0000-000000000000" } }, statusCode: 201 }],
});

const noteReply = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Potwierdź zapisanie notatki",
    parameters: {
  "chatId": "={{ $(\"Rozpoznaj rodzaj polecenia\").item.json.chatId }}",
  "text": "={{ $json.statusCode >= 200 && $json.statusCode < 300 ? ($json.body.created ? \"✅ Notatka została zapisana.\\n\\n\" + $json.body.note.title : \"ℹ️ Ta notatka była już zapisana.\") + \"\\n\\nhttps://tasker.dpkomis.pl\" + $json.body.note.url : ($json.body?.error === \"TELEGRAM_ACCOUNT_NOT_LINKED\" ? \"Najpierw połącz Telegram z kontem Taskera. Wygeneruj kod w ustawieniach i wyślij: /polacz KOD\" : \"❌ Nie udało się zapisać notatki: \" + ($json.body?.error ?? \"nieznany błąd\")) }}",
  "additionalFields": {
    "appendAttribution": false,
    "disable_web_page_preview": true
  }
},
    credentials: {
  "telegramApi": {
    "id": "5IbWlDjmEVAQkvzT",
    "name": "Tasker Telegram Bot"
  }
},
  },
  output: [{ ok: true, result: { message_id: 18 } }],
});

const isSummary = ifElse({
  version: 2.3,
  config: {
    name: "Czy zwrócić listę?",
    parameters: {
  "conditions": {
    "options": {
      "caseSensitive": true,
      "leftValue": "",
      "typeValidation": "strict",
      "version": 1
    },
    "conditions": [
      {
        "leftValue": "={{ $json.body?.kind }}",
        "rightValue": "SUMMARY",
        "operator": {
          "type": "string",
          "operation": "equals"
        }
      }
    ],
    "combinator": "and"
  },
  "options": {}
},
  },
});

const formatSummary = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Sformatuj listę zadań",
    parameters: {
  "jsCode": "const body = $input.first().json.body || {};\nconst escapeHtml = (value) => String(value || \"\")\n  .replace(/&/g, \"&amp;\")\n  .replace(/</g, \"&lt;\")\n  .replace(/>/g, \"&gt;\")\n  .replace(/\"/g, \"&quot;\");\nconst dueLabel = (value) => value\n  ? \" · \" + DateTime.fromISO(value).setZone(\"Europe/Warsaw\").toFormat(\"dd.MM HH:mm\")\n  : \" · bez terminu\";\nconst taskLine = (task, index, showAssignee) => {\n  const title = escapeHtml(task.title);\n  const url = \"https://tasker.dpkomis.pl/tasks/\" + encodeURIComponent(task.id);\n  const author = task.author ? \" · autor: \" + escapeHtml(task.author) : \"\";\n  const assignee = showAssignee && task.assignee ? \" · wykonawca: \" + escapeHtml(task.assignee) : \"\";\n  return (index + 1) + \". <a href=\\\"\" + url + \"\\\">\" + title + \"</a>\" + dueLabel(task.dueAt) + author + assignee;\n};\nconst scopeMessages = (scope, scopeIcon, scopeLabel, definitions) => {\n  const scopeHeading = scopeIcon + \" <b>\" + scopeLabel + \"</b>\";\n  const chunks = [];\n  let message = scopeHeading;\n  definitions.forEach(([icon, label, allTasks, showAssignee]) => {\n    const tasks = allTasks.filter((task) => (task.taskScope || \"PRIVATE\") === scope);\n    const groupHeading = \"\\n\\n\" + icon + \" <b>\" + label + \" (\" + tasks.length + \")</b>\";\n    if (message.length + groupHeading.length > 3600) {\n      chunks.push(message);\n      message = scopeHeading + \" — ciąg dalszy\" + groupHeading;\n    } else {\n      message += groupHeading;\n    }\n    if (!tasks.length) {\n      message += \"\\nBrak zadań.\";\n      return;\n    }\n    tasks.forEach((task, index) => {\n      const line = \"\\n\" + taskLine(task, index, showAssignee);\n      if (message.length + line.length > 3600) {\n        chunks.push(message);\n        message = scopeHeading + \" — ciąg dalszy\\n\\n\" + icon + \" <b>\" + label + \"</b>\" + line;\n      } else {\n        message += line;\n      }\n    });\n  });\n  chunks.push(message);\n  return chunks;\n};\nif (body.view === \"ALL\") {\n  const definitions = [\n    [\"🟢\", \"Bieżące\", body.groups?.current || [], false],\n    [\"🟠\", \"Oczekujące\", body.groups?.waiting || [], false],\n    [\"🔵\", \"Delegowane\", body.groups?.delegated || [], true],\n    [\"🔁\", \"Cykliczne\", body.groups?.recurring || [], false],\n  ];\n  return [\n    ...scopeMessages(\"COMPANY\", \"🏢\", \"Zadania firmowe\", definitions),\n    ...scopeMessages(\"PRIVATE\", \"🔒\", \"Zadania prywatne\", definitions),\n  ].map((message) => ({ json: { message } }));\n}\nconst labels = {\n  TODAY: [\"📅\", \"Zadania na dziś\", \"✅ Nie masz zadań na dziś.\"],\n  TOMORROW: [\"🌅\", \"Zadania na jutro\", \"✅ Nie masz zadań na jutro.\"],\n  OVERDUE: [\"⚠️\", \"Zaległe zadania\", \"✅ Nie masz zaległych zadań.\"],\n};\nconst [icon, label, empty] = labels[body.view] || [\"📋\", \"Zadania\", \"Brak zadań.\"];\nconst tasks = body.tasks || [];\nif (!tasks.length) return [{ json: { message: empty } }];\nconst definitions = [[icon, label, tasks, false]];\nreturn [\n  ...scopeMessages(\"COMPANY\", \"🏢\", \"Firmowe\", definitions),\n  ...scopeMessages(\"PRIVATE\", \"🔒\", \"Prywatne\", definitions),\n].map((message) => ({ json: { message } }));"
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
  "chatId": "={{ $(\"Rozpoznaj rodzaj polecenia\").item.json.chatId }}",
  "text": "={{ $json.message }}",
  "additionalFields": {
    "appendAttribution": false,
    "disable_web_page_preview": true,
    "parse_mode": "HTML"
  }
},
    credentials: {
  "telegramApi": {
    "id": "5IbWlDjmEVAQkvzT",
    "name": "Tasker Telegram Bot"
  }
},
  },
  output: [{ ok: true, result: { message_id: 17 } }],
});

const draftReady = ifElse({
  version: 2.3,
  config: {
    name: "Czy szkic jest gotowy?",
    parameters: {
  "conditions": {
    "options": {
      "caseSensitive": true,
      "leftValue": "",
      "typeValidation": "strict",
      "version": 1
    },
    "conditions": [
      {
        "leftValue": "={{ $json.body?.status }}",
        "rightValue": "DRAFT",
        "operator": {
          "type": "string",
          "operation": "equals"
        }
      }
    ],
    "combinator": "and"
  },
  "options": {}
},
  },
});

const draftPreview = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Pokaż szkic do zatwierdzenia",
    parameters: {
  "chatId": "={{ $(\"Rozpoznaj rodzaj polecenia\").item.json.chatId }}",
  "text": "={{ (() => { const preview = $json.body.preview; if (preview.intent === \"COMPLETE_TASK\") return \"✅ Oznaczyć jako zrobione?\\n\\nZadanie: \" + preview.title + \"\\n\\nTa operacja wymaga ręcznego zatwierdzenia.\"; if (preview.intent === \"RESCHEDULE_TASK\") return \"📅 Przesunąć termin?\\n\\nZadanie: \" + preview.title + \"\\nNowy termin: \" + DateTime.fromISO(preview.dueAt).setZone(\"Europe/Warsaw\").toFormat(\"dd.MM.yyyy HH:mm\") + \"\\n\\nTa operacja wymaga ręcznego zatwierdzenia.\"; if (preview.intent === \"SHARE_TASK\") return \"👥 Udostępnić zadanie?\\n\\nZadanie: \" + preview.title + \"\\nDostęp otrzyma: \" + preview.targetUser + \"\\nWykonawca pozostanie bez zmian.\\n\\nTa operacja wymaga ręcznego zatwierdzenia.\"; if (preview.intent === \"REASSIGN_TASK\") return \"🔁 Przekazać zadanie?\\n\\nZadanie: \" + preview.title + \"\\nNowy wykonawca: \" + preview.targetUser + \"\\nDotychczasowy wykonawca zachowa dostęp do zadania.\\n\\nTa operacja wymaga ręcznego zatwierdzenia.\"; const taskType = preview.taskScope === \"COMPANY\" ? \"firmowy\" : \"prywatny\"; const priority = ({ LOW: \"niski\", NORMAL: \"normalny\", HIGH: \"wysoki\", URGENT: \"pilny\" })[preview.priority] ?? \"normalny\"; const access = ({ PRIVATE: \"prywatny — autor i wykonawca\", COMPANY: \"firmowy — użytkownicy firmowi\", SHARED: \"udostępniony wybranej osobie\" })[preview.visibility] ?? \"prywatny — autor i wykonawca\"; return \"📝 Szkic zadania\\n\\nTytuł: \" + preview.title + \"\\nTyp zadania: \" + taskType + \"\\nWykonawca: \" + (preview.assignee ?? \"autor zadania\") + (preview.shareWith ? \"\\nUdostępniono: \" + preview.shareWith : \"\") + \"\\nTermin: \" + (preview.dueAt ? DateTime.fromISO(preview.dueAt).setZone(\"Europe/Warsaw\").toFormat(\"dd.MM.yyyy HH:mm\") : \"bez terminu\") + \"\\nPriorytet: \" + priority + \"\\nDostęp: \" + access + \"\\n\\nZatwierdzić? Jeśli nic nie wybierzesz, zadanie zostanie utworzone automatycznie za 10 minut.\"; })() }}",
  "replyMarkup": "inlineKeyboard",
  "inlineKeyboard": {
    "rows": [
      {
        "row": {
          "buttons": [
            {
              "text": "✅ Zatwierdź",
              "additionalFields": {
                "callback_data": "=tasker_confirm:{{ $json.body.id }}"
              }
            },
            {
              "text": "❌ Anuluj",
              "additionalFields": {
                "callback_data": "=tasker_cancel:{{ $json.body.id }}"
              }
            }
          ]
        }
      }
    ]
  },
  "additionalFields": {
    "appendAttribution": false,
    "disable_web_page_preview": true
  }
},
    credentials: {
  "telegramApi": {
    "id": "5IbWlDjmEVAQkvzT",
    "name": "Tasker Telegram Bot"
  }
},
  },
  output: [{ ok: true, result: { message_id: 14 } }],
});

const draftProblem = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Poproś o poprawienie polecenia",
    parameters: {
  "chatId": "={{ $(\"Rozpoznaj rodzaj polecenia\").item.json.chatId }}",
  "text": "={{ $json.body?.status === \"NEEDS_CLARIFICATION\" ? \"Potrzebuję doprecyzowania: \" + ($json.body.clarification ?? \"podaj więcej szczegółów\") : ($json.body?.error === \"TELEGRAM_ACCOUNT_NOT_LINKED\" ? \"Najpierw połącz Telegram z kontem Taskera. Wygeneruj kod w ustawieniach i wyślij: /polacz KOD\" : \"Nie udało się przygotować szkicu: \" + ($json.body?.error ?? \"nieznany błąd\")) }}",
  "additionalFields": {
    "appendAttribution": false,
    "disable_web_page_preview": true
  }
},
    credentials: {
  "telegramApi": {
    "id": "5IbWlDjmEVAQkvzT",
    "name": "Tasker Telegram Bot"
  }
},
  },
  output: [{ ok: true, result: { message_id: 15 } }],
});

const helpReply = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Pokaż instrukcję",
    parameters: {
  "chatId": "={{ $json.chatId }}",
  "text": "Tasker przez Telegram\n\n/dzisiaj — zadania na dziś\n/jutro — zadania z terminem na jutro\n/zalegle — zadania po terminie\n/zadania — zadania firmowe i prywatne z podziałem na kategorie\n/notatka TREŚĆ — zapisz prywatną notatkę\n/dodaj — pełna instrukcja tworzenia zadań\n/pomoc — wszystkie możliwości\n\nObsługa istniejących zadań: możesz napisać lub nagrać: oznacz raport jako zrobiony, przełóż raport na poniedziałek 9:00, dodaj Michała do zadania z Polcardem albo przekaż raport Michałowi. Zmiany zawsze potwierdzasz przyciskiem.\n\nNotatki są osobnym modułem. Zapiszesz je przez /notatka TREŚĆ, „dodaj do notatek…” albo „zapisz w notatkach…”.\n\nUstawienia: https://tasker.dpkomis.pl/settings",
  "additionalFields": {
    "appendAttribution": false,
    "disable_web_page_preview": true
  }
},
    credentials: {
  "telegramApi": {
    "id": "5IbWlDjmEVAQkvzT",
    "name": "Tasker Telegram Bot"
  }
},
  },
  output: [{ ok: true, result: { message_id: 16 } }],
});

const addHelpReply = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Pokaż instrukcję dodawania",
    parameters: {
  "chatId": "={{ $json.chatId }}",
  "text": "Jak dodać zadanie w Taskerze\n\nNapisz albo nagraj polecenie zwykłym językiem. Podaj tyle informacji, ile znasz: co trzeba zrobić, kto ma to wykonać, termin, godzinę, priorytet i ewentualnie komu zadanie udostępnić.\n\nPrzykłady:\n• Dodaj zadanie firmowe wysłać raport jutro o 14:00.\n• Dodaj prywatne zadanie kupić prezent w piątek o 10:30.\n• Dodaj dla Michała zadanie firmowe oddzwonić do klienta w piątek o 10:30.\n• Dodaj zadanie sprawdzić faktury za godzinę i udostępnij je Michałowi.\n• Dodaj dla Michała zadanie przygotować ofertę do poniedziałku i udostępnij je Pawłowi.\n• Dodaj pilne zadanie żebym dziś zadzwonił do księgowej.\n\nWykonawca a udostępnienie:\n• Wykonawca odpowiada za realizację. Zwroty „dla Michała”, „Michał ma” albo „niech Michał” wskazują Michała jako wykonawcę.\n• Zwroty „żebym”, „abym” i „bym” oznaczają Ciebie jako wykonawcę.\n• „Udostępnij Michałowi” daje Michałowi dostęp, ale nie zmienia wykonawcy. Możesz jednocześnie wskazać innego wykonawcę i inną osobę do udostępnienia.\n• Klient, odbiorca telefonu lub adresat wiadomości nie staje się automatycznie wykonawcą.\n\nRodzaj, dostęp i priorytet:\n• Napisz „zadanie firmowe” albo „zadanie prywatne”. Bez wskazania rodzaju zadanie będzie prywatne.\n• Rodzaj określa sekcję na listach. Dostęp jest osobną decyzją: zadanie może być udostępnione osobie bez zmiany jego rodzaju.\n• Słowa „pilne” i „natychmiast” ustawiają priorytet pilny; możesz też podać niski lub wysoki priorytet.\n\nPrzed zapisem bot pokaże osobno tytuł, rodzaj, wykonawcę, odbiorcę udostępnienia, termin, priorytet i dostęp. Kompletny szkic nowego zadania możesz zatwierdzić lub anulować przyciskiem; bez reakcji zostanie zapisany automatycznie po 10 minutach. Niejasna osoba, data albo dostęp zawsze wymaga doprecyzowania.",
  "additionalFields": {
    "appendAttribution": false,
    "disable_web_page_preview": true
  }
},
    credentials: {
  "telegramApi": {
    "id": "5IbWlDjmEVAQkvzT",
    "name": "Tasker Telegram Bot"
  }
},
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
    isPrivateChat.onTrue(isVoiceMessage
      .onTrue(downloadVoiceMessage.to(transcribeVoiceMessage).to(commandFlow))
      .onFalse(commandFlow)),
  );
