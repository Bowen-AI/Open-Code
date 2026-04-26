import { workspace, WorkspaceConfiguration } from "vscode";
import { MemoryClient } from "../memoryClient";
import { MemoryKind } from "../types";
import { GemmaLocalProvider } from "../providers/gemmaLocal";
import { getProjectId, getSessionId } from "../util/projectId";

export interface MindsetToggles {
  qa: boolean;
  test: boolean;
  scalability: boolean;
  faultTolerance: boolean;
}

function readToggles(cfg: WorkspaceConfiguration): MindsetToggles {
  return {
    qa: cfg.get("mindset.qa", true),
    test: cfg.get("mindset.test", true),
    scalability: cfg.get("mindset.scalability", true),
    faultTolerance: cfg.get("mindset.faultTolerance", true)
  };
}

/**
 * On prompt / after edits / on commit: run enabled "mindset" self-critique stubs and log to memory.
 */
export class Discriminator {
  constructor(
    private mem: MemoryClient,
    private llm: GemmaLocalProvider
  ) {}

  async onPrompt(userText: string, phase: "prompt"): Promise<void> {
    await this.run("user prompt", userText, phase, readToggles(workspace.getConfiguration("openCode")));
  }

  async onProposedEdits(
    description: string,
    phase: "edits"
  ): Promise<void> {
    await this.run("proposed edits", description, phase, readToggles(workspace.getConfiguration("openCode")));
  }

  async onCommit(message: string, phase: "commit"): Promise<void> {
    await this.run("commit", message, phase, readToggles(workspace.getConfiguration("openCode")));
  }

  private async run(
    label: string,
    text: string,
    phase: "prompt" | "edits" | "commit",
    toggles: MindsetToggles
  ): Promise<void> {
    const projectId = getProjectId();
    const sessionId = getSessionId();
    const enabled: string[] = [];
    if (toggles.qa) {
      enabled.push("QA");
    }
    if (toggles.test) {
      enabled.push("Test");
    }
    if (toggles.scalability) {
      enabled.push("Scalability");
    }
    if (toggles.faultTolerance) {
      enabled.push("FaultTolerance");
    }
    if (enabled.length === 0) {
      await this.mem.appendRaw({
        projectId,
        sessionId,
        kind: "discriminator" as MemoryKind,
        payload: { phase, skipped: "no mindsets enabled" }
      });
      return;
    }
    const system = `You are a concise engineering critic. For each enabled area (${enabled.join(
      ", "
    )}), output one line: AREA: one sentence review or 'ok'. If area is not in the list, do not cover it.`;
    let out: string;
    try {
      out = await this.llm.complete(
        [
          { role: "system", content: system },
          { role: "user", content: `${label} [${phase}]:\n${text.slice(0, 12_000)}` }
        ]
      );
    } catch (e) {
      out = `LLM offline or error: ${(e as Error).message} — log only.`;
    }
    const rawRow = await this.mem.appendRaw({
      projectId,
      sessionId,
      kind: "discriminator" as MemoryKind,
      payload: { phase, label, enabledMindsets: enabled, textPreview: text.slice(0, 2000) }
    });
    await this.mem.appendSemantic({
      projectId,
      kind: "critic_summary",
      body: { phase, text: out },
      sourceRawIds: [rawRow.id]
    });
  }
}
