import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "../src/index.js";

const meta: Meta<typeof Input> = {
  title: "Primitives/Input",
  component: Input,
  args: { placeholder: "Search conversations…" },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {};
