export const estimateModelCostUsd = (
  model: string,
  promptTokens: number,
  completionTokens: number
) => {
  const lower = model.toLowerCase();

  if (lower.includes("gpt-4o-mini")) {
    return promptTokens * 0.00000015 + completionTokens * 0.0000006;
  }

  if (lower.includes("gpt-4.1-mini")) {
    return promptTokens * 0.0000004 + completionTokens * 0.0000016;
  }

  if (lower.includes("gpt-4.1") || lower.includes("gpt-4o")) {
    return promptTokens * 0.0000025 + completionTokens * 0.00001;
  }

  if (lower.includes("gemini-2.5-flash") || lower.includes("gemini-2.0-flash")) {
    return promptTokens * 0.00000015 + completionTokens * 0.0000006;
  }

  if (lower.includes("gemini")) {
    return promptTokens * 0.00000035 + completionTokens * 0.0000014;
  }

  return 0;
};
