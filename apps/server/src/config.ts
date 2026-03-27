import dotenv from "dotenv";

import { parseServerEnv } from "@personal-ai/shared";

dotenv.config();

export const env = parseServerEnv(process.env);
