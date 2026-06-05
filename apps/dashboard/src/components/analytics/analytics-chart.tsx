"use client";

import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";

const axisColor = "hsl(240 5% 55%)";
const gridColor = "hsl(240 6% 20%)";

export function AnalyticsChart({
  option,
  height = 260,
}: {
  option: EChartsOption;
  height?: number;
}) {
  return (
    <ReactECharts
      style={{ height, width: "100%" }}
      opts={{ renderer: "svg" }}
      option={{
        textStyle: { color: axisColor, fontFamily: "inherit" },
        ...option,
      }}
    />
  );
}

export function pieOption(input: {
  title: string;
  data: { name: string; value: number }[];
}): EChartsOption {
  return {
    title: {
      text: input.title,
      left: 0,
      textStyle: { fontSize: 12, fontWeight: 500, color: axisColor },
    },
    tooltip: { trigger: "item" },
    series: [
      {
        type: "pie",
        radius: ["42%", "68%"],
        center: ["50%", "58%"],
        data: input.data,
        label: { color: axisColor, fontSize: 11 },
        itemStyle: { borderColor: gridColor, borderWidth: 2 },
      },
    ],
  };
}

export function barOption(input: {
  title: string;
  categories: string[];
  values: number[];
  horizontal?: boolean;
}): EChartsOption {
  const categoryAxis = {
    type: "category" as const,
    data: input.categories,
    axisLabel: {
      color: axisColor,
      fontSize: 10,
      rotate: input.horizontal ? 0 : 35,
      formatter: (value: string) => (value.length > 12 ? `${value.slice(0, 12)}…` : value),
    },
    axisLine: { lineStyle: { color: gridColor } },
  };
  const valueAxis = {
    type: "value" as const,
    axisLabel: { color: axisColor, fontSize: 10 },
    splitLine: { lineStyle: { color: gridColor } },
  };

  return {
    title: {
      text: input.title,
      left: 0,
      textStyle: { fontSize: 12, fontWeight: 500, color: axisColor },
    },
    grid: { left: 8, right: 12, top: 40, bottom: input.horizontal ? 16 : 48, containLabel: true },
    tooltip: { trigger: "axis" },
    xAxis: input.horizontal ? valueAxis : categoryAxis,
    yAxis: input.horizontal ? categoryAxis : valueAxis,
    series: [
      {
        type: "bar",
        data: input.values,
        itemStyle: {
          color: "hsl(262 83% 58%)",
          borderRadius: input.horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
        },
        barMaxWidth: 28,
      },
    ],
  };
}

export function lineOption(input: {
  title: string;
  days: string[];
  values: number[];
}): EChartsOption {
  return {
    title: {
      text: input.title,
      left: 0,
      textStyle: { fontSize: 12, fontWeight: 500, color: axisColor },
    },
    grid: { left: 8, right: 12, top: 40, bottom: 24, containLabel: true },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: input.days.map((day) => day.slice(5)),
      axisLabel: { color: axisColor, fontSize: 10 },
      axisLine: { lineStyle: { color: gridColor } },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: { color: axisColor, fontSize: 10 },
      splitLine: { lineStyle: { color: gridColor } },
    },
    series: [
      {
        type: "line",
        smooth: true,
        data: input.values,
        areaStyle: { color: "hsla(262, 83%, 58%, 0.12)" },
        lineStyle: { color: "hsl(262 83% 58%)", width: 2 },
        itemStyle: { color: "hsl(262 83% 58%)" },
      },
    ],
  };
}
