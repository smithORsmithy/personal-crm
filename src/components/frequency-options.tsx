import {
  SelectContent,
  SelectItem,
  SelectSeparator,
} from "@/components/ui/select";
import {
  frequencyLabels,
  NO_FREQUENCY_LABEL,
  regularFrequencies,
} from "@/lib/contacts/frequency";

// The select needs a value for "Не задано" too
export const NO_FREQUENCY_VALUE = "none";

// The choices of "Как часто общаться": the same in the card and in the add
// form, so the two lists never drift apart
export function FrequencyOptions() {
  return (
    <SelectContent align="start" sideOffset={6} alignItemWithTrigger={false}>
      <SelectItem value={NO_FREQUENCY_VALUE}>{NO_FREQUENCY_LABEL}</SelectItem>
      {regularFrequencies.map((value) => (
        <SelectItem key={value} value={value}>
          {frequencyLabels[value]}
        </SelectItem>
      ))}
      <SelectSeparator />
      <SelectItem value="on_date">{frequencyLabels.on_date}</SelectItem>
    </SelectContent>
  );
}
