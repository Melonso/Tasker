import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Script } from "node:vm";

const sourcePath = resolve(process.argv[2] ?? "n8n/tasker-telegram-ai.workflow.ts");
const outputPath = resolve(process.argv[3] ?? ".tmp/tasker-telegram-ai.workflow.json");
const basePath = process.argv[4] ? resolve(process.argv[4]) : undefined;

const workflowModule = (await import(pathToFileURL(sourcePath).href)) as {
  default?: {
    toJSON(): unknown;
    validate(): {
      errors: Array<{ message: string }>;
      warnings: Array<{ message: string }>;
    };
  };
};

if (!workflowModule.default) {
  throw new Error(`Plik ${sourcePath} nie eksportuje domyślnego workflow.`);
}

const validation = workflowModule.default.validate();
if (validation.errors.length > 0) {
  throw new Error(validation.errors.map((issue) => issue.message).join("\n"));
}

for (const warning of validation.warnings) {
  console.warn(`Ostrzeżenie workflow: ${warning.message}`);
}

type WorkflowJson = {
  id?: string;
  name?: string;
  active?: boolean;
  settings?: Record<string, unknown>;
  nodes: Array<{
    name: string;
    type: string;
    credentials?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

let exportedWorkflow = workflowModule.default.toJSON() as WorkflowJson;
let output: WorkflowJson | WorkflowJson[] = exportedWorkflow;

for (const node of exportedWorkflow.nodes) {
  const jsCode = (node.parameters as { jsCode?: unknown } | undefined)?.jsCode;
  if (node.type === "n8n-nodes-base.code" && typeof jsCode === "string") {
    try {
      new Script(`(async () => {\n${jsCode}\n})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Niepoprawna składnia węzła Code „${node.name}”: ${message}`);
    }
  }
}

if (basePath) {
  const parsedBase = JSON.parse(await readFile(basePath, "utf8")) as WorkflowJson | WorkflowJson[];
  const baseWorkflow = Array.isArray(parsedBase) ? parsedBase[0] : parsedBase;

  if (!baseWorkflow?.nodes) {
    throw new Error(`Plik bazowy ${basePath} nie zawiera workflow.`);
  }

  const baseNodesByName = new Map(baseWorkflow.nodes.map((node) => [node.name, node]));
  const baseNodesByType = new Map<string, typeof baseWorkflow.nodes>();

  for (const node of baseWorkflow.nodes) {
    const nodes = baseNodesByType.get(node.type) ?? [];
    nodes.push(node);
    baseNodesByType.set(node.type, nodes);
  }

  exportedWorkflow = {
    ...baseWorkflow,
    ...exportedWorkflow,
    id: baseWorkflow.id,
    name: baseWorkflow.name ?? exportedWorkflow.name,
    active: baseWorkflow.active,
    settings: {
      ...(baseWorkflow.settings ?? {}),
      ...(exportedWorkflow.settings ?? {}),
    },
    nodes: exportedWorkflow.nodes.map((node) => {
      if (!Object.hasOwn(node, "credentials")) {
        return node;
      }

      const namedCredentials = baseNodesByName.get(node.name)?.credentials;
      if (namedCredentials && Object.keys(namedCredentials).length > 0) {
        return { ...node, credentials: namedCredentials };
      }

      const credentialsForType = (baseNodesByType.get(node.type) ?? [])
        .map((candidate) => candidate.credentials)
        .filter((credentials): credentials is Record<string, unknown> => Boolean(credentials && Object.keys(credentials).length));
      const uniqueCredentials = new Map(credentialsForType.map((credentials) => [JSON.stringify(credentials), credentials]));

      if (uniqueCredentials.size === 1) {
        return { ...node, credentials: uniqueCredentials.values().next().value };
      }

      return node;
    }),
  };
  output = [exportedWorkflow];
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

console.log(`Wyeksportowano workflow: ${outputPath}`);
