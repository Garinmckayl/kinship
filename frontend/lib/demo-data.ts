export const MEDS = [
  { id: "lisinopril-am", name: "Lisinopril 10mg", time: "09:00", label: "morning pill" },
  { id: "metformin-lunch", name: "Metformin 500mg", time: "13:00", label: "lunch pill" },
  { id: "vitamin-d-lunch", name: "Vitamin D 2000 IU", time: "13:00", label: "lunch supplement" },
  { id: "atorvastatin-pm", name: "Atorvastatin 20mg", time: "21:00", label: "night pill" },
];

export const MEMORIES = [
  { id: "m1", title: "1959 wedding photo", note: "Dancing with Henry at the town hall. Eleanor lights up talking about the band." },
  { id: "m2", title: "Grandson Leo's graduation", note: "Leo graduated 2023. Eleanor keeps the photo by the TV." },
  { id: "m3", title: "Garden roses", note: "Eleanor grew prize roses for 20 years. Smell of roses calms her." },
];

type Escalation = { level: string; message: string; time: string };
type UserState = { intakes: Record<string, string>; moods: { mood: string; note: string; at: string }[]; escalations: Escalation[] };

// In-memory store for demo (swap to DynamoDB / Bedrock AgentCore session store in prod).
// NOTE: serverlessFF — resets on cold start. Fine for hackathon demo.
export const STATE: Record<string, UserState> = {
  "eleanor-79": {
    intakes: {},
    moods: [],
    escalations: [{ level: "info", message: "Morning Lisinopril confirmed.", time: "9:02 AM" }],
  },
};

export function getState(userId: string): UserState {
  if (!STATE[userId]) STATE[userId] = { intakes: {}, moods: [], escalations: [] };
  return STATE[userId];
}
