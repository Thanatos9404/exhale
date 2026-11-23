import { PageBody, PageHeader } from '@/components/shell/Shell';
import { CommuteSection } from './settings/CommuteSection';
import { DataSection } from './settings/DataSection';
import { GeneralSection } from './settings/GeneralSection';
import { HomeSection } from './settings/HomeSection';
import { MembersSection } from './settings/MembersSection';
import { SettingsNav } from './settings/SettingsNav';
import { useHouseholdDraft } from './settings/useHouseholdDraft';

/** Settings page: edit the household profile that drives every recommendation. */
export default function Settings() {
  const form = useHouseholdDraft();
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your household profile drives every recommendation. It is stored only in this browser."
      />
      <PageBody>
        <div className="grid gap-8 md:grid-cols-[200px_minmax(0,1fr)]">
          <SettingsNav />
          <div className="flex min-w-0 flex-col gap-6">
            <GeneralSection form={form} />
            <MembersSection form={form} />
            <CommuteSection form={form} />
            <HomeSection form={form} />
            <DataSection />
          </div>
        </div>
      </PageBody>
    </>
  );
}
