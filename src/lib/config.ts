import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface AthrConfig {
  dir?: string;
  port?: number;
}

function getConfigPath(): string {
  const configHome =
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(configHome, "athr", "config.json");
}

export function readConfig(): AthrConfig {
  const configPath = getConfigPath();
  try {
    if (!fs.existsSync(configPath)) return {};
    const content = fs.readFileSync(configPath, "utf8");
    return JSON.parse(content) as AthrConfig;
  } catch {
    return {};
  }
}

export function writeConfig(config: AthrConfig): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function updateConfig(key: string, value: unknown): void {
  const current = readConfig();
  const updated = { ...current, [key]: value };
  writeConfig(updated);
}
