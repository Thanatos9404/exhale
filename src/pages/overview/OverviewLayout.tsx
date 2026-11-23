import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Rocket } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/shell/Shell';
import { Button, buttonStyles } from '@/components/ui/Button';
import { useDeployments } from '@/state/Deployments';

interface OverviewLayoutProps {
  children: ReactNode;
  description?: string;
  actions?: ReactNode;
}

/** Page header and body for the overview, shared by its loading, error and ready states. */
export function OverviewLayout({ children, description, actions }: OverviewLayoutProps) {
  return (
    <>
      <PageHeader title="Overview" description={description} actions={actions} />
      <PageBody>{children}</PageBody>
    </>
  );
}

/** Header actions: open the forecast, or deploy today's routine and jump to it. */
export function OverviewActions() {
  const { deploy } = useDeployments();
  const [, navigate] = useLocation();
  const deployRoutine = () => {
    navigate('/routine');
    void deploy();
  };
  return (
    <>
      <Link href="/forecast" className={buttonStyles()}>
        View forecast
      </Link>
      <Button
        variant="primary"
        leading={<Rocket size={15} aria-hidden="true" />}
        onClick={deployRoutine}
      >
        Deploy today’s routine
      </Button>
    </>
  );
}
