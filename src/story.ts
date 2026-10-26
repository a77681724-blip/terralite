// src/story.ts — Chapter II «Долг света» / "The Debt of Light" scene data.
// Every line references an i18n key so all three languages stay in sync.

export type Speaker = "narrator" | "mira" | "crown" | "collector" | "first" | "heir" | "warden";
export type ActKey = "c2_act1" | "c2_act2" | "c2_act3";

export interface StoryLine {
  who: Speaker;
  key: string;
  /** shown only when the heir is fully trusted (secret ending path) */
  when?: "dawn" | "default";
}

export interface StoryScene {
  act: ActKey;
  lines: StoryLine[];
  final?: boolean;
}

export const SPEAKERS: Record<Speaker, { nameKey: string; icon: string; color: string }> = {
  narrator: { nameKey: "", icon: "", color: "#cbd5e1" },
  mira: { nameKey: "c2_sp_mira", icon: "📖", color: "#fcd34d" },
  crown: { nameKey: "c2_sp_crown", icon: "👑", color: "#86efac" },
  collector: { nameKey: "c2_sp_collector", icon: "⚖️", color: "#c4b5fd" },
  first: { nameKey: "c2_sp_first", icon: "🛡️", color: "#93c5fd" },
  heir: { nameKey: "c2_sp_heir", icon: "🟢", color: "#a7f3d0" },
  warden: { nameKey: "c2_sp_warden", icon: "⛏️", color: "#fde68a" },
};

export const SCENES: Record<string, StoryScene> = {
  c2_intro: {
    act: "c2_act1",
    lines: [
      { who: "narrator", key: "c2_intro_1" },
      { who: "crown", key: "c2_intro_2" },
      { who: "mira", key: "c2_intro_3" },
      { who: "mira", key: "c2_intro_4" },
      { who: "crown", key: "c2_intro_5" },
      { who: "mira", key: "c2_intro_6" },
      { who: "warden", key: "c2_intro_7" },
      { who: "mira", key: "c2_intro_8" },
    ],
  },
  c2_act2: {
    act: "c2_act2",
    lines: [
      { who: "crown", key: "c2_act2_1" },
      { who: "mira", key: "c2_act2_2" },
      { who: "mira", key: "c2_act2_3" },
      { who: "collector", key: "c2_act2_4" },
      { who: "mira", key: "c2_act2_5" },
    ],
  },
  c2_shard1: {
    act: "c2_act2",
    lines: [
      { who: "narrator", key: "c2_shard1_1" },
      { who: "first", key: "c2_shard1_2" },
      { who: "first", key: "c2_shard1_3" },
      { who: "crown", key: "c2_shard1_4" },
      { who: "mira", key: "c2_shard1_5" },
    ],
  },
  c2_shard2: {
    act: "c2_act2",
    lines: [
      { who: "crown", key: "c2_shard2_1" },
      { who: "collector", key: "c2_shard2_2" },
      { who: "crown", key: "c2_shard2_3" },
      { who: "mira", key: "c2_shard2_4" },
      { who: "first", key: "c2_shard2_5" },
    ],
  },
  c2_shard3: {
    act: "c2_act2",
    lines: [
      { who: "narrator", key: "c2_shard3_1" },
      { who: "mira", key: "c2_shard3_2" },
      { who: "first", key: "c2_shard3_3" },
      { who: "collector", key: "c2_shard3_4" },
      { who: "mira", key: "c2_shard3_5" },
      { who: "crown", key: "c2_shard3_6" },
    ],
  },
  c2_final: {
    act: "c2_act3",
    final: true,
    lines: [
      { who: "narrator", key: "c2_final_1" },
      { who: "collector", key: "c2_final_2" },
      { who: "mira", key: "c2_final_3" },
      { who: "collector", key: "c2_final_4" },
      { who: "collector", key: "c2_final_5" },
      { who: "mira", key: "c2_final_6", when: "dawn" },
      { who: "mira", key: "c2_final_6_default", when: "default" },
      { who: "narrator", key: "c2_final_7" },
    ],
  },
};

/** Trust required (gel fed) to unlock the secret third ending. */
export const SECRET_TRUST = 15;

export type EndingId = "crown" | "debt" | "dawn";

export interface FinalChoice {
  id: EndingId;
  icon: string;
  titleKey: string;
  descKey: string;
  accent: string;
  secret?: boolean;
}

export const FINAL_CHOICES: FinalChoice[] = [
  { id: "crown", icon: "👑", titleKey: "c2_choice_crown", descKey: "c2_choice_crown_d", accent: "#fbbf24" },
  { id: "debt", icon: "🌑", titleKey: "c2_choice_debt", descKey: "c2_choice_debt_d", accent: "#a78bfa" },
  { id: "dawn", icon: "🌅", titleKey: "c2_choice_dawn", descKey: "c2_choice_dawn_d", accent: "#38bdf8", secret: true },
];

export interface EndingDef {
  icon: string;
  titleKey: string;
  lines: string[];
  accent: string;
  glow: string;
  background: string;
}

export const ENDINGS: Record<EndingId, EndingDef> = {
  crown: {
    icon: "👑",
    titleKey: "c2_end_crown_title",
    accent: "#fbbf24",
    glow: "rgba(251,191,36,0.35)",
    background: "radial-gradient(circle at 50% 35%, rgba(180,140,40,0.35), rgba(7,10,18,0.97))",
    lines: ["c2_end_crown_1", "c2_end_crown_2", "c2_end_crown_3", "c2_end_crown_4", "c2_end_crown_5", "c2_end_crown_6"],
  },
  debt: {
    icon: "🌑",
    titleKey: "c2_end_debt_title",
    accent: "#c4b5fd",
    glow: "rgba(167,139,250,0.35)",
    background: "radial-gradient(circle at 50% 35%, rgba(80,70,140,0.45), rgba(7,10,18,0.97))",
    lines: ["c2_end_debt_1", "c2_end_debt_2", "c2_end_debt_3", "c2_end_debt_4", "c2_end_debt_5", "c2_end_debt_6"],
  },
  dawn: {
    icon: "🌅",
    titleKey: "c2_end_dawn_title",
    accent: "#7dd3fc",
    glow: "rgba(56,189,248,0.35)",
    background: "radial-gradient(circle at 50% 35%, rgba(255,170,90,0.32), rgba(20,60,110,0.55), rgba(7,10,18,0.97))",
    lines: ["c2_end_dawn_1", "c2_end_dawn_2", "c2_end_dawn_3", "c2_end_dawn_4", "c2_end_dawn_5", "c2_end_dawn_6"],
  },
};
