/**
 * AI Service using Cloudflare Workers AI
 * Generates natural language monthly financial summaries using Llama 2.
 *
 * Requirements: 12.5
 */

import { Ai } from '@cloudflare/workers-types';
import { RequestType } from '../types';

/** Monthly report data passed to the AI for summary generation */
export interface MonthlyReportData {
  /** Month being summarized, e.g. "January 2025" */
  month: string;
  /** Total number of requests submitted in the period */
  totalRequests: number;
  /** Number of requests approved (status APPROVED or beyond) */
  totalApproved: number;
  /** Number of requests rejected */
  totalRejected: number;
  /** Total amount disbursed (KES) */
  totalDisbursed: number;
  /** Total amount received / collected (KES) */
  totalReceived: number;
  /** Breakdown of request counts by type */
  requestsByType: Partial<Record<RequestType, number>>;
  /** Breakdown of disbursed amounts by type (KES) */
  amountsByType: Partial<Record<RequestType, number>>;
  /** Optional list of anomalies or flags detected during the period */
  anomalies?: string[];
}

/** Primary model — Llama 2 7B chat (quantised) */
const PRIMARY_MODEL = '@cf/meta/llama-2-7b-chat-int8';
/** Fallback model if the primary is unavailable */
const FALLBACK_MODEL = '@cf/meta/llama-3-8b-instruct';

/**
 * Build a structured prompt for the AI model from the monthly report data.
 */
function buildPrompt(stats: MonthlyReportData): string {
  const typeBreakdown = Object.entries(stats.requestsByType)
    .map(([type, count]) => {
      const amount = stats.amountsByType?.[type as RequestType] ?? 0;
      const label = type.replace(/_/g, ' ').toLowerCase();
      return `  - ${label}: ${count} request(s), KES ${amount.toLocaleString()}`;
    })
    .join('\n');

  const anomalySection =
    stats.anomalies && stats.anomalies.length > 0
      ? `\nAnomalies / flags detected:\n${stats.anomalies.map((a) => `  - ${a}`).join('\n')}`
      : '\nNo anomalies detected.';

  return `You are a financial reporting assistant for an orphanage management system.
Write a concise, professional monthly financial summary for ${stats.month} based on the data below.
The summary should be 3-5 sentences, suitable for a public transparency report.

Financial data for ${stats.month}:
- Total requests submitted: ${stats.totalRequests}
- Requests approved: ${stats.totalApproved}
- Requests rejected: ${stats.totalRejected}
- Total funds received: KES ${stats.totalReceived.toLocaleString()}
- Total funds disbursed: KES ${stats.totalDisbursed.toLocaleString()}

Breakdown by request type:
${typeBreakdown || '  - No breakdown available'}
${anomalySection}

Write only the summary paragraph. Do not include headings, bullet points, or extra commentary.`;
}

/**
 * Generate a natural language monthly financial summary using Cloudflare Workers AI.
 *
 * Falls back to a pre-formatted text summary if the AI call fails.
 *
 * @param ai   - Cloudflare AI binding from the Worker environment
 * @param stats - Monthly report data to summarise
 * @returns A natural language summary string
 */
export async function generateMonthlySummary(ai: Ai, stats: MonthlyReportData): Promise<string> {
  const prompt = buildPrompt(stats);

  // Try primary model first, then fallback
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      const response = await (ai.run as Function)(model, {
        messages: [
          {
            role: 'system',
            content:
              'You are a concise financial reporting assistant. Respond with a single paragraph summary only.',
          },
          { role: 'user', content: prompt },
        ],
      });

      const text: string | undefined =
        typeof response === 'object' && response !== null && 'response' in response
          ? (response as { response: string }).response
          : undefined;

      if (text && text.trim().length > 0) {
        return text.trim();
      }
    } catch (err) {
      console.error(`AI model ${model} failed:`, err);
      // Continue to next model / fallback
    }
  }

  // Graceful fallback — return a structured text summary without AI
  return buildFallbackSummary(stats);
}

/**
 * Build a plain-text fallback summary when AI is unavailable.
 */
function buildFallbackSummary(stats: MonthlyReportData): string {
  const approvalRate =
    stats.totalRequests > 0
      ? Math.round((stats.totalApproved / stats.totalRequests) * 100)
      : 0;

  const topType = Object.entries(stats.requestsByType).sort(
    ([, a], [, b]) => (b ?? 0) - (a ?? 0)
  )[0];

  const topTypeLabel = topType
    ? topType[0].replace(/_/g, ' ').toLowerCase()
    : 'general';

  const anomalyNote =
    stats.anomalies && stats.anomalies.length > 0
      ? ` ${stats.anomalies.length} anomaly(ies) were flagged for review.`
      : '';

  return (
    `In ${stats.month}, the orphanage received ${stats.totalRequests} financial assistance request(s), ` +
    `of which ${stats.totalApproved} were approved (${approvalRate}% approval rate) and ` +
    `${stats.totalRejected} were rejected. ` +
    `A total of KES ${stats.totalDisbursed.toLocaleString()} was disbursed out of ` +
    `KES ${stats.totalReceived.toLocaleString()} received. ` +
    `The most common request category was ${topTypeLabel}.` +
    anomalyNote
  );
}
