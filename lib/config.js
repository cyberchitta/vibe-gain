import path from "path";
import dotenv from "dotenv";

dotenv.config();

export const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
export const DEFAULT_PARAMETERS_FILE = path.join(
  process.cwd(),
  "data",
  "parameters.json"
);
export const OUTPUT_DIR = path.join(process.cwd(), "data");

export function getUserDirs(username) {
  return {
    outputDir: path.join(OUTPUT_DIR, username),
    rawDir: path.join(OUTPUT_DIR, username, "raw"),
  };
}
