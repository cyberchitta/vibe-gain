import path from "path";
import dotenv from "dotenv";

dotenv.config();

export const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
export const DEFAULT_PARAMETERS_FILE = path.join(
  process.cwd(),
  "parameters.json"
);
export const OUTPUT_DIR = path.join(process.cwd(), "output");
export const DATA_DIR = path.join(process.cwd(), "data");
