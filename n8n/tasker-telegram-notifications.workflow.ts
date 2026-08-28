import { expr, newCredential, node, trigger, workflow } from "@n8n/workflow-sdk";

const everyMinute = trigger({
  type: "n8n-nodes-base.scheduleTrigger",
  version: 1.3,
  config: {
    name: "Co minutę",
    parameters: {
      rule: { interval: [{ field: "minutes", minutesInterval: 1 }] },
    },
    position: [0, 240],
  },
  output: [{ timestamp: "2026-08-28T21:00:00.000Z" }],
});

const claimDeliveries = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Pobierz dostawy z Taskera",
    parameters: {
      method: "POST",
      url: "https://tasker.dpkomis.pl/api/integrations/notifications/telegram/claim",
      authentication: "genericCredentialType",
      genericAuthType: "httpBearerAuth",
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr("{{ { limit: 20 } }}"),
      options: { response: { response: { responseFormat: "json" } } },
    },
    credentials: { httpBearerAuth: newCredential("Tasker API") },
    position: [256, 240],
  },
  output: [{ deliveries: [{ deliveryId: "00000000-0000-0000-0000-000000000000", chatId: "123456789", text: "Przypomnienie" }] }],
});

const splitDeliveries = node({
  type: "n8n-nodes-base.splitOut",
  version: 1,
  config: {
    name: "Rozdziel dostawy",
    parameters: {
      fieldToSplitOut: "deliveries",
      include: "noOtherFields",
      options: {},
    },
    position: [512, 240],
  },
  output: [{ deliveryId: "00000000-0000-0000-0000-000000000000", chatId: "123456789", text: "Przypomnienie" }],
});

const sendTelegram = node({
  type: "n8n-nodes-base.telegram",
  version: 1.2,
  config: {
    name: "Wyślij przypomnienie",
    parameters: {
      resource: "message",
      operation: "sendMessage",
      chatId: expr("{{ $json.chatId }}"),
      text: expr("{{ $json.text }}"),
      additionalFields: { appendAttribution: false, disable_web_page_preview: true },
    },
    credentials: { telegramApi: newCredential("Tasket Telegram Bot") },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2_000,
    position: [768, 240],
  },
  output: [{ ok: true, result: { message_id: 1 } }],
});

const confirmDelivery = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Potwierdź dostawę w Taskerze",
    parameters: {
      method: "POST",
      url: "https://tasker.dpkomis.pl/api/integrations/notifications/telegram/result",
      authentication: "genericCredentialType",
      genericAuthType: "httpBearerAuth",
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr('{{ { deliveryId: $("Rozdziel dostawy").item.json.deliveryId, success: true } }}'),
      options: { response: { response: { responseFormat: "json" } } },
    },
    credentials: { httpBearerAuth: newCredential("Tasker API") },
    position: [1024, 240],
  },
  output: [{ status: "SENT" }],
});

export default workflow("tasker-telegram-notifications", "Tasker — przypomnienia Telegram")
  .add(everyMinute)
  .to(claimDeliveries)
  .to(splitDeliveries)
  .to(sendTelegram)
  .to(confirmDelivery)
  .group("Dostawa przypomnień", [claimDeliveries, splitDeliveries, sendTelegram, confirmDelivery], {
    description: "Pobiera gotowe komunikaty z Taskera, wysyła je przez Telegram i potwierdza dostawę.",
  });
