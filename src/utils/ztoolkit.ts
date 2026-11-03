import { BasicTool } from "zotero-plugin-toolkit";
import { config } from "../../package.json";

export function createZToolkit() {
  // Spotlight uses only global access and logging.
  const toolkit = new BasicTool();
  toolkit.basicOptions.log.prefix = `[${config.addonName}]`;
  toolkit.basicOptions.log.disableConsole = __env__ === "production";
  toolkit.basicOptions.api.pluginID = config.addonID;
  return toolkit;
}
