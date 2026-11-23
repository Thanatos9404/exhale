import { Segmented } from '@/components/ui/primitives';
import { TextField } from './fields';
import { SaveFooter, Section } from './Section';
import type { HouseholdForm } from './useHouseholdDraft';

interface GeneralSectionProps {
  form: HouseholdForm;
}

/** Household name and the AQI scale every reading is shown in. */
export function GeneralSection({ form }: GeneralSectionProps) {
  const { draft, errors, patch } = form;
  return (
    <Section
      id="general"
      title="General"
      description="How your household appears and which AQI scale you read."
      footer={<SaveFooter hint="Names are labels only; use anything you like." form={form} />}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Household name"
          value={draft.name}
          maxLength={40}
          error={errors.name}
          onChange={(name) => patch({ name })}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">AQI standard</span>
          <Segmented
            label="AQI standard"
            value={draft.standard}
            onChange={(standard) => patch({ standard })}
            options={[
              { value: 'in', label: 'India NAQI' },
              { value: 'us', label: 'US EPA' },
            ]}
          />
        </div>
      </div>
    </Section>
  );
}
