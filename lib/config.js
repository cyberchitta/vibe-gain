import dotenv from "dotenv";
dotenv.config();

export const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
export const OUTPUT_DIR = "./output";
export const DATA_DIR = "./data";
export const DEFAULT_PARAMETERS_FILE = "./parameters.json";
