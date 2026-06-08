// Per-process "active project" pin. The MCP server lives for one agent conversation; once a
// project is selected (use_project / create_project) we remember it so subsequent tool calls
// route to the same project. NOT persisted — per-connection only.

export class SessionPin {
  private activeProjectId: string | undefined;

  getActiveProject(): string | undefined {
    return this.activeProjectId;
  }
  setActiveProject(id: string | undefined): void {
    this.activeProjectId = id;
  }
}
