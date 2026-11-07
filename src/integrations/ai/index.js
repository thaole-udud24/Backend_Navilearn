// [ASSUMPTION] AI provider (RAG/question generation/essay feedback - module AIA/AIC) not specified; stub only.
async function ask(prompt) {
  return { answer: `AI stub response for: ${prompt}` };
}

module.exports = { ask };
