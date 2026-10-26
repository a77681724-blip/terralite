// src/story.ts — Chapter II «Небесный оплот» / "The Skyhold" scene data.
// Every line references an i18n key so all three languages stay in sync.

export type Speaker = "narrator" | "mira" | "crown" | "collector" | "first" | "heir" | "warden" | "pell" | "auditor" | "storm";
export type ActKey = "c2_act1" | "c2_act2" | "c2_act3";

export interface StoryLine {
  who: Speaker;
  key: string;
}

export interface StoryScene {
  act: ActKey;
  lines: StoryLine[];
}

export const SPEAKERS: Record<Speaker, { nameKey: string; icon: string; color: string }> = {
  narrator: { nameKey: "", icon: "", color: "#cbd5e1" },
  mira: { nameKey: "c2_sp_mira", icon: "📖", color: "#fcd34d" },
  crown: { nameKey: "c2_sp_crown", icon: "👑", color: "#86efac" },
  collector: { nameKey: "c2_sp_collector", icon: "⚖️", color: "#c4b5fd" },
  first: { nameKey: "c2_sp_first", icon: "🛡️", color: "#93c5fd" },
  heir: { nameKey: "c2_sp_heir", icon: "🟢", color: "#a7f3d0" },
  warden: { nameKey: "c2_sp_warden", icon: "⛏️", color: "#fde68a" },
  pell: { nameKey: "c2_sp_pell", icon: "🟢", color: "#86efac" },
  auditor: { nameKey: "c2_sp_auditor", icon: "⚖️", color: "#f3d58a" },
  storm: { nameKey: "c2_sp_storm", icon: "🌩️", color: "#a5c9ff" },
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
  c2_heir_name: {
    act: "c2_act2",
    lines: [
      { who: "narrator", key: "c2_name_1" },
      { who: "heir", key: "c2_name_2" },
      { who: "mira", key: "c2_name_3" },
      { who: "crown", key: "c2_name_4" },
      { who: "pell", key: "c2_name_5" },
      { who: "narrator", key: "c2_name_6" },
    ],
  },
  c2_toll: {
    act: "c2_act2",
    lines: [
      { who: "narrator", key: "c2_toll_1" },
      { who: "collector", key: "c2_toll_2" },
      { who: "mira", key: "c2_toll_3" },
      { who: "warden", key: "c2_toll_4" },
      { who: "collector", key: "c2_toll_5" },
      { who: "mira", key: "c2_toll_6" },
    ],
  },
  c2_auditor: {
    act: "c2_act2",
    lines: [
      { who: "narrator", key: "c2_auditor_1" },
      { who: "auditor", key: "c2_auditor_2" },
      { who: "mira", key: "c2_auditor_3" },
      { who: "auditor", key: "c2_auditor_4" },
      { who: "narrator", key: "c2_auditor_5" },
    ],
  },
  c2_auditor_end: {
    act: "c2_act2",
    lines: [
      { who: "narrator", key: "c2_auditor_end_1" },
      { who: "mira", key: "c2_auditor_end_2" },
      { who: "crown", key: "c2_auditor_end_3" },
      { who: "collector", key: "c2_auditor_end_4" },
      { who: "pell", key: "c2_auditor_end_5" },
      { who: "mira", key: "c2_auditor_end_6" },
    ],
  },
  c2_undersky: {
    act: "c2_act2",
    lines: [
      { who: "narrator", key: "c2_undersky_1" },
      { who: "first", key: "c2_undersky_2" },
      { who: "mira", key: "c2_undersky_3" },
      { who: "collector", key: "c2_undersky_4" },
      { who: "crown", key: "c2_undersky_5" },
      { who: "pell", key: "c2_undersky_6" },
      { who: "mira", key: "c2_undersky_7" },
    ],
  },
  c2_chimes: {
    act: "c2_act2",
    lines: [
      { who: "narrator", key: "c2_chimes_1" },
      { who: "first", key: "c2_chimes_2" },
      { who: "crown", key: "c2_chimes_3" },
      { who: "mira", key: "c2_chimes_4" },
      { who: "collector", key: "c2_chimes_5" },
      { who: "narrator", key: "c2_chimes_6" },
    ],
  },
  c2_siege: {
    act: "c2_act2",
    lines: [
      { who: "narrator", key: "c2_siege_1" },
      { who: "collector", key: "c2_siege_2" },
      { who: "mira", key: "c2_siege_3" },
      { who: "crown", key: "c2_siege_4" },
      { who: "narrator", key: "c2_siege_5" },
    ],
  },
  c2_herald_intro: {
    act: "c2_act2",
    lines: [
      { who: "narrator", key: "c2_herald_intro_1" },
      { who: "collector", key: "c2_herald_intro_2" },
      { who: "mira", key: "c2_herald_intro_3" },
      { who: "warden", key: "c2_herald_intro_4" },
      { who: "narrator", key: "c2_herald_intro_5" },
    ],
  },
  c2_herald_end: {
    act: "c2_act2",
    lines: [
      { who: "narrator", key: "c2_herald_end_1" },
      { who: "crown", key: "c2_herald_end_2" },
      { who: "mira", key: "c2_herald_end_3" },
      { who: "pell", key: "c2_herald_end_4" },
      { who: "mira", key: "c2_herald_end_5" },
      { who: "collector", key: "c2_herald_end_6" },
    ],
  },
  c2_heir_trust: {
    act: "c2_act2",
    lines: [
      { who: "narrator", key: "c2_trust_1" },
      { who: "pell", key: "c2_trust_2" },
      { who: "crown", key: "c2_trust_3" },
      { who: "mira", key: "c2_trust_4" },
      { who: "pell", key: "c2_trust_5" },
      { who: "narrator", key: "c2_trust_6" },
    ],
  },
  c2_act3: {
    act: "c2_act3",
    lines: [
      { who: "narrator", key: "c2_act3_1" },
      { who: "mira", key: "c2_act3_2" },
      { who: "first", key: "c2_act3_3" },
      { who: "crown", key: "c2_act3_4" },
      { who: "warden", key: "c2_act3_5" },
      { who: "mira", key: "c2_act3_6" },
    ],
  },
  c2_stormfather: {
    act: "c2_act3",
    lines: [
      { who: "narrator", key: "c2_storm_1" },
      { who: "storm", key: "c2_storm_2" },
      { who: "first", key: "c2_storm_3" },
      { who: "storm", key: "c2_storm_4" },
      { who: "mira", key: "c2_storm_5" },
      { who: "narrator", key: "c2_storm_6" },
    ],
  },
  c2_stormfather_end: {
    act: "c2_act3",
    lines: [
      { who: "narrator", key: "c2_storm_end_1" },
      { who: "storm", key: "c2_storm_end_2" },
      { who: "first", key: "c2_storm_end_3" },
      { who: "storm", key: "c2_storm_end_4" },
      { who: "mira", key: "c2_storm_end_5" },
      { who: "pell", key: "c2_storm_end_6" },
      { who: "crown", key: "c2_storm_end_7" },
    ],
  },
  c2_witness: {
    act: "c2_act3",
    lines: [
      { who: "narrator", key: "c2_witness_1" },
      { who: "first", key: "c2_witness_2" },
      { who: "mira", key: "c2_witness_3" },
      { who: "crown", key: "c2_witness_4" },
      { who: "pell", key: "c2_witness_5" },
      { who: "mira", key: "c2_witness_6" },
    ],
  },
  c2_confession: {
    act: "c2_act3",
    lines: [
      { who: "narrator", key: "c2_confess_1" },
      { who: "mira", key: "c2_confess_2" },
      { who: "warden", key: "c2_confess_3" },
      { who: "mira", key: "c2_confess_4" },
      { who: "mira", key: "c2_confess_5" },
      { who: "pell", key: "c2_confess_6" },
      { who: "mira", key: "c2_confess_7" },
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
      { who: "collector", key: "c2_shard1_6" },
    ],
  },
  c2_shard2: {
    act: "c2_act2",
    lines: [
      { who: "crown", key: "c2_shard2_1" },
      { who: "collector", key: "c2_shard2_2" },
      { who: "crown", key: "c2_shard2_3" },
      { who: "first", key: "c2_shard2_4" },
      { who: "mira", key: "c2_shard2_5" },
      { who: "collector", key: "c2_shard2_6" },
    ],
  },
  c2_shard3: {
    act: "c2_act2",
    lines: [
      { who: "narrator", key: "c2_shard3_1" },
      { who: "first", key: "c2_shard3_2" },
      { who: "mira", key: "c2_shard3_3" },
      { who: "collector", key: "c2_shard3_4" },
      { who: "mira", key: "c2_shard3_5" },
      { who: "crown", key: "c2_shard3_6" },
    ],
  },
  c2_final: {
    act: "c2_act3",
    lines: [
      { who: "narrator", key: "c2_final_1" },
      { who: "mira", key: "c2_final_2" },
      { who: "warden", key: "c2_final_3" },
      { who: "mira", key: "c2_final_4" },
      { who: "collector", key: "c2_final_5" },
      { who: "mira", key: "c2_final_6" },
      { who: "pell", key: "c2_final_8" },
      { who: "narrator", key: "c2_final_7" },
    ],
  },
};

/** Trust required by the heir's chapter-XXIX quest. */
export const SECRET_TRUST = 15;

export type EndingId = "crown" | "debt" | "dawn";

/** The single ending Chapter II now leads to. */
export const CHAPTER2_ENDING: EndingId = "dawn";

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
