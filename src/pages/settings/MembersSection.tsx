/**
 * Members section of Settings: one card per person, with adding and removing kept inside the
 * schema's limits.
 */
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { MemberCard } from './MemberCard';
import { MAX_MEMBERS } from './options';
import { SaveFooter, Section } from './Section';
import type { HouseholdForm } from './useHouseholdDraft';

interface MembersSectionProps {
  form: HouseholdForm;
}

/** The people in the household, with add and remove within the schema's limits. */
export function MembersSection({ form }: MembersSectionProps) {
  const { draft, errors } = form;
  const count = draft.members.length;
  return (
    <Section
      id="people"
      title="People"
      description="Age and health conditions set each person's outdoor limit."
      footer={<SaveFooter hint={`${count} of ${MAX_MEMBERS} people`} form={form} />}
    >
      <ul className="space-y-4">
        {draft.members.map((member, index) => (
          <MemberCard
            key={member.id}
            member={member}
            index={index}
            errors={errors}
            canRemove={count > 1}
            onPatch={(patch) => form.patchMember(member.id, patch)}
            onRemove={() => form.removeMember(member.id)}
          />
        ))}
      </ul>
      <div className="mt-4">
        <Button
          size="sm"
          leading={<Plus size={14} aria-hidden="true" />}
          disabled={count >= MAX_MEMBERS}
          onClick={form.addMember}
        >
          Add person
        </Button>
      </div>
    </Section>
  );
}
