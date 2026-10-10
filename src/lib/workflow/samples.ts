import type { Workflow } from "./schema";

export interface SampleWorkflow {
  slug: string;
  summary: string;
  workflow: Workflow;
}

const FEEDBACK = `1. The new dashboard is fast and the filters are great. Thank you!
2. I was charged twice this month and support has not answered in four days. I need a refund today or I am cancelling.
3. The export button works, but the CSV headers are confusing.
4. Your mobile app keeps crashing when I upload photos. I lose my work every time.`;

export const feedbackTriage: SampleWorkflow = {
  slug: "feedback-triage",
  summary: "Classify customer feedback, flag urgent complaints, and write a short summary for a manager.",
  workflow: {
    version: 1,
    name: "Customer feedback triage",
    description: "Classifies sentiment, finds urgent complaints, drafts an escalation note only when needed, and summarizes.",
    steps: [
      { id: "start", name: "Manual trigger", type: "manual_trigger", config: {} },
      { id: "feedback", name: "Customer feedback", type: "text_input", config: { label: "Paste customer feedback", defaultValue: FEEDBACK, required: true } },
      {
        id: "classify",
        name: "Classify feedback",
        type: "ai_process",
        config: {
          prompt:
            'Classify each feedback item below. Respond with JSON only, in this shape: {"overall_sentiment":"positive|neutral|negative|mixed","urgent_count":<number>,"urgent_items":["short description"]}. An item is urgent if the customer reports being charged incorrectly, losing data, or threatens to cancel.\n\nFeedback:\n{{input}}',
          outputFormat: "json",
          maxTokens: 400,
        },
      },
      { id: "urgent_count", name: "Read urgent count", type: "transform", config: { operation: "extract_json_field", arg: "urgent_count", arg2: "" } },
      { id: "has_urgent", name: "Any urgent items?", type: "condition", config: { operator: "not_equals", value: "0", onFalse: "skip_next" } },
      {
        id: "escalate",
        name: "Draft escalation note",
        type: "ai_process",
        config: {
          prompt: "Write a short, factual escalation note (under 80 words) for the support lead about these urgent items:\n{{steps.classify}}",
          outputFormat: "text",
          maxTokens: 250,
        },
      },
      {
        id: "summary",
        name: "Write manager summary",
        type: "ai_process",
        config: {
          prompt:
            "Write a three-sentence summary for a support manager. Classification:\n{{steps.classify}}\n\nEscalation note (may be empty if nothing was urgent):\n{{steps.escalate}}",
          outputFormat: "text",
          maxTokens: 300,
        },
      },
    ],
  },
};

export const meetingNotes: SampleWorkflow = {
  slug: "meeting-notes",
  summary: "Turn raw meeting notes into decisions and action items.",
  workflow: {
    version: 1,
    name: "Meeting notes summarizer",
    description: "Extracts decisions and action items from pasted notes.",
    steps: [
      { id: "start", name: "Manual trigger", type: "manual_trigger", config: {} },
      { id: "notes", name: "Meeting notes", type: "text_input", config: { label: "Paste meeting notes", defaultValue: "", required: true } },
      {
        id: "extract",
        name: "Extract decisions and actions",
        type: "ai_process",
        config: { prompt: "From these meeting notes, list the decisions made and the action items with owners if mentioned. Be brief.\n\n{{input}}", outputFormat: "text", maxTokens: 500 },
      },
    ],
  },
};

export const leadQualification: SampleWorkflow = {
  slug: "lead-qualification",
  summary: "Score an inbound lead and stop early when it is not a fit.",
  workflow: {
    version: 1,
    name: "Lead qualification",
    description: "Scores a lead message as qualified or not, and drafts a reply only for qualified leads.",
    steps: [
      { id: "start", name: "Manual trigger", type: "manual_trigger", config: {} },
      { id: "lead", name: "Lead message", type: "text_input", config: { label: "Paste the lead's message", defaultValue: "", required: true } },
      {
        id: "score",
        name: "Score the lead",
        type: "ai_process",
        config: { prompt: 'Reply with exactly one word, "qualified" or "unqualified". A lead is qualified if it states a clear need and either a budget or a timeline.\n\n{{input}}', outputFormat: "text", maxTokens: 50 },
      },
      { id: "is_qualified", name: "Is the lead qualified?", type: "condition", config: { operator: "not_contains", value: "unqualified", onFalse: "stop" } },
      {
        id: "reply",
        name: "Draft a reply",
        type: "ai_process",
        config: { prompt: "Write a friendly, concise reply (under 100 words) to this lead, proposing a short call.\n\nLead message:\n{{steps.lead}}", outputFormat: "text", maxTokens: 300 },
      },
    ],
  },
};

export const SAMPLES: SampleWorkflow[] = [feedbackTriage, meetingNotes, leadQualification];
export const DEFAULT_SAMPLE = feedbackTriage;
