import type { Preview } from "@storybook/react";
import "../src/styles/globals.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "hsl(222 20% 6%)" },
        { name: "light", value: "#ffffff" },
      ],
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme ?? "dark";
      document.documentElement.setAttribute("data-theme", theme);
      return <Story />;
    },
  ],
  globalTypes: {
    theme: {
      description: "KeenAI theme",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "dark", title: "Dark" },
          { value: "light", title: "Light" },
        ],
        dynamicTitle: true,
      },
    },
  },
};

export default preview;
