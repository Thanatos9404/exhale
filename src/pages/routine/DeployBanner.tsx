/**
 * Notice that stands in for the AI summary on the Routine page. It says why no AI wording is
 * showing (not deployed yet, deploying now, or the rules engine answered) and that the actions
 * below still come from the planning engine.
 */
import { Sparkles } from 'lucide-react';

/** Why there are no AI explanations on screen right now. */
function bannerMessage(building: boolean, deployed: boolean): string {
  if (building)
    return 'Deploying: Gemini is explaining today’s plan for your family. The actions below are already live from the planning engine.';
  if (deployed)
    return 'This deployment used the rules engine because the AI providers were busy. The numbers are identical; only the personal explanations are missing. Redeploy in a minute.';
  return 'Not deployed yet. These actions come straight from the planning engine using live data. Deploy to have Gemini explain each one for your family and add tailored hacks.';
}

interface DeployBannerProps {
  building: boolean;
  deployed: boolean;
}

/** Dashed notice shown in place of the AI summary while it is missing or on its way. */
export function DeployBanner({ building, deployed }: DeployBannerProps) {
  return (
    <div className="mt-6 flex items-start gap-3 rounded-xl border border-dashed border-line-strong p-4 text-[13px] text-muted">
      <Sparkles size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-blue" />
      <p>{bannerMessage(building, deployed)}</p>
    </div>
  );
}
