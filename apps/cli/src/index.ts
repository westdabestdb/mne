import { cmdInstall, cmdUninstall } from "./install.js";
import { cmdAuth, cmdStatus } from "./auth.js";

export const VERSION = "0.1.0";

const HELP = `mnemia — portable, shareable memory for your AI coding agents

Usage: mnemia <command>

Commands:
  install      Wire the Mnemia MCP server into every detected agent (no credential needed yet)
  auth         Sign in via your browser and store the credential all agents share
  status       Show the API target and whether this machine is authenticated
  uninstall    Remove Mnemia from every agent config and clear the stored credential
  version      Print the CLI version
  help         Show this help

Typical first run:
  mnemia install   # done automatically by the installer
  mnemia auth      # approve in the browser — that's it
`;

export async function run(argv: string[]): Promise<number> {
  const cmd = argv[0];
  switch (cmd) {
    case "install":
      return cmdInstall();
    case "auth":
    case "login":
      return cmdAuth();
    case "status":
      return cmdStatus();
    case "uninstall":
    case "disconnect":
      return cmdUninstall();
    case "version":
    case "--version":
    case "-v":
      console.log(VERSION);
      return 0;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      console.log(HELP);
      return 0;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.log(HELP);
      return 1;
  }
}
