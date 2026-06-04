/** Graffiti theme tokens — aligned with dimmed logo palette (Spray Nation) */
export const colors = {
  concrete: "#E5E0D8",
  asphalt: "#1A1A1A",
  terracotta: "#C85A28",
  slateBlue: "#5B7FA8",
  mossGreen: "#6B8F4E",
  dullGold: "#B8953A",
  purpleAccent: "#7A6AAF",
  stickerWhite: "#FAFAF8",
  successGreen: "#0a8f3c",
} as const;

export type GraffitiColor = keyof typeof colors;
