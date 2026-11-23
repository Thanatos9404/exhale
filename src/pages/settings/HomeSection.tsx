import { Segmented } from '@/components/ui/primitives';
import { NumberField, SelectField, ToggleRow } from './fields';
import { COOKING_OPTIONS, HEATING_OPTIONS, HOUR_OPTIONS, PURIFIER_OPTIONS } from './options';
import { SaveFooter, Section } from './Section';
import type { HouseholdForm } from './useHouseholdDraft';

interface HomeSectionProps {
  form: HouseholdForm;
}

/** The home itself: size, filtration, fuels and indoor smoke sources for the indoor model. */
export function HomeSection({ form }: HomeSectionProps) {
  const { draft, errors, patchHome } = form;
  const { home } = draft;
  return (
    <Section
      id="home"
      title="Home"
      description="Feeds the indoor air model for every hour spent at home."
      footer={
        <SaveFooter
          hint="Indoor sources often matter more than the street on a closed-up winter night."
          form={form}
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NumberField
          label="Area kept closed (m²)"
          hint="A 2BHK is about 45 to 60 m²."
          value={home.areaM2}
          min={5}
          max={200}
          error={errors['home.areaM2']}
          onChange={(areaM2) => patchHome({ areaM2 })}
        />
        <SelectField
          label="Air purifier"
          value={home.purifier}
          options={PURIFIER_OPTIONS}
          onChange={(purifier) => patchHome({ purifier })}
        />
        <SelectField
          label="Usually air the house at"
          value={home.airingHour}
          options={HOUR_OPTIONS}
          onChange={(airingHour) => patchHome({ airingHour })}
        />
        <SelectField
          label="Cooking fuel"
          value={home.cooking}
          options={COOKING_OPTIONS}
          onChange={(cooking) => patchHome({ cooking })}
        />
        <SelectField
          label="Heating"
          value={home.heating}
          options={HEATING_OPTIONS}
          onChange={(heating) => patchHome({ heating })}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Draught-proofing</span>
          <Segmented
            label="Draught-proofing"
            value={home.ventilation}
            onChange={(ventilation) => patchHome({ ventilation })}
            options={[
              { value: 'sealed', label: 'Sealed' },
              { value: 'normal', label: 'Typical' },
              { value: 'leaky', label: 'Leaky' },
            ]}
          />
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <ToggleRow
          label="Kitchen exhaust or chimney"
          checked={home.kitchenExhaust}
          onChange={(kitchenExhaust) => patchHome({ kitchenExhaust })}
        />
        <ToggleRow
          label="Incense or dhoop"
          checked={home.incense}
          onChange={(incense) => patchHome({ incense })}
        />
        <ToggleRow
          label="Mosquito coil at night"
          checked={home.mosquitoCoil}
          onChange={(mosquitoCoil) => patchHome({ mosquitoCoil })}
        />
        <ToggleRow
          label="Someone smokes indoors"
          checked={home.indoorSmoking}
          onChange={(indoorSmoking) => patchHome({ indoorSmoking })}
        />
      </div>
    </Section>
  );
}
