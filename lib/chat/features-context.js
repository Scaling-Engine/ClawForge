"use client";
import { jsx } from "react/jsx-runtime";
import { createContext, useContext } from "react";
const FeaturesContext = createContext({});
function FeaturesProvider({ flags = {}, children }) {
  return /* @__PURE__ */ jsx(FeaturesContext.Provider, { value: flags, children });
}
function useFeature(flag) {
  const flags = useContext(FeaturesContext);
  return Boolean(flags[flag]);
}
export {
  FeaturesProvider,
  useFeature
};
