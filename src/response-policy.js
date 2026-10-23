
const ABSOLUTE_MAX_WORDS = 200;
const DEFAULT_MAX_WORDS = 200;

const configuredMaxWords = Number(process.env.MAX_RESPONSE_WORDS);

export const MAX_RESPONSE_WORDS =
  Number.isInteger(configuredMaxWords) && configuredMaxWords > 0
    ? Math.min(configuredMaxWords, ABSOLUTE_MAX_WORDS)
    : DEFAULT_MAX_WORDS;

function wordsIn(text) {
  return text.match(/\S+/g) || [];
}

export function enforceResponseLimit(text, maxWords = MAX_RESPONSE_WORDS) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("The assistant returned an empty response.");
  }

  const response = text.trim();
  const wordLimit =
    Number.isInteger(maxWords) && maxWords > 0
      ? Math.min(maxWords, ABSOLUTE_MAX_WORDS)
      : DEFAULT_MAX_WORDS;

  const words = wordsIn(response);

  if (words.length <= wordLimit) {
    return response;
  }

  const shortened = words.slice(0, wordLimit).join(" ");
  const sentenceEnd = Math.max(
    shortened.lastIndexOf("."),
    shortened.lastIndexOf("!"),
    shortened.lastIndexOf("?")
  );

  return (
    sentenceEnd > 0
      ? shortened.slice(0, sentenceEnd + 1)
      : shortened
  ).trim();
}
