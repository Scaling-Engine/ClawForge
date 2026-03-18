"use client";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { verifyOnboardingDocker } from "../../actions.js";
function StepDocker({ onStepComplete }) {
  const [status, setStatus] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  async function handleVerify() {
    setStatus("loading");
    setErrorMsg("");
    try {
      const result = await verifyOnboardingDocker();
      if (result.success) {
        setStatus("success");
        setTimeout(() => onStepComplete("docker_verify"), 1500);
      } else {
        setErrorMsg(result.error || "Verification failed");
        setStatus("error");
      }
    } catch (err) {
      setErrorMsg(err.message || "Unexpected error");
      setStatus("error");
    }
  }
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2", children: "Docker Connection" }),
      /* @__PURE__ */ jsx("p", { className: "text-sm text-zinc-600 dark:text-zinc-400", children: "Verify the Docker daemon is running and accessible via the Unix socket. ClawForge uses Docker to run isolated job containers for each agent task." })
    ] }),
    status === "success" && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3", children: [
      /* @__PURE__ */ jsx("svg", { className: "h-5 w-5 text-green-500 shrink-0", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M5 13l4 4L19 7" }) }),
      /* @__PURE__ */ jsx("p", { className: "text-sm text-green-700 dark:text-green-300", children: "Docker daemon is running \u2014 advancing to next step..." })
    ] }),
    status === "error" && /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3", children: [
      /* @__PURE__ */ jsx("svg", { className: "h-5 w-5 text-red-500 shrink-0 mt-0.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M6 18L18 6M6 6l12 12" }) }),
      /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
        /* @__PURE__ */ jsx("p", { className: "text-sm text-red-700 dark:text-red-300", children: errorMsg }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-red-500 dark:text-red-400 mt-1", children: "Make sure Docker Desktop (or Docker Engine) is running on this machine." })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex gap-3", children: [
      status !== "success" && /* @__PURE__ */ jsx(
        "button",
        {
          onClick: handleVerify,
          disabled: status === "loading",
          className: "inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
          children: status === "loading" ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsxs("svg", { className: "h-4 w-4 animate-spin", fill: "none", viewBox: "0 0 24 24", children: [
              /* @__PURE__ */ jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }),
              /* @__PURE__ */ jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })
            ] }),
            "Verifying..."
          ] }) : "Verify Docker Connection"
        }
      ),
      status === "error" && /* @__PURE__ */ jsx(
        "button",
        {
          onClick: handleVerify,
          className: "inline-flex items-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-600 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors",
          children: "Retry"
        }
      )
    ] })
  ] });
}
export {
  StepDocker as default
};
