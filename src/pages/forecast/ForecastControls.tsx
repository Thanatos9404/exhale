/**
 * Header controls of the Forecast page: the AQI standard and how far ahead the chart looks. Both
 * choices are owned by the page; this component only renders the two pickers.
 */
import { Segmented } from '@/components/ui/primitives';
import type { AqiStandard } from '@/lib/air/types';
import type { ForecastRange } from './metrics';

interface ForecastControlsProps {
  standard: AqiStandard;
  onStandardChange: (standard: AqiStandard) => void;
  range: ForecastRange;
  onRangeChange: (range: ForecastRange) => void;
}

/** Header controls for the forecast: which AQI standard to use and how far ahead to look. */
export function ForecastControls({
  standard,
  onStandardChange,
  range,
  onRangeChange,
}: ForecastControlsProps) {
  return (
    <>
      <Segmented<AqiStandard>
        label="AQI standard"
        value={standard}
        onChange={onStandardChange}
        options={[
          { value: 'in', label: 'India NAQI' },
          { value: 'us', label: 'US EPA' },
        ]}
      />
      <Segmented<ForecastRange>
        label="Forecast range"
        value={range}
        onChange={onRangeChange}
        options={[
          { value: '24', label: '24h' },
          { value: '48', label: '48h' },
          { value: '72', label: '72h' },
        ]}
      />
    </>
  );
}
