import * as React from "react";
// import * as RechartsPrimitive from "recharts";

import { cn } from "./utils";

const ChartContext = React.createContext<any>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: any;
    children: React.ComponentProps<"div">["children"];
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        ref={ref}
        className={cn(
          "flex aspect-video justify-center text-xs",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        {/* Placeholder for ResponsiveContainer */}
        <div className="w-full h-full">
            {children}
        </div>
      </div>
    </ChartContext.Provider>
  );
});
ChartContainer.displayName = "Chart";

const ChartStyle = ({ id, config }: { id: string; config: any }) => {
  const colorConfig = Object.entries(config).filter(
    ([_, config]) => (config as any).theme || (config as any).color
  );

  if (!colorConfig.length) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(config)
            .map(([key, item]: any) => {
                const color = item.theme || item.color;
                return color ? `[data-chart=${id}] { --color-${key}: ${color}; }` : "";
            })
            .join("\n"),
      }}
    />
  );
};

const ChartTooltip = ({ children }: any) => {
    return <div className="hidden">{children}</div>;
};

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: "line" | "dot" | "dashed";
    nameKey?: string;
    labelKey?: string;
  }
>(({ active, payload, className, indicator = "dot", hideLabel = false, hideIndicator = false, label, labelFormatter, labelClassName, formatter, color, nameKey, labelKey }, ref) => {
  return <div ref={ref} className={className}>Tooltip Placeholder</div>
});
ChartTooltipContent.displayName = "ChartTooltip";

const ChartLegend = ({ children }: any) => {
    return <div className="hidden">{children}</div>;
};

const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    hideIcon?: boolean;
    nameKey?: string;
    verticalAlign?: "top" | "bottom"; // Pick<RechartsPrimitive.LegendProps, "verticalAlign">
  }
>(({ className, hideIcon = false, payload, verticalAlign = "bottom", nameKey }, ref) => {
    return <div ref={ref} className={className}>Legend Placeholder</div>
});
ChartLegendContent.displayName = "ChartLegend";

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
};
