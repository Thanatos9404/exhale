import { NumberField, SelectField, ToggleRow } from './fields';
import { HOUR_OPTIONS, MODE_OPTIONS } from './options';
import { SaveFooter, Section } from './Section';
import type { HouseholdForm } from './useHouseholdDraft';

interface CommuteSectionProps {
  form: HouseholdForm;
}

/** Who commutes, how, how far and when: the inputs for the commute comparison. */
export function CommuteSection({ form }: CommuteSectionProps) {
  const { draft, errors, patchCommute } = form;
  const { commute } = draft;
  const commuters = draft.members.map((m) => ({ value: m.id, label: m.name }));
  return (
    <Section
      id="commute"
      title="Commute"
      description="Compared against every other mode for dose, carbon and time."
      footer={<SaveFooter hint="Times are local to the selected city." form={form} />}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          label="Who commutes"
          value={commute.memberId}
          options={commuters}
          onChange={(memberId) => patchCommute({ memberId })}
        />
        <SelectField
          label="Usual mode"
          value={commute.mode}
          options={MODE_OPTIONS}
          onChange={(mode) => patchCommute({ mode })}
        />
        <NumberField
          label="Distance each way (km)"
          value={commute.distanceKm}
          min={0}
          max={100}
          step={0.5}
          error={errors['commute.distanceKm']}
          onChange={(distanceKm) => patchCommute({ distanceKm })}
        />
        <SelectField
          label="Leaves at"
          value={commute.departHour}
          options={HOUR_OPTIONS}
          onChange={(departHour) => patchCommute({ departHour })}
        />
        <SelectField
          label="Returns at"
          value={commute.returnHour}
          options={HOUR_OPTIONS}
          onChange={(returnHour) => patchCommute({ returnHour })}
        />
        <NumberField
          label="Days a week"
          value={commute.daysPerWeek}
          min={0}
          max={7}
          error={errors['commute.daysPerWeek']}
          onChange={(daysPerWeek) => patchCommute({ daysPerWeek })}
        />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <ToggleRow
          label="Flexible hours"
          hint="Lets the plan shift your departure."
          checked={commute.flexible}
          onChange={(flexible) => patchCommute({ flexible })}
        />
        <ToggleRow
          label="Owns an N95 or FFP2"
          hint="Already counted in today’s dose."
          checked={commute.hasN95}
          onChange={(hasN95) => patchCommute({ hasN95 })}
        />
      </div>
    </Section>
  );
}
