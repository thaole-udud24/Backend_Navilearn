const { GoogleGenerativeAI } = require('@google/generative-ai');
const env = require('../../config/env');

// Falls back to a deterministic stub when no key is configured, so dev/CI never needs a real key.
let client = null;
function getClient() {
  if (!env.GEMINI_API_KEY) return null;
  if (!client) client = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  return client;
}

async function ask(prompt) {
  const genAI = getClient();
  if (!genAI) return { answer: `AI stub response for: ${prompt}` };

  const model = genAI.getGenerativeModel({ model: env.GEMINI_MODEL });
  const result = await model.generateContent(prompt);
  return { answer: result.response.text() };
}

module.exports = { ask };
