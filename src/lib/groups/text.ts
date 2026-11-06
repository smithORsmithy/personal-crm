// Texts about groups shown to people. Pure functions, no database.

import { formatCount, pluralize } from "@/lib/format";

// "3 контакта"
export function formatContactCount(count: number): string {
  return `${formatCount(count)} ${pluralize(count, ["контакт", "контакта", "контактов"])}`;
}

// The line under "Удалить группу «…»?"
export function deleteGroupQuestion(contactCount: number): string {
  if (contactCount === 0) {
    return "В группе никого нет.";
  }
  const verb = pluralize(contactCount, ["выйдет", "выйдут", "выйдут"]);
  return `${formatContactCount(contactCount)} ${verb} из группы. Сами контакты и их заметки останутся.`;
}
