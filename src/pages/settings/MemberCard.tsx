/**
 * Editable card for one household member in Settings: who they are, their daily pattern and
 * their health conditions.
 */
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Member } from '@/lib/profile/schema';
import { NumberField, SelectField, TextField } from './fields';
import { toggleCondition, type FieldErrors } from './householdEdits';
import {
  AGE_GROUP_OPTIONS,
  CONDITIONS,
  DAYTIME_OPTIONS,
  EXERCISE_OPTIONS,
  HOUR_OPTIONS,
} from './options';

interface MemberCardProps {
  member: Member;
  /** Position in the household, from 0. */
  index: number;
  errors: FieldErrors;
  canRemove: boolean;
  onPatch: (patch: Partial<Member>) => void;
  onRemove: () => void;
}

type MemberFieldsProps = Pick<MemberCardProps, 'member' | 'index' | 'errors' | 'onPatch'>;

/** Name, age group, daytime place and the exercise habit of one person. */
function MemberFields({ member, index, errors, onPatch }: MemberFieldsProps) {
  const resting = member.exercise === 'none';
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <TextField
        label="Name"
        value={member.name}
        maxLength={32}
        error={errors[`members.${index}.name`]}
        onChange={(name) => onPatch({ name })}
      />
      <SelectField
        label="Age group"
        value={member.ageGroup}
        options={AGE_GROUP_OPTIONS}
        onChange={(ageGroup) => onPatch({ ageGroup })}
      />
      <SelectField
        label="Daytime"
        value={member.daytime}
        options={DAYTIME_OPTIONS}
        onChange={(daytime) => onPatch({ daytime })}
      />
      <SelectField
        label="Exercise"
        value={member.exercise}
        options={EXERCISE_OPTIONS}
        onChange={(exercise) => onPatch({ exercise })}
      />
      <SelectField
        label="Usually at"
        value={member.exerciseHour}
        options={HOUR_OPTIONS}
        disabled={resting}
        onChange={(exerciseHour) => onPatch({ exerciseHour })}
      />
      <NumberField
        label="Minutes"
        value={member.exerciseMinutes}
        min={0}
        max={240}
        error={errors[`members.${index}.exerciseMinutes`]}
        disabled={resting}
        onChange={(exerciseMinutes) => onPatch({ exerciseMinutes })}
      />
    </div>
  );
}

/** Editable card for one person: who they are, their daily pattern and health conditions. */
export function MemberCard({
  member,
  index,
  errors,
  canRemove,
  onPatch,
  onRemove,
}: MemberCardProps) {
  const position = index + 1;
  return (
    <li className="rounded-lg border border-line p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-fg">Person {position}</span>
        <Button
          size="sm"
          variant="tertiary"
          leading={<Trash2 size={13} aria-hidden="true" />}
          disabled={!canRemove}
          onClick={onRemove}
          aria-label={`Remove ${member.name || `person ${position}`}`}
        >
          Remove
        </Button>
      </div>
      <MemberFields member={member} index={index} errors={errors} onPatch={onPatch} />
      <ConditionsFieldset
        conditions={member.conditions}
        onChange={(conditions) => onPatch({ conditions })}
      />
    </li>
  );
}

interface ConditionsFieldsetProps {
  conditions: Member['conditions'];
  onChange: (conditions: Member['conditions']) => void;
}

/** Checkbox group for the health conditions that lower a person's outdoor limit. */
function ConditionsFieldset({ conditions, onChange }: ConditionsFieldsetProps) {
  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-[13px] font-medium text-muted">Health conditions</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {CONDITIONS.map((c) => (
          <label key={c.value} className="inline-flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              className="size-4 accent-[var(--fg)]"
              checked={conditions.includes(c.value)}
              onChange={(e) => onChange(toggleCondition(conditions, c.value, e.target.checked))}
            />
            {c.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
