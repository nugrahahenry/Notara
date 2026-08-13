export type PostAuthExperience = 'home' | 'onboarding';

interface OnboardingProfile {
  is_onboarded: boolean;
}

/** Keep routine session restoration quiet; onboard only known unfinished profiles. */
export function getPostAuthExperience(
  profile: OnboardingProfile | null,
): PostAuthExperience {
  return profile?.is_onboarded === false ? 'onboarding' : 'home';
}

