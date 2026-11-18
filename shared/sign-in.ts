export const socialProviders = ["google", "facebook", "github"] as const;
export type SocialProvider = (typeof socialProviders)[number];
export const providerNames: Record<SocialProvider, string> = {
  google: "Google",
  facebook: "Facebook",
  github: "GitHub",
};
