/**
 * Frame of the Routine page: its header, body and header actions. Kept apart from the page so
 * the loading, error and ready states all render inside the same frame.
 */
import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { Rocket } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/shell/Shell';
import { Button, buttonStyles } from '@/components/ui/Button';
import { deployButtonLabel } from './routineView';

interface RoutineLayoutProps {
  children: ReactNode;
  actions?: ReactNode;
}

/** Page header and body for the routine, shared by its loading, error and ready states. */
export function RoutineLayout({ children, actions }: RoutineLayoutProps) {
  return (
    <>
      <PageHeader
        title="Routine"
        description="Your next 24 hours, re-planned for less smog in your lungs and less from your household."
        actions={actions}
      />
      <PageBody>{children}</PageBody>
    </>
  );
}

interface RoutineActionsProps {
  building: boolean;
  deployed: boolean;
  onDeploy: () => void;
}

/** Header actions: edit the household, or run a (re)deployment. */
export function RoutineActions({ building, deployed, onDeploy }: RoutineActionsProps) {
  return (
    <>
      <Link href="/settings" className={buttonStyles()}>
        Edit household
      </Link>
      <Button
        variant="primary"
        loading={building}
        leading={<Rocket size={15} aria-hidden="true" />}
        onClick={onDeploy}
      >
        {deployButtonLabel(building, deployed)}
      </Button>
    </>
  );
}
