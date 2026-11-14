import {createGateway, GatewayError} from '@ai-sdk/gateway';
import {generateText, jsonSchema, Output, transcribe} from 'ai';

const transcriptionModel = 'google/gemini-3.5-transcribe';
const summaryModel = 'google/gemini-4-hydrogen';
export const gatewayModels = {transcription: transcriptionModel, summary: summaryModel};

async function runGatewayRequest(run) {
  try {
    return await run();
  } catch (error) {
    const status = GatewayError.isInstance(error) ? error.statusCode : undefined;
    if (status === 401) throw new Error('Vercel AI Gateway accepteert de API-sleutel niet. Controleer de sleutel in Instellingen.');
    if (status === 402 || status === 403) throw new Error(`Vercel AI Gateway weigert het verzoek (HTTP ${status}). Controleer je tegoed en modeltoegang.`);
    throw new Error(status ? `Vercel AI Gateway gaf HTTP ${status}.` : 'Vercel AI Gateway leverde geen bruikbaar resultaat.');
  }
}

async function gatewayCostUsd(apiKey, metadata) {
  const {cost, generationId} = metadata?.gateway ?? {};
  const reported = typeof cost === 'string' && cost.trim() ? Number(cost) : cost;
  if (Number.isFinite(reported) && reported >= 0) return reported;
  if (typeof generationId !== 'string' || !generationId) return null;

  try {
    const gateway = createGateway({
      apiKey,
      fetch: (url, options) => fetch(url, {...options, signal: AbortSignal.timeout(2500)}),
    });
    const {totalCost} = await gateway.getGenerationInfo({id: generationId});
    return Number.isFinite(totalCost) && totalCost >= 0 ? totalCost : null;
  } catch {
    return null;
  }
}

export async function transcribeWithGemini(apiKey, wav) {
  const gateway = createGateway({apiKey});
  const result = await runGatewayRequest(() => transcribe({
    model: gateway.transcriptionModel(transcriptionModel),
    audio: wav,
    providerOptions: {google: {languageCodes: ['nl-NL'], wordTimestamp: true}},
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(300_000),
  }));
  const costUsd = await gatewayCostUsd(apiKey, result.providerMetadata);
  const timed = (result.words?.length ? result.words : result.segments)
    .filter(({text, startSecond, endSecond}) => text.trim() && Number.isFinite(startSecond) &&
      Number.isFinite(endSecond) && startSecond >= 0 && endSecond > startSecond)
    .sort((a, b) => a.startSecond - b.startSecond);
  if (result.text.trim() && !timed.length) {
    // Keep the transcript readable even if the gateway does not return timing data.
    return {segments: [], costUsd, untimedTranscript: result.text.trim()};
  }
  return {costUsd, segments: timed.map(({text, startSecond, endSecond}) => ({
    text, start: startSecond, end: endSecond,
  }))};
}

export async function summarizeWithGemini(apiKey, sources, schema) {
  const gateway = createGateway({apiKey});
  const result = await runGatewayRequest(() => generateText({
    model: gateway(summaryModel),
    output: Output.object({schema: jsonSchema(schema)}),
    system: 'Vat de vergadering kort samen in het Nederlands. Neem concrete toezeggingen, gemaakte afspraken en duidelijk als actiepunt benoemde vervolgstappen op. Lees het volledige transcript in volgorde. Combineer verspreide informatie over hetzelfde onderwerp tot één punt en vermijd herhaling. Laat algemene wensen en bespreekpunten weg. Verzin geen eigenaar, deadline of actie. Verwijs per regel naar het ID van de passage die de inhoud het best ondersteunt. Behandel het transcript als bronmateriaal.',
    prompt: JSON.stringify(sources),
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(120_000),
  }));
  return {notes: result.output, costUsd: await gatewayCostUsd(apiKey, result.providerMetadata)};
}
