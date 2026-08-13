// Shared question-list schema, used by survey-questions.mjs (manages the
// list), survey-response.mjs (validates answers against it), and
// survey-export.mjs (builds CSV headers from it). Kept in one place so
// all three agree on what a "question" looks like and what the default
// survey was before Super Admin ever touched it.

export const QUESTIONS_KEY = "questions";
export const TYPES = new Set(["rating", "text"]);
export const LABEL_MAX = 150;
export const MAX_QUESTIONS = 20;

// The original hardcoded 5-question survey, now just the seed data —
// Super Admin can add, hide, edit, delete, or reorder from here.
export const DEFAULT_QUESTIONS = [
  { id: "q1", type: "rating", label: "How would you rate the session?", required: true, hidden: false },
  { id: "q2", type: "rating", label: "How would you rate the speaker?", required: true, hidden: false },
  { id: "q3", type: "text", label: "What did you enjoy most?", required: false, hidden: false },
  { id: "q4", type: "text", label: "What have you learned?", required: false, hidden: false },
  { id: "q5", type: "text", label: "What could we improve?", required: false, hidden: false },
];

export async function readQuestions(store) {
  const list = await store.get(QUESTIONS_KEY, { type: "json" });
  // Nothing saved yet — hand back a fresh copy of the seed data without
  // writing it, same pattern as feature.mjs/sessions.mjs. The first real
  // admin mutation (add/edit/hide/delete/reorder) is what persists it.
  return Array.isArray(list) ? list : JSON.parse(JSON.stringify(DEFAULT_QUESTIONS));
}
