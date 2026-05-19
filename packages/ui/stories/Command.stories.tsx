import type { Meta, StoryObj } from "@storybook/react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../src/index.js";

const meta: Meta = {
  title: "Primitives/Command",
};

export default meta;
type Story = StoryObj;

export const CmdK: Story = {
  render: () => (
    <Command className="w-[420px]">
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Inbox">
          <CommandItem>Assign to me</CommandItem>
          <CommandItem>Snooze 1 hour</CommandItem>
          <CommandItem>Close conversation</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};
