"use client";

import type { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { useOptimistic, useState, useTransition } from "react";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { listFieldItems } from "@/lib/groups/match";
import { GROUP_NAME_MAX_LENGTH } from "@/lib/groups/names";

export type FieldGroup = { id: number; name: string };

type GroupResult = { error?: string };

// What the field does with a change depends on where it stands
type Mode =
  | {
      // In the card: every change is saved at once, one group at a time
      mode: "card";
      add: (groupId: number) => Promise<GroupResult>;
      remove: (groupId: number) => Promise<GroupResult>;
      create: (name: string) => Promise<GroupResult>;
    }
  | {
      // In a form: changes wait for "Сохранить" and travel in hidden fields
      mode: "form";
      // New groups typed in the form; they are created on "Сохранить"
      newNames?: string[];
    };

// A label in the field: an existing group ("g:3") or a new one ("n:Йога")
type Chip = { value: string; label: string };

const CREATE_VALUE = "create";

const groupChip = (group: FieldGroup): Chip => ({
  value: `g:${group.id}`,
  label: group.name,
});

const newChip = (name: string): Chip => ({ value: `n:${name}`, label: name });

type OptimisticAction =
  | { type: "add"; chip: Chip }
  | { type: "remove"; value: string };

function reduceChips(chips: Chip[], action: OptimisticAction): Chip[] {
  if (action.type === "add") {
    return chips.some((chip) => chip.value === action.chip.value)
      ? chips
      : [...chips, action.chip];
  }
  return chips.filter((chip) => chip.value !== action.value);
}

// The "Группы" field: labels of the person's groups, and a box to find a
// group by typing, pick it, or create a new one. The same field is used in
// the card and in the add/edit forms.
export function GroupsField({
  groups,
  selected,
  id = "groups-field",
  ...props
}: {
  // All groups, in alphabetical order
  groups: FieldGroup[];
  // The groups of the person
  selected: FieldGroup[];
  id?: string;
} & Mode) {
  const anchor = useComboboxAnchor();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();

  // Labels in the order of the common list, new groups after them
  const savedChips = [
    ...groups.filter((group) => selected.some((item) => item.id === group.id)),
    ...selected.filter((item) => !groups.some((group) => group.id === item.id)),
  ].map(groupChip);
  const initialChips =
    props.mode === "form"
      ? [...savedChips, ...(props.newNames ?? []).map(newChip)]
      : savedChips;

  // Card: the change shows at once while it is being saved; on error the
  // saved labels come back by themselves
  const [optimisticChips, applyOptimistic] = useOptimistic(
    initialChips,
    reduceChips,
  );
  // Form: the labels are the form's own state until "Сохранить"
  const [formChips, setFormChips] = useState(initialChips);
  const chips = props.mode === "form" ? formChips : optimisticChips;

  const items: Chip[] = listFieldItems(groups, query).map((item) =>
    item.kind === "group"
      ? groupChip(item.group)
      : { value: CREATE_VALUE, label: `Создать группу «${item.name}»` },
  );

  function changeQuery(
    value: string,
    details: ComboboxPrimitive.Root.ChangeEventDetails,
  ) {
    // The library wipes the typed text whenever the list closes. In a form
    // that text is saved with "Сохранить", and a click on it closes the list
    // first, so keep the text then. Picking an item and Esc still wipe it.
    const wipedOnClose =
      details.reason === "input-clear" &&
      !details.isItemPress &&
      !(details.event instanceof KeyboardEvent && details.event.key === "Escape");
    if (props.mode === "form" && wipedOnClose) {
      return;
    }
    setQuery(value);
  }

  function change(
    next: Chip[],
    details: ComboboxPrimitive.Root.ChangeEventDetails,
  ) {
    // Esc with the list closed clears the whole choice in the library.
    // Here Esc only closes the list and wipes the typed text.
    if (details.reason === "escape-key") {
      details.cancel();
      return;
    }
    // Enter only adds. On a group the person is in already, the library
    // would take it off, as a click does: keep it, just wipe the text.
    if (details.event?.type === "keydown" && next.length < chips.length) {
      details.cancel();
      setQuery("");
      return;
    }

    setError(undefined);
    const nextValues = new Set(next.map((chip) => chip.value));
    const added = next.filter(
      (chip) => !chips.some((old) => old.value === chip.value),
    );
    const removed = chips.filter((old) => !nextValues.has(old.value));

    // "Создать группу «…»" was picked
    if (added.some((chip) => chip.value === CREATE_VALUE)) {
      createGroup(query.trim());
      return;
    }
    if (props.mode === "form") {
      // The whole new list at once, so several changes in one event
      // do not overwrite each other
      setFormChips(next);
      return;
    }
    for (const chip of added) {
      addGroup(chip);
    }
    for (const chip of removed) {
      removeGroup(chip);
    }
  }

  function createGroup(name: string) {
    if (props.mode === "form") {
      // Same name as one already added: nothing new
      const known = formChips.some(
        (chip) => chip.label.toLowerCase() === name.toLowerCase(),
      );
      if (!known) {
        setFormChips([...formChips, newChip(name)]);
      }
      return;
    }
    const { create } = props;
    startTransition(async () => {
      applyOptimistic({ type: "add", chip: newChip(name) });
      const result = await create(name);
      if (result.error) {
        setError(result.error);
      }
    });
  }

  // Card only: the form keeps its labels in its own state
  function addGroup(chip: Chip) {
    if (props.mode === "form") {
      return;
    }
    const { add } = props;
    startTransition(async () => {
      applyOptimistic({ type: "add", chip });
      const result = await add(Number(chip.value.slice(2)));
      if (result.error) {
        setError(result.error);
      }
    });
  }

  function removeGroup(chip: Chip) {
    if (props.mode === "form") {
      return;
    }
    const { remove } = props;
    startTransition(async () => {
      applyOptimistic({ type: "remove", value: chip.value });
      const result = await remove(Number(chip.value.slice(2)));
      if (result.error) {
        setError(result.error);
      }
    });
  }

  // In a form the field is state, not an action: the chosen groups go with
  // the form as hidden fields. A name typed and not picked goes too, as one
  // more new group: the server finds a group with that name or creates it.
  // Picking an item wipes the text, so a picked group is not sent twice.
  const formFields =
    props.mode === "form" ? (
      <>
        {formChips.map((chip) => (
          <input
            key={chip.value}
            type="hidden"
            name={chip.value.startsWith("g:") ? "groupId" : "newGroup"}
            value={chip.value.slice(2)}
          />
        ))}
        <input type="hidden" name="newGroup" value={query} />
      </>
    ) : null;

  return (
    <div className="flex flex-col gap-2">
      {formFields}
      <Combobox
        multiple
        items={[...groups.map(groupChip), ...items.filter((item) => item.value === CREATE_VALUE)]}
        filteredItems={items}
        value={chips}
        onValueChange={change}
        inputValue={query}
        onInputValueChange={changeQuery}
        itemToStringLabel={(item: Chip) => item.label}
        isItemEqualToValue={(item: Chip, value: Chip) => item.value === value.value}
        // Typing sorts the list by itself: no second filter on top of ours
        filter={null}
        // While text is typed the first item is highlighted, and Enter
        // picks it; with nothing typed nothing is highlighted
        autoHighlight
      >
        <ComboboxChips ref={anchor}>
          {chips.map((chip) => (
            <ComboboxChip
              key={chip.value}
              removeLabel={`Убрать из группы «${chip.label}»`}
            >
              {chip.label}
            </ComboboxChip>
          ))}
          <ComboboxChipsInput
            id={id}
            aria-label="Группы"
            placeholder={chips.length === 0 ? "Найти или создать группу" : ""}
            maxLength={GROUP_NAME_MAX_LENGTH}
            autoComplete="off"
            aria-describedby={error ? `${id}-error` : undefined}
            onKeyDown={(event) => {
              // Enter here never sends the form: with nothing highlighted
              // the library lets it through on purpose. Picking an item by
              // Enter still works: only preventBaseUIHandler() would stop it.
              if (event.key === "Enter") {
                event.preventDefault();
              }
            }}
          />
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>Групп не найдено</ComboboxEmpty>
          <ComboboxList>
            {(item: Chip) => (
              <ComboboxItem key={item.value} value={item}>
                {item.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
