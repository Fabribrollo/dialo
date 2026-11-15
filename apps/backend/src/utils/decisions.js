import { env } from '../config/env.js';

const URL_DECISIONS = 'https://api.openai.com/v1/decisions';
const MODEL = 'gpt-6-luna';

export async function askDecisions(input, questions) {
  if (!env.openaiApiKey) return null;
  try {
    const response = await fetch(URL_DECISIONS, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, input, questions }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      console.error('Decisions respondió', response.status);
      return null;
    }
    const { answers } = await response.json();
    const resultado = Object.fromEntries(answers.map((answer) => [answer.name, answer.probability ?? null]));
    if (!env.isProduction) console.log('Decisions', resultado);
    return resultado;
  } catch (error) {
    console.error('Decisions falló', error.message);
    return null;
  }
}