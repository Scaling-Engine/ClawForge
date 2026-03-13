"use client";
import { jsx } from "react/jsx-runtime";
import { createContext, useContext, useState } from "react";
const RepoChatContext = createContext(null);
function RepoChatProvider({ children }) {
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState(null);
  return /* @__PURE__ */ jsx(RepoChatContext.Provider, { value: { selectedRepo, setSelectedRepo, selectedBranch, setSelectedBranch }, children });
}
function useRepoChat() {
  const ctx = useContext(RepoChatContext);
  if (!ctx) {
    return { selectedRepo: null, setSelectedRepo: () => {
    }, selectedBranch: null, setSelectedBranch: () => {
    } };
  }
  return ctx;
}
export {
  RepoChatProvider,
  useRepoChat
};
