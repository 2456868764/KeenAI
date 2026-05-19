import type { Meta, StoryObj } from "@storybook/react";
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../src/index.js";

const meta: Meta = {
  title: "Primitives/Sheet",
};

export default meta;
type Story = StoryObj;

export const ContextPanel: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open context</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Customer context</SheetTitle>
        </SheetHeader>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Assignee, tags, and custom fields.
        </p>
      </SheetContent>
    </Sheet>
  ),
};
