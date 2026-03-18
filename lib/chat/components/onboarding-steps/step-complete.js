"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useRouter } from "next/navigation";
function StepComplete() {
  const router = useRouter();
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center text-center space-y-6 py-8", children: [
    /* @__PURE__ */ jsx("div", { className: "flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30", children: /* @__PURE__ */ jsx("svg", { className: "h-10 w-10 text-green-600 dark:text-green-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M5 13l4 4L19 7" }) }) }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("h2", { className: "text-2xl font-bold text-zinc-900 dark:text-zinc-100", children: "Onboarding Complete!" }),
      /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-zinc-600 dark:text-zinc-400 max-w-sm", children: "Your ClawForge instance is set up and ready to go. GitHub, Docker, and the agent pipeline are all verified and working. You can now start dispatching jobs from the dashboard." })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex flex-col sm:flex-row gap-3", children: /* @__PURE__ */ jsx(
      "button",
      {
        onClick: () => router.push("/"),
        className: "inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors",
        children: "Go to Dashboard"
      }
    ) })
  ] });
}
export {
  StepComplete as default
};
